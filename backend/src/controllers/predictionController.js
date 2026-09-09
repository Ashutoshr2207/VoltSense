const predictionService = require('../services/predictionService');
const ApiResponse = require('../utils/apiResponse');

const listPredictionsForVehicle = async (req, res, next) => {
  try {
    const result = await predictionService.listPredictionsForVehicle(
      req.userId,
      req.params.vehicleId,
      req.query
    );
    return ApiResponse.success(res, result);
  } catch (error) {
    next(error);
  }
};

const getPredictionById = async (req, res, next) => {
  try {
    const prediction = await predictionService.getPredictionById(req.userId, req.params.predictionId);
    return ApiResponse.success(res, { prediction });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listPredictionsForVehicle,
  getPredictionById,
};
