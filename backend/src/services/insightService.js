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

  async generateExplanation(userId, predictionId, question = null) {
    const prediction = await Prediction.findById(predictionId);
    if (!prediction) {
      throw ApiError.notFound(`Prediction not found with ID '${predictionId}'`, 'RESOURCE_NOT_FOUND');
    }

    if (prediction.userId.toString() !== userId) {
      throw ApiError.forbidden('You do not have permission to access insights for this prediction');
    }

    const groqService = require('./groqService');
    const predData = {
      soh: prediction.prediction.soh,
      rul: prediction.prediction.rulCycles,
      capacity: prediction.prediction.currentCapacityAh,
      referenceCapacity: prediction.prediction.referenceCapacityAh,
      currentCycle: prediction.prediction.currentCycle,
      factors: prediction.prediction.factors,
      status: prediction.prediction.soh >= 90 ? 'healthy' : prediction.prediction.soh >= 80 ? 'attention' : 'critical',
      modelName: prediction.model?.name || 'VoltSense Ensemble (RF + GB)',
    };

    const explanation = await groqService.explainPrediction(predData, question);
    return explanation;
  }
}

module.exports = new InsightService();
