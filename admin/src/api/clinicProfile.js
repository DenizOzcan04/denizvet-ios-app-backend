import http from "./http";

function sanitizeProfilePayload(payload = {}) {
  return {
    address: String(payload.address || "").trim(),
    phone: String(payload.phone || "").trim(),
    description: String(payload.description || "").trim(),
  };
}

export async function getMyClinic() {
  const { data } = await http.get("/api/clinics/me");
  return data;
}

export async function updateMyClinic(payload) {
  const { data } = await http.put("/api/clinics/me", sanitizeProfilePayload(payload));
  return data;
}
