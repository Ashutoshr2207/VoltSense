const insightService = require('../services/insightService');
const ApiResponse = require('../utils/apiResponse');

const getInsightsForPrediction = async (req, res, next) => {
  try {
    const insight = await insightService.getInsightsForPrediction(req.userId, req.params.predictionId);
    return ApiResponse.success(res, { insight });
  } catch (error) {
    next(error);
  }
};

const explainPrediction = async (req, res, next) => {
  try {
    const { question } = req.body || {};
    const explanation = await insightService.generateExplanation(req.userId, req.params.predictionId, question);
    return ApiResponse.success(res, { explanation });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getInsightsForPrediction,
  explainPrediction,
};
