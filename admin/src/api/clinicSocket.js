import { io } from "socket.io-client";

function buildSocketUrl() {
  const explicitSocketUrl = String(import.meta.env.VITE_SOCKET_URL || "").trim();

  if (explicitSocketUrl) {
    return explicitSocketUrl.replace(/\/+$/, "");
  }

  const apiBase = String(import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");

  if (!apiBase) {
    return window.location.origin;
  }

  return apiBase.endsWith("/api") ? apiBase.slice(0, -4) : apiBase;
}

export function createClinicSocket() {
  const token = localStorage.getItem("token");
  const socketUrl = buildSocketUrl();

  console.log("Socket URL:", socketUrl);

  return io(socketUrl, {
    auth: {
      token,
    },
    autoConnect: true,
    reconnection: true,
  });
}
