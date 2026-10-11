import apiRequest from "./api";

export async function findNearbyChargingStations(lat, lon, distanceKm = 25) {
  const query = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    distanceKm: String(distanceKm)
  }).toString();
  const response = await apiRequest(`/charging-stations?${query}`);
  return response.data; // { stations, total }
}
