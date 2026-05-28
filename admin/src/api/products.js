import http from "./http";

export function getAdminProducts(params = {}) {
  return http.get("/api/products/admin", { params });
}

export function createProduct(payload) {
  return http.post("/api/products", payload);
}

export function updateProduct(id, payload) {
  return http.put(`/api/products/${id}`, payload);
}

export function updateProductStatus(id, isActive) {
  return http.patch(`/api/products/${id}/status`, { isActive });
}
