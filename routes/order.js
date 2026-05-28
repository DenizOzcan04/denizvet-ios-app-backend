import express from "express";
import mongoose from "mongoose";
import Stripe from "stripe";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import auth from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();
const orderStatuses = ["pending", "confirmed", "preparing", "shipped", "delivered", "cancelled"];
const paymentStatuses = ["unpaid", "paid", "failed", "refunded"];

function getStripeClient() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
  return stripeSecretKey ? new Stripe(stripeSecretKey) : null;
}

function getStripeWebhookSecret() {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
  return webhookSecret.trim();
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function getStripeEventIds(order) {
  return Array.isArray(order?.stripeEventIds) ? order.stripeEventIds : [];
}

function hasProcessedStripeEvent(order, eventId) {
  return Boolean(eventId) && getStripeEventIds(order).includes(eventId);
}

function appendStripeEventId(order, eventId) {
  if (!eventId) {
    return;
  }

  const eventIds = getStripeEventIds(order);
  if (!eventIds.includes(eventId)) {
    order.stripeEventIds = [...eventIds, eventId];
  }
}

function normalizeItems(items = []) {
  const merged = new Map();

  for (const rawItem of items) {
    const productId = String(rawItem?.productId || "").trim();
    const quantity = Number(rawItem?.quantity);

    if (!productId) {
      return { ok: false, message: "Her siparis kaleminde productId zorunludur." };
    }

    if (!isValidObjectId(productId)) {
      return { ok: false, message: "Gecersiz urun kimligi gonderildi." };
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      return { ok: false, message: "Urun adedi en az 1 olmali ve tam sayi olmalidir." };
    }

    merged.set(productId, (merged.get(productId) || 0) + quantity);
  }

  return {
    ok: true,
    items: Array.from(merged.entries()).map(([productId, quantity]) => ({
      productId,
      quantity,
    })),
  };
}

async function buildOrderItems(items = []) {
  const productIds = items.map((item) => item.productId);
  const products = await Product.find({ _id: { $in: productIds } });
  const productMap = new Map(products.map((product) => [product._id.toString(), product]));
  const orderItems = [];

  for (const item of items) {
    const product = productMap.get(item.productId);

    if (!product) {
      return { ok: false, status: 404, message: "Urun bulunamadi." };
    }

    if (!product.isActive) {
      return { ok: false, status: 400, message: `${product.name} su anda siparise acik degil.` };
    }

    if (product.stock <= 0) {
      return { ok: false, status: 400, message: `${product.name} stokta bulunmuyor.` };
    }

    if (item.quantity > product.stock) {
      return {
        ok: false,
        status: 400,
        message: `${product.name} icin en fazla ${product.stock} adet siparis verebilirsiniz.`,
      };
    }

    const unitPrice = roundMoney(product.price);
    const lineTotal = roundMoney(unitPrice * item.quantity);

    orderItems.push({
      product: product._id,
      name: product.name,
      imageUrl: product.imageUrl || "",
      category: product.category || "",
      animalType: product.animalType || "general",
      unitPrice,
      quantity: item.quantity,
      lineTotal,
    });
  }

  return { ok: true, items: orderItems };
}

async function createPendingOrderFromRequest(req) {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) {
    return {
      ok: false,
      status: 400,
      message: "Siparis olusturmak icin en az bir urun eklemelisiniz.",
    };
  }

  const normalizedItems = normalizeItems(items);
  if (!normalizedItems.ok) {
    return { ok: false, status: 400, message: normalizedItems.message };
  }

  const builtItems = await buildOrderItems(normalizedItems.items);
  if (!builtItems.ok) {
    return builtItems;
  }

  const totalAmount = roundMoney(
    builtItems.items.reduce((sum, item) => sum + item.lineTotal, 0)
  );

  const order = await Order.create({
    user: req.user.id,
    items: builtItems.items,
    totalAmount,
    shippingAddress: String(req.body?.shippingAddress || "").trim(),
    note: String(req.body?.note || "").trim(),
    status: "pending",
    paymentStatus: "unpaid",
    paymentProvider: "stripe",
  });

  return { ok: true, order, totalAmount };
}

async function findOrderForPaymentIntent(paymentIntent) {
  const metadataOrderId = String(paymentIntent?.metadata?.orderId || "").trim();

  if (metadataOrderId && isValidObjectId(metadataOrderId)) {
    const byMetadata = await Order.findById(metadataOrderId);
    if (byMetadata) {
      return byMetadata;
    }
  }

  const paymentIntentId = String(paymentIntent?.id || "").trim();
  if (!paymentIntentId) {
    return null;
  }

  return Order.findOne({ stripePaymentIntentId: paymentIntentId });
}

async function decreaseOrderStockOnce(order) {
  if (order.stockDecreased) {
    return { ok: true };
  }

  for (const item of order.items) {
    const updateResult = await Product.updateOne(
      {
        _id: item.product,
        stock: { $gte: item.quantity },
      },
      {
        $inc: { stock: -item.quantity },
      }
    );

    if (updateResult.modifiedCount !== 1) {
      return {
        ok: false,
        reason: `${item.name} icin stok dusurulemedi.`,
      };
    }
  }

  order.stockDecreased = true;
  return { ok: true };
}

async function handlePaymentIntentSucceeded(paymentIntent, event) {
  const paymentIntentId = String(paymentIntent?.id || "").trim();
  const metadataOrderId = String(paymentIntent?.metadata?.orderId || "").trim();
  const order = await findOrderForPaymentIntent(paymentIntent);

  console.log(
    "[stripe-webhook] payment_intent.succeeded:start",
    JSON.stringify({
      paymentIntentId,
      metadataOrderIdPresent: Boolean(metadataOrderId),
      orderFound: Boolean(order),
    })
  );

  if (!order) {
    return;
  }

  if (hasProcessedStripeEvent(order, event.id) || (order.paymentStatus === "paid" && order.stockDecreased)) {
    console.log(
      "[stripe-webhook] payment_intent.succeeded:skip",
      JSON.stringify({
        paymentIntentId,
        orderId: order._id.toString(),
        paymentStatus: order.paymentStatus,
        stockDecreased: Boolean(order.stockDecreased),
        alreadyProcessedEvent: hasProcessedStripeEvent(order, event.id),
      })
    );
    return;
  }

  const expectedAmount = Math.round(order.totalAmount * 100);
  const receivedAmount = Number(paymentIntent.amount_received || paymentIntent.amount || 0);

  console.log(
    "[stripe-webhook] payment_intent.succeeded:amount-check",
    JSON.stringify({
      paymentIntentId,
      orderId: order._id.toString(),
      expectedAmount,
      stripeAmount: receivedAmount,
      stockDecreased: Boolean(order.stockDecreased),
      itemCount: Array.isArray(order.items) ? order.items.length : 0,
    })
  );

  if (expectedAmount !== receivedAmount) {
    order.paymentStatus = "failed";
    order.paymentFailureReason = "Odeme tutari siparis toplami ile eslesmedi.";
    appendStripeEventId(order, event.id);
    if (!order.stripePaymentIntentId) {
      order.stripePaymentIntentId = paymentIntentId;
    }
    await order.save();
    return;
  }

  if (!order.stripePaymentIntentId) {
    order.stripePaymentIntentId = paymentIntentId;
  }

  order.paymentStatus = "paid";
  order.status = "confirmed";
  order.paidAt = new Date();
  order.paymentFailureReason = "";

  const stockResult = await decreaseOrderStockOnce(order);
  if (!stockResult.ok) {
    order.paymentFailureReason = stockResult.reason || "Stok dusurme sirasinda bir sorun olustu.";
  }

  appendStripeEventId(order, event.id);

  await order.save();

  console.log(
    "[stripe-webhook] payment_intent.succeeded:done",
    JSON.stringify({
      paymentIntentId,
      orderId: order._id.toString(),
      paymentStatus: order.paymentStatus,
      status: order.status,
      stockDecreased: Boolean(order.stockDecreased),
    })
  );
}

async function handlePaymentIntentFailed(paymentIntent, event) {
  const paymentIntentId = String(paymentIntent?.id || "").trim();
  const order = await findOrderForPaymentIntent(paymentIntent);

  console.log(
    "[stripe-webhook] payment_intent.payment_failed:start",
    JSON.stringify({
      paymentIntentId,
      metadataOrderIdPresent: Boolean(String(paymentIntent?.metadata?.orderId || "").trim()),
      orderFound: Boolean(order),
    })
  );

  if (!order) {
    return;
  }

  if (hasProcessedStripeEvent(order, event.id)) {
    return;
  }

  if (!order.stripePaymentIntentId) {
    order.stripePaymentIntentId = paymentIntentId;
  }

  order.paymentStatus = "failed";
  order.paymentFailureReason =
    String(paymentIntent?.last_payment_error?.message || "").trim() || "Odeme basarisiz oldu.";
  appendStripeEventId(order, event.id);
  await order.save();
}

export async function orderStripeWebhookHandler(req, res) {
  const stripe = getStripeClient();
  const webhookSecret = getStripeWebhookSecret();

  if (!stripe || !webhookSecret) {
    return res.status(500).json({ message: "Stripe webhook ayarlari eksik." });
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).json({ message: "Stripe signature eksik." });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error) {
    return res.status(400).json({ message: "Gecersiz Stripe webhook imzasi." });
  }

  console.log(
    "[stripe-webhook] received",
    JSON.stringify({
      eventType: event.type,
      eventId: event.id,
      paymentIntentId: String(event?.data?.object?.id || "").trim(),
      metadataOrderIdPresent: Boolean(
        String(event?.data?.object?.metadata?.orderId || "").trim()
      ),
    })
  );

  try {
    if (event.type === "payment_intent.succeeded") {
      await handlePaymentIntentSucceeded(event.data.object, event);
    } else if (event.type === "payment_intent.payment_failed") {
      await handlePaymentIntentFailed(event.data.object, event);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Stripe webhook process error:", error);
    return res.status(500).json({ message: "Stripe webhook islenemedi." });
  }
}

router.post("/", auth, async (req, res) => {
  try {
    const result = await createPendingOrderFromRequest(req);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }

    return res.status(201).json(result.order);
  } catch (error) {
    console.error("Order create error:", error);
    return res.status(500).json({ message: "Siparis olusturulurken bir hata olustu." });
  }
});

router.post("/create-payment-intent", auth, async (req, res) => {
  const stripe = getStripeClient();
  if (!stripe) {
    return res.status(500).json({ message: "Stripe ayarlari eksik." });
  }

  try {
    const result = await createPendingOrderFromRequest(req);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(result.totalAmount * 100),
      currency: "try",
      metadata: {
        orderId: result.order._id.toString(),
        userId: req.user.id,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    result.order.stripePaymentIntentId = paymentIntent.id;
    await result.order.save();

    return res.status(200).json({
      orderId: result.order._id,
      paymentIntentClientSecret: paymentIntent.client_secret,
      amount: result.totalAmount,
      currency: result.order.currency,
    });
  } catch (error) {
    console.error("Create payment intent error:", error);
    return res.status(500).json({ message: "Odeme baslatilirken bir hata olustu." });
  }
});

router.get("/my-orders", auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
    return res.status(200).json(orders);
  } catch (error) {
    console.error("My orders list error:", error);
    return res.status(500).json({ message: "Siparisler yuklenirken bir hata olustu." });
  }
});

router.get("/admin", auth, adminMiddleware, async (req, res) => {
  try {
    const filters = {};
    const status = String(req.query?.status || "").trim();
    const paymentStatus = String(req.query?.paymentStatus || "").trim();

    if (status && orderStatuses.includes(status)) {
      filters.status = status;
    }

    if (paymentStatus && paymentStatuses.includes(paymentStatus)) {
      filters.paymentStatus = paymentStatus;
    }

    const orders = await Order.find(filters).sort({ createdAt: -1 });
    return res.status(200).json(orders);
  } catch (error) {
    console.error("Admin orders list error:", error);
    return res.status(500).json({ message: "Siparisler yuklenirken bir hata olustu." });
  }
});

router.patch("/:id/status", auth, adminMiddleware, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Siparis bulunamadi." });
  }

  const status = String(req.body?.status || "").trim();
  if (!orderStatuses.includes(status)) {
    return res.status(400).json({ message: "Gecersiz siparis durumu gonderildi." });
  }

  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!order) {
      return res.status(404).json({ message: "Siparis bulunamadi." });
    }

    return res.status(200).json({ message: "Siparis durumu guncellendi.", order });
  } catch (error) {
    console.error("Order status update error:", error);
    return res.status(500).json({ message: "Siparis durumu guncellenirken bir hata olustu." });
  }
});

router.get("/:id", auth, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Siparis bulunamadi." });
  }

  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Siparis bulunamadi." });
    }

    if (req.user.role !== "admin" && order.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Bu siparise erisim yetkiniz yok." });
    }

    return res.status(200).json(order);
  } catch (error) {
    console.error("Order detail error:", error);
    return res.status(500).json({ message: "Siparis detaylari alinirken bir hata olustu." });
  }
});

export default router;
