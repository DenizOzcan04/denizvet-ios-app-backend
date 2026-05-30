import mongoose from "mongoose";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";

import authRoutes from "./routes/auth.js";
import appointmentRoutes from "./routes/appointment.js";
import clinicRoutes from "./routes/clinic.js";
import clinicSlotRoutes from "./routes/clinicSlots.js";
import blogRoutes from "./routes/blog.js";
import askVetRoutes from "./routes/askVet.js";
import productRoutes from "./routes/product.js";
import orderRoutes from "./routes/order.js";
import { orderStripeWebhookHandler } from "./routes/order.js";
import { initSocket } from "./services/socketServer.js";

dotenv.config();

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "https://denizozcan.net",
  "https://www.denizozcan.net",
  "https://denizvet.denizozcan.dev",
  "https://api.denizvet.denizozcan.dev",
];

if (process.env.CLIENT_URL) {
  allowedOrigins.push(process.env.CLIENT_URL.trim());
}

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("CORS"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use(cors(corsOptions));

app.options(/.*/, cors(corsOptions));

app.post(
  "/api/orders/stripe/webhook",
  express.raw({ type: "application/json" }),
  orderStripeWebhookHandler
);

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/clinics", clinicRoutes);
app.use("/api/clinic-slots", clinicSlotRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/ask-vet", askVetRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);

app.get("/health", (req, res) => res.status(200).json({ ok: true }));

async function start() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Veritabanına başarıyla bağlanıldı");
    const PORT = process.env.PORT || 5000;
    const server = createServer(app);

    initSocket(server, allowedOrigins);

    server.listen(PORT, () => console.log(`Server http://localhost:${PORT}`));
  } catch (err) {
    console.log("Veritabanına bağlanırken hata oluştu");
    process.exit(1);
  }
}

start();
