import express from "express";
import Appointment from "../models/Appointment.js";
import auth from "../middleware/authMiddleware.js";
import vetMiddleware from "../middleware/vetMiddleware.js";

const router = express.Router();

// Randevu oluşturma
router.post("/", auth, async (req, res) => {
  console.log("APPOINTMENT BODY:", req.body);
  console.log("USER FROM TOKEN:", req.user);
  const { petType, petName, serviceType, clinicId, date, time, notes } = req.body;

  if (!petType || !petName || !serviceType || !clinicId || !date || !time) {
    return res
      .status(400)
      .json({ message: "Lütfen tüm zorunlu alanları doldurun." });
  }

  try {
    const sameSlot = await Appointment.findOne({
      clinic: clinicId,
      date,
      time,
    });

    if (sameSlot) {
      return res.status(409).json({
        message:
          "Bu tarih ve saatte seçilen klinikte zaten bir randevu mevcut.",
      });
    }

    const appointment = new Appointment({
      user: req.user.id,
      petType,
      petName,
      serviceType,
      clinic: clinicId, 
      date,
      time,
      notes: notes || "",
    });

    await appointment.save();

    res.status(201).json({
      message: "Randevu oluşturuldu.",
      appointment,
    });
  } catch (error) {
    console.log("Randevu oluşturma hatası:", error);
    res
      .status(500)
      .json({ message: "Randevu oluşturulurken bir hata oluştu." });
  }
});

// Kullanıcının kendi randevuları
router.get("/my", auth, async (req, res) => {
  try {
    const appointments = await Appointment.find({ user: req.user.id })
      .populate("clinic", "name address") 
      .sort({
        date: 1,
        time: 1,
      });

    res.status(200).json(appointments);
  } catch (error) {
    console.log("Randevular alınırken hata:", error);
    res
      .status(500)
      .json({ message: "Randevular alınırken bir hata oluştu." });
  }
});

// Veteriner randevuları
router.get("/vet", auth, async (req, res) => {
  try {
    if (req.user.role !== "vet") {
      return res.status(403).json({ message: "Bu işlem için yetkiniz yok." });
    }

    const appointments = await Appointment.find({ vet: req.user.id })
      .populate("user", "name surname email phone")
      .sort({ date: 1, time: 1 });

    res.status(200).json(appointments);
  } catch (error) {
    console.log("Veteriner randevuları hatası:", error);
    res
      .status(500)
      .json({ message: "Randevular alınırken bir hata oluştu." });
  }
});

// Klinik hesabının randevuları
router.get("/clinic", auth, vetMiddleware, async (req, res) => {
  try {
    const clinicId = req.user.clinic; 

    if (!clinicId) {
      return res
        .status(400)
        .json({ message: "Kullanıcıya bağlı klinik bilgisi bulunamadı." });
    }

    const appointments = await Appointment.find({ clinic: clinicId })
      .populate("user", "name surname email phone")
      .populate("clinic", "name address city")
      .sort({ date: 1, time: 1 });

    res.status(200).json(appointments);
  } catch (error) {
    console.log("Klinik randevuları hatası:", error);
    res
      .status(500)
      .json({ message: "Randevular alınırken bir hata oluştu." });
  }
});

// Randevu durumu güncelleme
router.put("/:id/status", auth, vetMiddleware, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["active", "completed", "cancelled"].includes(status)) {
    return res.status(400).json({ message: "Geçersiz randevu durumu." });
  }

  try {
    const appointment = await Appointment.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!appointment) {
      return res.status(404).json({ message: "Randevu bulunamadı." });
    }

    res.status(200).json({
      message: "Randevu durumu güncellendi.",
      appointment,
    });
  } catch (error) {
    console.log("Randevu durumu güncelleme hatası:", error);
    res
      .status(500)
      .json({ message: "Randevu güncellenirken bir hata oluştu." });
  }
});


// Randevu silme giriş yapan kullanıcı içinn
router.delete("/:id", auth, async (req, res) => {
  const { id } = req.params;

  try {
    const appointment = await Appointment.findOneAndDelete({
      _id: id,
      user: req.user.id,
    });

    if (!appointment) {
      return res
        .status(404)
        .json({ message: "Randevu bulunamadı veya silme yetkiniz yok." });
    }

    return res.status(200).json({
      message: "Randevu başarıyla silindi.",
    });
  } catch (error) {
    console.log("Randevu silme hatası:", error);
    return res
      .status(500)
      .json({ message: "Randevu silinirken bir hata oluştu." });
  }
});

// admin randevu çekmne
router.get("/", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Bu işlem için yetkiniz yok." });
    }

    const appointments = await Appointment.find()
      .populate("user", "name surname email phone")
      .populate("clinic", "name address")
      .sort({ date: 1, time: 1 });

    return res.status(200).json(appointments);
  } catch (error) {
    console.log("Admin randevuları hatası:", error);
    return res
      .status(500)
      .json({ message: "Randevular alınırken bir hata oluştu." });
  }
});

// admin randevu silme 
router.delete("/admin/:id", auth, async (req, res) => {
  const { id } = req.params;

  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Bu işlem için yetkiniz yok." });
    }

    const deleted = await Appointment.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Randevu bulunamadı." });
    }

    return res.status(200).json({ message: "Randevu başarıyla silindi." });
  } catch (error) {
    console.log("Admin randevu silme hatası:", error);
    return res.status(500).json({ message: "Randevu silinirken bir hata oluştu." });
  }
});



export default router;
