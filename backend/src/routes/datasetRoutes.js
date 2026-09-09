const express = require('express');
const {
  getDatasetById,
  deleteDataset,
  triggerProcessing,
  getProcessingStatus,
} = require('../controllers/datasetController');
const { validateDatasetId } = require('../validators/datasetValidator');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/:datasetId', requireAuth, validateDatasetId, getDatasetById);
router.delete('/:datasetId', requireAuth, validateDatasetId, deleteDataset);
router.post('/:datasetId/process', requireAuth, validateDatasetId, triggerProcessing);
router.get('/:datasetId/status', requireAuth, validateDatasetId, getProcessingStatus);

module.exports = router;
