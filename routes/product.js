import express from "express";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import auth from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();
const animalTypes = ["cat", "dog", "bird", "fish", "general"];

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return null;
}

function normalizeSort(sort) {
  switch (String(sort || "").trim()) {
    case "price_asc":
      return { price: 1, createdAt: -1 };
    case "price_desc":
      return { price: -1, createdAt: -1 };
    case "default":
    case "newest":
    case "":
      return { createdAt: -1 };
    default:
      return { createdAt: -1 };
  }
}

function buildListFilters(query = {}, { includeInactive = false } = {}) {
  const filters = {};

  if (!includeInactive) {
    filters.isActive = true;
  }

  const search = String(query.search || "").trim();
  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    filters.$or = [{ name: regex }, { description: regex }];
  }

  const category = String(query.category || "").trim();
  if (category) {
    filters.category = new RegExp(`^${escapeRegex(category)}$`, "i");
  }

  const animalType = String(query.animalType || "").trim().toLowerCase();
  if (animalType) {
    filters.animalType = animalType;
  }

  const featured = parseBoolean(query.featured);
  if (featured !== null) {
    filters.featured = featured;
  }

  if (includeInactive) {
    const isActive = parseBoolean(query.isActive);
    if (isActive !== null) {
      filters.isActive = isActive;
    }
  }

  return filters;
}

function sanitizeProductPayload(body = {}, { partial = false } = {}) {
  const payload = {};

  if (Object.hasOwn(body, "name")) {
    payload.name = String(body.name || "").trim();
  }

  if (Object.hasOwn(body, "description")) {
    payload.description = String(body.description || "").trim();
  }

  if (Object.hasOwn(body, "imageUrl")) {
    payload.imageUrl = String(body.imageUrl || "").trim();
  }

  if (Object.hasOwn(body, "category")) {
    payload.category = String(body.category || "").trim();
  }

  if (Object.hasOwn(body, "animalType")) {
    payload.animalType = String(body.animalType || "")
      .trim()
      .toLowerCase();
  }

  if (Object.hasOwn(body, "price")) {
    payload.price = Number(body.price);
  }

  if (Object.hasOwn(body, "stock")) {
    payload.stock = Number(body.stock);
  }

  if (Object.hasOwn(body, "isActive")) {
    payload.isActive = parseBoolean(body.isActive);
  }

  if (Object.hasOwn(body, "featured")) {
    payload.featured = parseBoolean(body.featured);
  }

  if (!partial) {
    if (!payload.name) {
      return { ok: false, message: "Ürün adı zorunludur." };
    }

    if (!payload.description) {
      return { ok: false, message: "Ürün açıklaması zorunludur." };
    }

    if (!payload.category) {
      return { ok: false, message: "Kategori zorunludur." };
    }
  }

  if (Object.hasOwn(payload, "price")) {
    if (!Number.isFinite(payload.price) || payload.price < 0) {
      return { ok: false, message: "Fiyat geçerli bir sayı olmalı ve 0'dan küçük olamaz." };
    }
  } else if (!partial) {
    return { ok: false, message: "Fiyat zorunludur." };
  }

  if (Object.hasOwn(payload, "stock")) {
    if (!Number.isFinite(payload.stock) || payload.stock < 0) {
      return { ok: false, message: "Stok geçerli bir sayı olmalı ve 0'dan küçük olamaz." };
    }
  } else if (!partial) {
    return { ok: false, message: "Stok zorunludur." };
  }

  if (Object.hasOwn(payload, "animalType")) {
    if (!animalTypes.includes(payload.animalType)) {
      return { ok: false, message: "Geçersiz hayvan türü seçildi." };
    }
  } else if (!partial) {
    payload.animalType = "general";
  }

  if (Object.hasOwn(payload, "isActive") && payload.isActive === null) {
    return { ok: false, message: "isActive alanı true veya false olmalıdır." };
  }

  if (Object.hasOwn(payload, "featured") && payload.featured === null) {
    return { ok: false, message: "featured alanı true veya false olmalıdır." };
  }

  if (!partial) {
    if (!Object.hasOwn(payload, "isActive")) {
      payload.isActive = true;
    }

    if (!Object.hasOwn(payload, "featured")) {
      payload.featured = false;
    }
  }

  return { ok: true, payload };
}

function ensureValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

router.get("/", async (req, res) => {
  try {
    const filters = buildListFilters(req.query, { includeInactive: false });
    const items = await Product.find(filters).sort(normalizeSort(req.query.sort));
    return res.status(200).json(items);
  } catch (error) {
    console.error("Product list error:", error);
    return res.status(500).json({ message: "Ürünler yüklenirken bir hata oluştu." });
  }
});

router.get("/admin", auth, adminMiddleware, async (req, res) => {
  try {
    const filters = buildListFilters(req.query, { includeInactive: true });
    const items = await Product.find(filters).sort(normalizeSort(req.query.sort));
    return res.status(200).json(items);
  } catch (error) {
    console.error("Admin product list error:", error);
    return res.status(500).json({ message: "Ürünler yüklenirken bir hata oluştu." });
  }
});

router.post("/", auth, adminMiddleware, async (req, res) => {
  const sanitized = sanitizeProductPayload(req.body, { partial: false });
  if (!sanitized.ok) {
    return res.status(400).json({ message: sanitized.message });
  }

  try {
    const product = await Product.create(sanitized.payload);
    return res.status(201).json({ message: "Ürün oluşturuldu.", product });
  } catch (error) {
    console.error("Product create error:", error);
    return res.status(500).json({ message: "Ürün oluşturulurken bir hata oluştu." });
  }
});

router.put("/:id", auth, adminMiddleware, async (req, res) => {
  if (!ensureValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Ürün bulunamadı." });
  }

  const sanitized = sanitizeProductPayload(req.body, { partial: true });
  if (!sanitized.ok) {
    return res.status(400).json({ message: sanitized.message });
  }

  try {
    const product = await Product.findByIdAndUpdate(req.params.id, sanitized.payload, {
      new: true,
      runValidators: true,
    });

    if (!product) {
      return res.status(404).json({ message: "Ürün bulunamadı." });
    }

    return res.status(200).json({ message: "Ürün güncellendi.", product });
  } catch (error) {
    console.error("Product update error:", error);
    return res.status(500).json({ message: "Ürün güncellenirken bir hata oluştu." });
  }
});

router.patch("/:id/status", auth, adminMiddleware, async (req, res) => {
  if (!ensureValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Ürün bulunamadı." });
  }

  const isActive = parseBoolean(req.body?.isActive);
  if (isActive === null) {
    return res.status(400).json({ message: "isActive alanı true veya false olmalıdır." });
  }

  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ message: "Ürün bulunamadı." });
    }

    return res.status(200).json({ message: "Ürün durumu güncellendi.", product });
  } catch (error) {
    console.error("Product status update error:", error);
    return res.status(500).json({ message: "Ürün durumu güncellenirken bir hata oluştu." });
  }
});

router.get("/:id", async (req, res) => {
  if (!ensureValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Ürün bulunamadı." });
  }

  try {
    const product = await Product.findOne({
      _id: req.params.id,
      isActive: true,
    });

    if (!product) {
      return res.status(404).json({ message: "Ürün bulunamadı." });
    }

    return res.status(200).json(product);
  } catch (error) {
    console.error("Product detail error:", error);
    return res.status(500).json({ message: "Ürün detayları alınırken bir hata oluştu." });
  }
});

export default router;
