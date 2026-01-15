import express from "express";
import Clinic from "../models/Clinic.js";
import auth from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

router.post("/", auth, adminMiddleware, async (req, res) => {
  const { name, address, phone, city, description, avgRating, ratingCount } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ message: "Klinik adı zorunludur." });
  }

  try {
    const clinic = new Clinic({
      name: name.trim(),
      address: (address || "").trim(),
      phone: (phone || "").trim(),
      city: (city || "").trim(),
      description: (description || "").trim(),
      avgRating: typeof avgRating === "number" ? avgRating : 0,
      ratingCount: typeof ratingCount === "number" ? ratingCount : 0,
      isActive: true,
    });

    await clinic.save();

    res.status(201).json({
      message: "Klinik oluşturuldu.",
      clinic,
    });
  } catch (error) {
    console.log("Klinik oluşturma hatası:", error);
    res.status(500).json({ message: "Sunucu hatası." });
  }
});

router.get("/", async (req, res) => {
  try {
    const clinics = await Clinic.find({ isActive: true })
      .sort({ createdAt: -1 })
      .select("name address city phone description avgRating ratingCount createdAt lat lng");

    res.status(200).json(clinics);
  } catch (error) {
    console.log("Klinik listeleme hatası:", error);
    res.status(500).json({ message: "Sunucu hatası." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.params.id).select(
      "name address city phone description avgRating ratingCount createdAt lat lng"
    );

    if (!clinic) {
      return res.status(404).json({ message: "Klinik bulunamadı." });
    }

    res.status(200).json(clinic);
  } catch (error) {
    console.log("Klinik detay hatası:", error);
    res.status(500).json({ message: "Sunucu hatası." });
  }
});

router.put("/:id", auth, adminMiddleware, async (req, res) => {
  try {
    const { name, address, phone, city, description } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: "Klinik adı zorunludur." });
    }

    const updated = await Clinic.findByIdAndUpdate(
      req.params.id,
      {
        name: name.trim(),
        address: (address || "").trim(),
        phone: (phone || "").trim(),
        city: (city || "").trim(),
        description: (description || "").trim(),
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Klinik bulunamadı." });
    }

    return res.status(200).json({ message: "Klinik güncellendi.", clinic: updated });
  } catch (error) {
    console.log("Klinik güncelleme hatası:", error);
    return res.status(500).json({ message: "Sunucu hatası." });
  }
});

router.delete("/:id", auth, adminMiddleware, async (req, res) => {
  try {
    const deleted = await Clinic.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Klinik bulunamadı." });
    }
    return res.status(200).json({ message: "Klinik silindi." });
  } catch (error) {
    console.log("Klinik silme hatası:", error);
    return res.status(500).json({ message: "Sunucu hatası." });
  }
});

export default router;
