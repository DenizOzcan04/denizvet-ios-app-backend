import express from "express";
import Clinic from "../models/Clinic.js";
import ClinicClosedSlot from "../models/ClinicClosedSlot.js";
import auth from "../middleware/authMiddleware.js";
import { emitClinicSlotUpdated } from "../services/socketServer.js";
import {
  normalizeSlotDate,
  uniqueSortedTimes,
} from "../utils/slotHelpers.js";

const router = express.Router();

function resolveClinicId(req, requestedClinicId) {
  if (req.user.role === "admin") {
    return requestedClinicId || null;
  }

  if (req.user.role === "vet") {
    return req.user.clinic || null;
  }

  return null;
}

function getTurkeyDateKey() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

function isPastDateKey(dateKey) {
  return String(dateKey || "") < getTurkeyDateKey();
}

function isPastSlotForToday(dateKey, time) {
  if (String(dateKey || "") !== getTurkeyDateKey()) {
    return false;
  }

  const slotDate = new Date(`${dateKey}T${time}:00+03:00`);
  if (Number.isNaN(slotDate.getTime())) {
    return false;
  }

  return slotDate.getTime() <= Date.now();
}

function sortedPastSlots(dateKey, times = []) {
  return uniqueSortedTimes(times.filter((time) => isPastSlotForToday(dateKey, time)));
}

async function validateClinicAccess(req, clinicId) {
  if (!clinicId) {
    return { ok: false, status: 400, message: "Klinik bilgisi zorunludur." };
  }

  if (req.user.role === "user") {
    return { ok: false, status: 403, message: "Bu işlem için yetkiniz yok." };
  }

  if (req.user.role === "vet" && String(req.user.clinic) !== String(clinicId)) {
    return {
      ok: false,
      status: 403,
      message: "Sadece kendi kliniğinizin kapalı saatlerini yönetebilirsiniz.",
    };
  }

  const clinic = await Clinic.findById(clinicId).select("_id name");
  if (!clinic) {
    return { ok: false, status: 404, message: "Klinik bulunamadı." };
  }

  return { ok: true, clinic };
}

router.get("/closed", auth, async (req, res) => {
  const clinicId = resolveClinicId(req, req.query.clinicId);
  const rawDate = req.query.date;
  const normalizedDate = normalizeSlotDate(rawDate);

  if (!normalizedDate) {
    return res.status(400).json({ message: "Geçerli bir tarih girilmelidir." });
  }

  try {
    const access = await validateClinicAccess(req, clinicId);
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    const record = await ClinicClosedSlot.findOne({
      clinic: clinicId,
      date: normalizedDate,
    }).lean();

    return res.status(200).json({
      clinicId: String(clinicId),
      date: rawDate,
      closedTimes: record?.closedTimes ?? [],
      note: record?.note ?? "",
    });
  } catch (error) {
    console.log("Kapali saat listeleme hatasi:", error);
    return res.status(500).json({ message: "Kapalı saatler alınırken bir hata oluştu." });
  }
});

router.post("/closed", auth, async (req, res) => {
  const requestedClinicId = req.body.clinicId;
  const clinicId = resolveClinicId(req, requestedClinicId);
  const rawDate = req.body.date;
  const normalizedDate = normalizeSlotDate(rawDate);

  if (!normalizedDate) {
    return res.status(400).json({ message: "Geçerli bir tarih girilmelidir." });
  }

  if (isPastDateKey(rawDate)) {
    return res.status(400).json({ message: "Geçmiş tarihler için slot düzenlemesi yapılamaz." });
  }

  try {
    const access = await validateClinicAccess(req, clinicId);
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    const closedTimes = uniqueSortedTimes(req.body.closedTimes || []);
    const note = typeof req.body.note === "string" ? req.body.note.trim() : "";
    const existingRecord = await ClinicClosedSlot.findOne({
      clinic: clinicId,
      date: normalizedDate,
    }).lean();

    if (String(rawDate) === getTurkeyDateKey()) {
      const requestedPastSlots = sortedPastSlots(rawDate, closedTimes);
      const existingPastSlots = sortedPastSlots(rawDate, existingRecord?.closedTimes || []);

      if (JSON.stringify(requestedPastSlots) !== JSON.stringify(existingPastSlots)) {
        return res.status(400).json({
          message: "Geçmiş saatler için slot düzenlemesi yapılamaz.",
        });
      }
    }

    const record = await ClinicClosedSlot.findOneAndUpdate(
      { clinic: clinicId, date: normalizedDate },
      {
        clinic: clinicId,
        date: normalizedDate,
        closedTimes,
        note,
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    const payload = {
      clinicId: String(record.clinic),
      date: rawDate,
      closedTimes: record.closedTimes,
      note: record.note,
    };

    emitClinicSlotUpdated(clinicId, payload);

    return res.status(200).json({
      message: "Kapalı saatler kaydedildi.",
      slot: payload,
    });
  } catch (error) {
    console.log("Kapali saat kaydetme hatasi:", error);
    return res.status(500).json({ message: "Kapalı saatler kaydedilirken bir hata oluştu." });
  }
});

router.delete("/closed", auth, async (req, res) => {
  const clinicId = resolveClinicId(req, req.query.clinicId);
  const rawDate = req.query.date;
  const normalizedDate = normalizeSlotDate(rawDate);

  if (!normalizedDate) {
    return res.status(400).json({ message: "Geçerli bir tarih girilmelidir." });
  }

  if (isPastDateKey(rawDate)) {
    return res.status(400).json({ message: "Geçmiş tarihler için slot düzenlemesi yapılamaz." });
  }

  try {
    const access = await validateClinicAccess(req, clinicId);
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    const existingRecord = await ClinicClosedSlot.findOne({
      clinic: clinicId,
      date: normalizedDate,
    }).lean();

    if (
      String(rawDate) === getTurkeyDateKey() &&
      sortedPastSlots(rawDate, existingRecord?.closedTimes || []).length > 0
    ) {
      return res.status(400).json({
        message: "Geçmiş saatler için slot düzenlemesi yapılamaz.",
      });
    }

    await ClinicClosedSlot.findOneAndDelete({
      clinic: clinicId,
      date: normalizedDate,
    });

    emitClinicSlotUpdated(clinicId, {
      clinicId: String(clinicId),
      date: rawDate,
      closedTimes: [],
      note: "",
    });

    return res.status(200).json({ message: "Kapalı saat ayarı temizlendi." });
  } catch (error) {
    console.log("Kapali saat silme hatasi:", error);
    return res.status(500).json({ message: "Kapalı saat ayarı temizlenirken bir hata oluştu." });
  }
});

export default router;
