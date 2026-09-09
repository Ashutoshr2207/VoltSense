const Prediction = require('../models/Prediction');
const Vehicle = require('../models/Vehicle');
const ApiError = require('../utils/apiError');
const { formatDocument, formatDocuments } = require('../utils/idHelper');

class PredictionService {
  async listPredictionsForVehicle(userId, vehicleId, query = {}) {
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      throw ApiError.notFound(`Vehicle not found with ID '${vehicleId}'`, 'RESOURCE_NOT_FOUND');
    }

    if (vehicle.userId.toString() !== userId) {
      throw ApiError.forbidden('You do not have permission to view predictions for this vehicle');
    }

    const page = Math.max(1, parseInt(query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize || '20', 10)));
    const skip = (page - 1) * pageSize;

    const filter = { vehicleId };
    const predictions = await Prediction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize);

    const total = await Prediction.countDocuments(filter);

    return {
      predictions: formatDocuments(predictions),
      total,
      page,
      pageSize,
    };
  }

  async getPredictionById(userId, predictionId) {
    const prediction = await Prediction.findById(predictionId);
    if (!prediction) {
      throw ApiError.notFound(`Prediction not found with ID '${predictionId}'`, 'RESOURCE_NOT_FOUND');
    }

    if (prediction.userId.toString() !== userId) {
      throw ApiError.forbidden('You do not have permission to access this prediction');
    }

    return formatDocument(prediction);
  }
}

module.exports = new PredictionService();
