import { Server } from "socket.io";
import jwt from "jsonwebtoken";

let ioInstance = null;

function debugSocketLog(...args) {
  if (process.env.NODE_ENV !== "production") {
    console.log(...args);
  }
}

function isAllowedOrigin(origin, allowedOrigins) {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

export function clinicRoomName(clinicId) {
  return `clinic:${String(clinicId)}`;
}

export function userRoomName(userId) {
  return `user:${String(userId)}`;
}

export function clinicSlotsRoomName(clinicId) {
  return `clinic-slots:${String(clinicId)}`;
}

function hasRoomTarget(value) {
  if (typeof value === "number") return true;
  if (typeof value !== "string") return false;
  return value.trim().length > 0;
}

function emitAppointmentEvent(eventName, clinicId, userId, payload) {
  if (!ioInstance || !payload) return;

  if (hasRoomTarget(clinicId)) {
    ioInstance.to(clinicRoomName(clinicId)).emit(eventName, payload);
  }

  if (hasRoomTarget(userId)) {
    ioInstance.to(userRoomName(userId)).emit(eventName, payload);
  }

  debugSocketLog(
    `emitted ${eventName} to clinic room and user room`,
    hasRoomTarget(clinicId) ? clinicRoomName(clinicId) : "clinic:none",
    hasRoomTarget(userId) ? userRoomName(userId) : "user:none"
  );
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

    if (user?.id) {
      const userRoom = userRoomName(user.id);
      socket.join(userRoom);
      debugSocketLog(`socket authenticated user joined room ${userRoom}`);
    }

    if (user?.role === "vet" && user?.clinic) {
      const clinicRoom = clinicRoomName(user.clinic);
      socket.join(clinicRoom);
      debugSocketLog(`vet joined clinic room ${clinicRoom}`);
    }

    socket.on("slots:subscribe", (payload = {}) => {
      const clinicId = String(payload?.clinicId || "").trim();
      if (!clinicId) return;

      const room = clinicSlotsRoomName(clinicId);
      socket.join(room);
      debugSocketLog(`socket joined clinic slot room ${room}`);
    });

    socket.on("slots:unsubscribe", (payload = {}) => {
      const clinicId = String(payload?.clinicId || "").trim();
      if (!clinicId) return;

      const room = clinicSlotsRoomName(clinicId);
      socket.leave(room);
      debugSocketLog(`socket left clinic slot room ${room}`);
    });
  });

  return ioInstance;
}

export function emitClinicAppointmentCreated(clinicId, userId, appointment) {
  if (!appointment) return;
  emitAppointmentEvent("appointment:created", clinicId, userId, appointment);
}

export function emitClinicAppointmentCancelRequested(clinicId, userId, appointment) {
  if (!appointment) return;
  emitAppointmentEvent("appointment:cancel_requested", clinicId, userId, appointment);
}

export function emitClinicAppointmentCancelApproved(clinicId, userId, appointment) {
  if (!appointment) return;
  emitAppointmentEvent("appointment:cancel_approved", clinicId, userId, appointment);
}

export function emitClinicAppointmentCancelRejected(clinicId, userId, appointment) {
  if (!appointment) return;
  emitAppointmentEvent("appointment:cancel_rejected", clinicId, userId, appointment);
}

export function emitClinicAppointmentUpdated(clinicId, userId, appointment) {
  if (!appointment) return;
  emitAppointmentEvent("appointment:updated", clinicId, userId, appointment);
}

export function emitClinicSlotUpdated(clinicId, payload) {
  if (!ioInstance || !clinicId || !payload) return;
  ioInstance.to(clinicRoomName(clinicId)).emit("slot:updated", payload);
  ioInstance.to(clinicSlotsRoomName(clinicId)).emit("slot:updated", payload);
  debugSocketLog(
    `emitted slot:updated to clinic room and clinic-slots room`,
    clinicRoomName(clinicId),
    clinicSlotsRoomName(clinicId)
  );
}

export function emitClinicUpdated(clinicId, payload) {
  if (!ioInstance || !clinicId || !payload) return;

  const targetClinicRoom = clinicRoomName(clinicId);
  ioInstance.to(targetClinicRoom).emit("clinic:updated", payload);

  ioInstance.sockets.sockets.forEach((socket) => {
    const socketUser = socket.data?.user;
    if (!socketUser?.id) return;

    if (socket.rooms.has(targetClinicRoom)) {
      return;
    }

    socket.emit("clinic:updated", payload);
  });

  debugSocketLog(`emitted clinic:updated to clinic room and user clients`, targetClinicRoom);
}

export function emitProductChanged(type, productId, updatedAt) {
  if (!ioInstance || !type || !productId) return;

  const payload = {
    type,
    productId: String(productId),
    updatedAt: updatedAt ? new Date(updatedAt).toISOString() : new Date().toISOString(),
  };

  ioInstance.emit("product:changed", payload);
  debugSocketLog(`Product realtime emitted: product:changed ${type} ${payload.productId}`);
}

export function getIO() {
  return ioInstance;
}
