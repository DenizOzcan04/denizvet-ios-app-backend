import express from "express";
import Appointment from "../models/Appointment.js";
import ClinicClosedSlot from "../models/ClinicClosedSlot.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import Clinic from "../models/Clinic.js";
import auth from "../middleware/authMiddleware.js";
import vetMiddleware from "../middleware/vetMiddleware.js";
import { sendMailSafely } from "../services/mailService.js";
import {
  emitClinicAppointmentCancelApproved,
  emitClinicAppointmentCancelRejected,
  emitClinicAppointmentCancelRequested,
  emitClinicAppointmentCreated,
  emitClinicAppointmentUpdated,
} from "../services/socketServer.js";
import {
  defaultAppointmentSlots,
  normalizeSlotDate,
  uniqueSortedTimes,
} from "../utils/slotHelpers.js";

const router = express.Router();

function clinicIdValue(clinic) {
  if (!clinic) return null;
  return clinic._id ? String(clinic._id) : String(clinic);
}

function buildAppointmentDate(date, time) {
  return new Date(`${date}T${time}:00+03:00`);
}

function isPastSlot(date, time) {
  const appointmentDate = buildAppointmentDate(date, time);
  if (Number.isNaN(appointmentDate.getTime())) return false;
  return appointmentDate.getTime() <= Date.now();
}

function hasLessThanTwoHoursLeft(date, time) {
  const appointmentDate = buildAppointmentDate(date, time);
  if (Number.isNaN(appointmentDate.getTime())) return false;
  return appointmentDate.getTime() - Date.now() < 2 * 60 * 60 * 1000;
}

function clearCancelRequestFields(status = "active") {
  return {
    status,
    cancelReason: "",
    cancelRequestedAt: null,
    cancelRequestStatus: "none",
  };
}

async function loadRealtimeAppointment(appointmentId) {
  return Appointment.findById(appointmentId)
    .populate("user", "name surname email phone")
    .populate("clinic", "name address city")
    .lean();
}

async function getSlotAvailability({ clinicId, date }) {
  const normalizedDate = normalizeSlotDate(date);
  if (!normalizedDate) {
    return null;
  }

  const [closedRecord, appointments] = await Promise.all([
    ClinicClosedSlot.findOne({ clinic: clinicId, date: normalizedDate }).lean(),
    Appointment.find({
      clinic: clinicId,
      date,
      status: { $ne: "cancelled" },
    })
      .select("time status")
      .lean(),
  ]);

  const defaultSlots = defaultAppointmentSlots();
  const closedSlots = uniqueSortedTimes(closedRecord?.closedTimes || []);
  const bookedSlots = uniqueSortedTimes(appointments.map((appointment) => appointment.time));
  const blockedSlots = new Set([...closedSlots, ...bookedSlots]);
  const availableSlots = defaultSlots.filter((slot) => {
    if (blockedSlots.has(slot)) return false;
    if (isPastSlot(date, slot)) return false;
    return true;
  });

  return {
    date,
    clinicId: String(clinicId),
    availableSlots,
    closedSlots,
    bookedSlots,
    note: closedRecord?.note || "",
  };
}

async function createNotification({ userId, title, message, type, appointmentId }) {
  if (!userId) return;

  await Notification.create({
    user: userId,
    title,
    message,
    type,
    appointment: appointmentId || null,
  });
}

function buildAppointmentMailHtml({ title, intro, clinicName, date, time, petName, serviceType, note }) {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; background:#f6f2e8; padding:24px; color:#2f2a24;">
      <div style="max-width:640px; margin:0 auto; background:#ffffff; border-radius:20px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.08);">
        <div style="background:linear-gradient(135deg,#f59d2a,#d97706); padding:24px 28px; color:#ffffff;">
          <div style="font-size:13px; opacity:0.9; margin-bottom:8px;">DenizVet</div>
          <div style="font-size:24px; font-weight:700;">${title}</div>
        </div>
        <div style="padding:28px;">
          <p style="font-size:15px; line-height:1.6; margin:0 0 18px 0;">${intro}</p>
          <div style="background:#fcf8f0; border:1px solid #f0e4cf; border-radius:16px; padding:18px 20px;">
            <div style="font-size:14px; margin-bottom:10px;"><strong>Klinik:</strong> ${clinicName}</div>
            <div style="font-size:14px; margin-bottom:10px;"><strong>Tarih:</strong> ${date}</div>
            <div style="font-size:14px; margin-bottom:10px;"><strong>Saat:</strong> ${time}</div>
            <div style="font-size:14px; margin-bottom:10px;"><strong>Evcil Hayvan:</strong> ${petName}</div>
            <div style="font-size:14px;"><strong>Randevu Türü:</strong> ${serviceType}</div>
          </div>
          ${note ? `<p style="font-size:14px; line-height:1.6; margin:18px 0 0 0; color:#5a5248;">${note}</p>` : ""}
        </div>
      </div>
    </div>
  `;
}

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
    const [user, clinic] = await Promise.all([
      User.findById(req.user.id).select("name surname email"),
      Clinic.findById(clinicId).select("name"),
    ]);

    if (!user || !clinic) {
      return res.status(404).json({ message: "Kullanıcı veya klinik bilgisi bulunamadı." });
    }

    if (isPastSlot(date, time)) {
      return res.status(400).json({
        message: "Gecmis saatler icin randevu olusturulamaz.",
      });
    }

    const closedSlotRecord = await ClinicClosedSlot.findOne({
      clinic: clinicId,
      date: normalizeSlotDate(date),
    }).lean();

    if (closedSlotRecord?.closedTimes?.includes(time)) {
      return res.status(400).json({
        message: "Bu saat klinik tarafından online randevuya kapatılmıştır.",
      });
    }

    const sameSlot = await Appointment.findOne({
      clinic: clinicId,
      date,
      time,
      status: { $ne: "cancelled" },
    });

    if (sameSlot) {
      return res.status(409).json({
        message: "Bu saat için uygun randevu bulunmamaktadır.",
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

    const realtimeAppointment = await loadRealtimeAppointment(appointment._id);

    emitClinicAppointmentCreated(clinicId, realtimeAppointment);

    await sendMailSafely(
      {
        to: user.email,
        subject: "DenizVet - Randevunuz Oluşturuldu",
        text:
          `${clinic.name} kliniğinde ${date} tarihinde saat ${time} için ${petName} adına ${serviceType} randevunuz başarıyla oluşturuldu. Randevu detaylarınızı uygulama üzerinden görüntüleyebilirsiniz.`,
        html: buildAppointmentMailHtml({
          title: "Randevunuz Oluşturuldu",
          intro: "Randevunuz başarıyla oluşturuldu. Aşağıda randevunuza ait temel bilgileri bulabilirsiniz.",
          clinicName: clinic.name,
          date,
          time,
          petName,
          serviceType,
          note: "Randevunuzu oluşturduktan sonra doğrudan iptal edemezsiniz. Gerekirse uygulama üzerinden iptal talebi oluşturabilirsiniz.",
        }),
      },
      "randevu olusturma maili"
    );

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

router.get("/availability", auth, async (req, res) => {
  const { clinicId, date } = req.query;

  if (!clinicId || !date) {
    return res.status(400).json({ message: "clinicId ve date zorunludur." });
  }

  try {
    const appointments = await Appointment.find({
      clinic: clinicId,
      date,
      status: { $ne: "cancelled" },
    })
      .select("time")
      .lean();

    const bookedTimes = appointments
      .map((appointment) => appointment.time)
      .filter(Boolean)
      .sort();

    return res.status(200).json({ bookedTimes });
  } catch (error) {
    console.log("Randevu musaitlik hatasi:", error);
    return res.status(500).json({ message: "Musaitlik bilgisi alinamadi." });
  }
});

router.get("/available-slots", auth, async (req, res) => {
  const { clinicId, date } = req.query;

  if (!clinicId || !date) {
    return res.status(400).json({ message: "clinicId ve date zorunludur." });
  }

  try {
    const availability = await getSlotAvailability({ clinicId, date });

    if (!availability) {
      return res.status(400).json({ message: "Geçerli bir tarih girilmelidir." });
    }

    return res.status(200).json(availability);
  } catch (error) {
    console.log("Uygun slot listeleme hatasi:", error);
    return res.status(500).json({ message: "Uygun saatler alınırken bir hata oluştu." });
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

  if (!["active", "completed", "cancelled", "cancel_requested"].includes(status)) {
    return res.status(400).json({ message: "Geçersiz randevu durumu." });
  }

  try {
    const existingAppointment = await Appointment.findById(id).select("clinic");

    if (!existingAppointment) {
      return res.status(404).json({ message: "Randevu bulunamadı." });
    }

    if (clinicIdValue(existingAppointment.clinic) !== String(req.user.clinic)) {
      return res.status(403).json({ message: "Bu randevu için işlem yetkiniz yok." });
    }

    const update =
      status === "active"
        ? clearCancelRequestFields("active")
        : { status };

    const appointment = await Appointment.findByIdAndUpdate(existingAppointment._id, update, {
      new: true,
    });

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

router.post("/:id/cancel-request", auth, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  try {
    const requester = await User.findById(req.user.id).select("email");
    const appointment = await Appointment.findOne({
      _id: id,
      user: req.user.id,
    }).populate("clinic", "name");

    if (!appointment) {
      return res
        .status(404)
        .json({ message: "Randevu bulunamadı veya bu işlem için yetkiniz yok." });
    }

    if (appointment.status === "cancelled") {
      return res.status(400).json({ message: "İptal edilmiş randevu için yeni talep oluşturulamaz." });
    }

    if (appointment.status === "cancel_requested") {
      return res.status(400).json({
        message: "Bu randevu için zaten bekleyen bir iptal talebi bulunuyor.",
      });
    }

    if (appointment.status !== "active") {
      return res.status(400).json({
        message: "Sadece aktif randevular için iptal talebi gönderilebilir.",
      });
    }

    if (isPastSlot(appointment.date, appointment.time)) {
      return res.status(400).json({ message: "Geçmiş randevular için iptal talebi oluşturulamaz." });
    }

    if (hasLessThanTwoHoursLeft(appointment.date, appointment.time)) {
      return res.status(400).json({
        message:
          "Randevu saatine 2 saatten az kaldığı için uygulama üzerinden iptal talebi gönderilemez. Lütfen klinik ile doğrudan iletişime geçin.",
      });
    }

    appointment.status = "cancel_requested";
    appointment.cancelReason = typeof reason === "string" ? reason.trim() : "";
    appointment.cancelRequestedAt = new Date();
    appointment.cancelRequestStatus = "pending";
    await appointment.save();

    const clinicVetUser = await User.findOne({
      clinic: appointment.clinic?._id,
      role: "vet",
    }).select("_id email name surname");

    await createNotification({
      userId: clinicVetUser?._id,
      title: "Yeni iptal talebi",
      message: `${appointment.date} ${appointment.time} tarihli ${appointment.petName} randevusu için iptal talebinde bulunulmuştur.`,
      type: "appointment_cancel_request",
      appointmentId: appointment._id,
    });

    await Promise.all([
      sendMailSafely(
        {
          to: requester?.email,
          subject: "DenizVet - İptal Talebiniz Kliniğe İletildi",
          text:
            `${appointment.clinic?.name || "İlgili klinik"} için ${appointment.date} tarihinde saat ${appointment.time} olan ${appointment.petName} adına ${appointment.serviceType} randevunuzun iptal talebi kliniğe iletilmiştir. Talebiniz değerlendirildikten sonra size tekrar bilgi verilecektir.`,
          html: buildAppointmentMailHtml({
            title: "İptal Talebiniz İletildi",
            intro: "Randevu iptal talebiniz başarıyla kliniğe iletildi. Klinik talebinizi değerlendirdikten sonra size bilgilendirme yapılacaktır.",
            clinicName: appointment.clinic?.name || "İlgili Klinik",
            date: appointment.date,
            time: appointment.time,
            petName: appointment.petName,
            serviceType: appointment.serviceType,
            note: "Randevu saatine 2 saatten az kala uygulama üzerinden yeni bir iptal talebi gönderilemez.",
          }),
        },
        "iptal talebi kullanici maili"
      ),
      sendMailSafely(
        {
          to: clinicVetUser?.email,
          subject: "DenizVet - Yeni Randevu İptal Talebi",
          text:
            `Kliniğinizde ${appointment.date} tarihinde saat ${appointment.time} olan ${appointment.petName} adına ${appointment.serviceType} randevusu için kullanıcı iptal talebinde bulunmuştur.`,
          html: buildAppointmentMailHtml({
            title: "Yeni İptal Talebi",
            intro: "Bir kullanıcı, aşağıdaki randevu için iptal talebinde bulundu. Klinik panelinden talebi onaylayabilir veya reddedebilirsiniz.",
            clinicName: appointment.clinic?.name || "Kliniğiniz",
            date: appointment.date,
            time: appointment.time,
            petName: appointment.petName,
            serviceType: appointment.serviceType,
            note: appointment.cancelReason
              ? `Kullanıcının iptal açıklaması: ${appointment.cancelReason}`
              : "Kullanıcı iptal talebi için ek bir açıklama paylaşmadı.",
          }),
        },
        "iptal talebi klinik maili"
      ),
    ]);

    const realtimeAppointment = await loadRealtimeAppointment(appointment._id);
    const resolvedClinicId =
      clinicIdValue(realtimeAppointment?.clinic) || clinicIdValue(appointment.clinic);

    emitClinicAppointmentCancelRequested(resolvedClinicId, realtimeAppointment);
    emitClinicAppointmentUpdated(resolvedClinicId, realtimeAppointment);

    return res.status(200).json({
      message: "İptal talebiniz kliniğe iletildi.",
      appointment: realtimeAppointment,
    });
  } catch (error) {
    console.log("Randevu iptal talebi hatasi:", error);
    return res
      .status(500)
      .json({ message: "İptal talebi gönderilirken bir hata oluştu." });
  }
});

router.put("/:id/approve-cancel-request", auth, vetMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const appointment = await Appointment.findById(id)
      .populate("user", "name surname email")
      .populate("clinic", "name");

    if (!appointment) {
      return res.status(404).json({ message: "Randevu bulunamadı." });
    }

    if (clinicIdValue(appointment.clinic) !== String(req.user.clinic)) {
      return res.status(403).json({ message: "Bu randevu için işlem yetkiniz yok." });
    }

    if (appointment.status !== "cancel_requested" || appointment.cancelRequestStatus !== "pending") {
      return res.status(400).json({ message: "Onay bekleyen bir iptal talebi bulunamadı." });
    }

    appointment.status = "cancelled";
    appointment.cancelRequestStatus = "approved";
    await appointment.save();

    const realtimeAppointment = await loadRealtimeAppointment(appointment._id);
    const resolvedClinicId =
      clinicIdValue(realtimeAppointment?.clinic) || clinicIdValue(appointment.clinic);

    await createNotification({
      userId: appointment.user?._id,
      title: "İptal talebi onaylandı",
      message: `${appointment.date} ${appointment.time} tarihli ${appointment.petName} randevu iptal talebiniz onaylanmıştır.`,
      type: "appointment_cancel_approved",
      appointmentId: appointment._id,
    });

    await sendMailSafely(
      {
        to: appointment.user?.email,
        subject: "DenizVet - İptal Talebiniz Onaylandı",
        text:
          `${appointment.clinic?.name || "İlgili klinik"} için ${appointment.date} tarihinde saat ${appointment.time} olan ${appointment.petName} adına ${appointment.serviceType} randevunuzun iptal talebi onaylanmıştır.`,
        html: buildAppointmentMailHtml({
          title: "İptal Talebiniz Onaylandı",
          intro: "Randevu iptal talebiniz klinik tarafından onaylandı ve randevunuz iptal edildi.",
          clinicName: appointment.clinic?.name || "İlgili Klinik",
          date: appointment.date,
          time: appointment.time,
          petName: appointment.petName,
          serviceType: appointment.serviceType,
          note: "Yeni bir randevu oluşturmak isterseniz uygulama üzerinden tekrar randevu alabilirsiniz.",
        }),
      },
      "iptal onay maili"
    );

    emitClinicAppointmentCancelApproved(resolvedClinicId, realtimeAppointment);
    emitClinicAppointmentUpdated(resolvedClinicId, realtimeAppointment);

    return res.status(200).json({
      message: "İptal talebi onaylandı ve randevu iptal edildi.",
      appointment: realtimeAppointment,
    });
  } catch (error) {
    console.log("Iptal talebi onaylama hatasi:", error);
    return res
      .status(500)
      .json({ message: "İptal talebi onaylanırken bir hata oluştu." });
  }
});

router.put("/:id/reject-cancel-request", auth, vetMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const appointment = await Appointment.findById(id)
      .populate("user", "name surname email")
      .populate("clinic", "name");

    if (!appointment) {
      return res.status(404).json({ message: "Randevu bulunamadı." });
    }

    if (clinicIdValue(appointment.clinic) !== String(req.user.clinic)) {
      return res.status(403).json({ message: "Bu randevu için işlem yetkiniz yok." });
    }

    if (appointment.status !== "cancel_requested" || appointment.cancelRequestStatus !== "pending") {
      return res.status(400).json({ message: "Reddedilecek bekleyen bir iptal talebi bulunamadı." });
    }

    appointment.status = "active";
    appointment.cancelRequestStatus = "rejected";
    await appointment.save();

    const realtimeAppointment = await loadRealtimeAppointment(appointment._id);
    const resolvedClinicId =
      clinicIdValue(realtimeAppointment?.clinic) || clinicIdValue(appointment.clinic);

    await createNotification({
      userId: appointment.user?._id,
      title: "İptal talebi reddedildi",
      message: `${appointment.date} ${appointment.time} tarihli ${appointment.petName} randevu iptal talebiniz reddedilmiştir.`,
      type: "appointment_cancel_rejected",
      appointmentId: appointment._id,
    });

    await sendMailSafely(
      {
        to: appointment.user?.email,
        subject: "DenizVet - İptal Talebiniz Reddedildi",
        text:
          `${appointment.clinic?.name || "İlgili klinik"} için ${appointment.date} tarihinde saat ${appointment.time} olan ${appointment.petName} adına ${appointment.serviceType} randevunuzun iptal talebi reddedilmiştir.`,
        html: buildAppointmentMailHtml({
          title: "İptal Talebiniz Reddedildi",
          intro: "Klinik, randevu iptal talebinizi reddetti. Randevunuz aktif durumda görünmeye devam edecektir.",
          clinicName: appointment.clinic?.name || "İlgili Klinik",
          date: appointment.date,
          time: appointment.time,
          petName: appointment.petName,
          serviceType: appointment.serviceType,
          note: "Detaylı bilgi almak isterseniz klinikle doğrudan iletişime geçebilirsiniz.",
        }),
      },
      "iptal red maili"
    );

    emitClinicAppointmentCancelRejected(resolvedClinicId, realtimeAppointment);
    emitClinicAppointmentUpdated(resolvedClinicId, realtimeAppointment);

    return res.status(200).json({
      message: "İptal talebi reddedildi ve randevu aktif duruma alındı.",
      appointment: realtimeAppointment,
    });
  } catch (error) {
    console.log("Iptal talebi reddetme hatasi:", error);
    return res
      .status(500)
      .json({ message: "İptal talebi reddedilirken bir hata oluştu." });
  }
});

// Randevu silme yerine iptal talebi akisi kullaniliyor
router.delete("/:id", auth, async (_req, res) => {
  return res.status(405).json({
    message:
      "Randevular doğrudan silinemez. Lütfen uygulama üzerinden iptal talebi oluşturun.",
  });
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

    const deleted = await Appointment.findByIdAndUpdate(
      id,
      clearCancelRequestFields("cancelled"),
      { new: true }
    );

    if (!deleted) {
      return res.status(404).json({ message: "Randevu bulunamadı." });
    }

    return res.status(200).json({ message: "Randevu iptal durumuna alındı." });
  } catch (error) {
    console.log("Admin randevu silme hatası:", error);
    return res.status(500).json({ message: "Randevu güncellenirken bir hata oluştu." });
  }
});



export default router;
