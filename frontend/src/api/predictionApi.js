import apiRequest from "./api";

export async function fetchPredictionsForVehicle(vehicleId, params = {}) {
  const query = new URLSearchParams(params).toString();
  const response = await apiRequest(`/vehicles/${vehicleId}/predictions${query ? `?${query}` : ""}`);
  return response.data; // { predictions, total, page, pageSize }
}

export async function fetchPredictionById(predictionId) {
  const response = await apiRequest(`/predictions/${predictionId}`);
  return response.data.prediction;
}

export async function fetchInsightsForPrediction(predictionId) {
  const response = await apiRequest(`/predictions/${predictionId}/insights`);
  return response.data.insight;
}
