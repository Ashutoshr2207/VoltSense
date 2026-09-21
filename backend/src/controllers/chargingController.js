const chargingService = require('../services/chargingService');
const ApiError = require('../utils/apiError');

async function listNearbyStations(req, res, next) {
  try {
    const { lat, lon, distanceKm, maxResults } = req.query;
    const latitude = Number(lat);
    const longitude = Number(lon);

    if (isNaN(latitude) || isNaN(longitude)) {
      throw ApiError.badRequest('lat and lon query parameters are required numbers', 'VALIDATION_ERROR');
    }

    const stations = await chargingService.findNearbyStations({
      latitude,
      longitude,
      distanceKm: distanceKm ? Number(distanceKm) : undefined,
      maxResults: maxResults ? Number(maxResults) : undefined,
    });

    res.status(200).json({ success: true, data: { stations, total: stations.length } });
  } catch (error) {
    next(error);
  }
}

module.exports = { listNearbyStations };
