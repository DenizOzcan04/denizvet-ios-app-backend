import { Server } from "socket.io";
import jwt from "jsonwebtoken";

let ioInstance = null;

function isAllowedOrigin(origin, allowedOrigins) {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

export function clinicRoomName(clinicId) {
  return `clinic:${String(clinicId)}`;
}

export function initSocket(server, allowedOrigins = []) {
  ioInstance = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin, allowedOrigins)) {
          return callback(null, true);
        }

        return callback(new Error("CORS"));
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  ioInstance.use((socket, next) => {
    try {
      const authToken = socket.handshake.auth?.token;
      const headerToken = socket.handshake.headers?.authorization;
      const rawToken =
        authToken ||
        (typeof headerToken === "string" && headerToken.startsWith("Bearer ")
          ? headerToken.slice(7)
          : headerToken);

      if (!rawToken) {
        return next(new Error("Token bulunamadı."));
      }

      const decoded = jwt.verify(rawToken.trim(), process.env.JWT_SECRET);

      socket.data.user = {
        id: decoded.id,
        role: decoded.role || "user",
        clinic: decoded.clinic || null,
      };

      return next();
    } catch (error) {
      return next(new Error("Geçersiz veya süresi dolmuş token."));
    }
  });

  ioInstance.on("connection", (socket) => {
    const user = socket.data.user;

    if (user?.role === "vet" && user?.clinic) {
      socket.join(clinicRoomName(user.clinic));
    }
  });

  return ioInstance;
}

export function emitClinicAppointmentCreated(clinicId, appointment) {
  if (!ioInstance || !clinicId || !appointment) return;
  ioInstance.to(clinicRoomName(clinicId)).emit("appointment:created", appointment);
}

export function emitClinicAppointmentCancelRequested(clinicId, appointment) {
  if (!ioInstance || !clinicId || !appointment) return;
  ioInstance
    .to(clinicRoomName(clinicId))
    .emit("appointment:cancel_requested", appointment);
}

export function emitClinicAppointmentCancelApproved(clinicId, appointment) {
  if (!ioInstance || !clinicId || !appointment) return;
  ioInstance
    .to(clinicRoomName(clinicId))
    .emit("appointment:cancel_approved", appointment);
}

export function emitClinicAppointmentCancelRejected(clinicId, appointment) {
  if (!ioInstance || !clinicId || !appointment) return;
  ioInstance
    .to(clinicRoomName(clinicId))
    .emit("appointment:cancel_rejected", appointment);
}

export function emitClinicAppointmentUpdated(clinicId, appointment) {
  if (!ioInstance || !clinicId || !appointment) return;
  ioInstance.to(clinicRoomName(clinicId)).emit("appointment:updated", appointment);
}

export function emitClinicSlotUpdated(clinicId, payload) {
  if (!ioInstance || !clinicId || !payload) return;
  ioInstance.to(clinicRoomName(clinicId)).emit("slot:updated", payload);
}

export function getIO() {
  return ioInstance;
}
