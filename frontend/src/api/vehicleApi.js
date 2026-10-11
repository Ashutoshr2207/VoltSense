import apiRequest from "./api";

export async function fetchVehicles(params = {}) {
  const query = new URLSearchParams(params).toString();
  const response = await apiRequest(`/vehicles${query ? `?${query}` : ""}`);
  return response.data; // { vehicles, total }
}

export async function fetchVehicleById(vehicleId) {
  const response = await apiRequest(`/vehicles/${vehicleId}`);
  return response.data.vehicle;
}

export async function createVehicle(payload) {
  const response = await apiRequest("/vehicles", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.data.vehicle;
}

export async function updateVehicle(vehicleId, payload) {
  const response = await apiRequest(`/vehicles/${vehicleId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return response.data.vehicle;
}

export async function deleteVehicle(vehicleId) {
  return apiRequest(`/vehicles/${vehicleId}`, { method: "DELETE" });
}
