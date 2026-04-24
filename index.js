import mongoose from "mongoose";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";

import User from "./models/User.js";
import authRoutes from "./routes/auth.js";
import appointmentRoutes from "./routes/appointment.js";
import clinicRoutes from "./routes/clinic.js";
import blogRoutes from "./routes/blog.js";
import askVetRoutes from "./routes/askVet.js";

dotenv.config();

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://denizozcan.net",
  "https://www.denizozcan.net",
];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.options(/.*/, cors());

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/clinics", clinicRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/ask-vet", askVetRoutes);

app.get("/health", (req, res) => res.status(200).json({ ok: true }));

app.get("/api/_test/users", async (req, res) => {
  const users = await User.find().limit(10);
  res.json(users);
});

async function start() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Veritabanına başarıyla bağlanıldı");
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`Server http://localhost:${PORT}`));
  } catch (err) {
    console.log("Veritabanına bağlanırken hata oluştu");
    process.exit(1);
  }
}

start();
