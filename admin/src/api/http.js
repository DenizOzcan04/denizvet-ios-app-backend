import axios from "axios";

function normalizeApiBaseUrl(value) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  const trimmed = raw.replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed.slice(0, -4) : trimmed;
}

const http = axios.create({
  baseURL: normalizeApiBaseUrl(import.meta.env.VITE_API_URL),
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default http;
