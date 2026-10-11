const express = require('express');
const { getPredictionById, getStructuredAnalysis } = require('../controllers/predictionController');
const { getInsightsForPrediction, explainPrediction } = require('../controllers/insightController');
const { validatePredictionId } = require('../validators/datasetValidator');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/:predictionId', requireAuth, validatePredictionId, getPredictionById);
router.get('/:predictionId/analysis', requireAuth, validatePredictionId, getStructuredAnalysis);
router.get('/:predictionId/insights', requireAuth, validatePredictionId, getInsightsForPrediction);
router.post('/:predictionId/explain', requireAuth, validatePredictionId, explainPrediction);

module.exports = router;
