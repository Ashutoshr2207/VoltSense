const AIInsight = require('../models/AIInsight');
const Prediction = require('../models/Prediction');
const ApiError = require('../utils/apiError');
const { formatDocument } = require('../utils/idHelper');

class InsightService {
  async getInsightsForPrediction(userId, predictionId) {
    const prediction = await Prediction.findById(predictionId);
    if (!prediction) {
      throw ApiError.notFound(`Prediction not found with ID '${predictionId}'`, 'RESOURCE_NOT_FOUND');
    }

    if (prediction.userId.toString() !== userId) {
      throw ApiError.forbidden('You do not have permission to access insights for this prediction');
    }

    const insight = await AIInsight.findOne({ predictionId });
    if (!insight) {
      throw ApiError.notFound(
        `AI insights have not yet been generated for prediction '${predictionId}'`,
        'RESOURCE_NOT_FOUND'
      );
    }

    return formatDocument(insight);
  }
}

module.exports = new InsightService();
