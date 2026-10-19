const express = require('express');
const {
  listVehicles,
  createVehicle,
  getVehicleById,
  updateVehicle,
  deleteVehicle,
} = require('../controllers/vehicleController');
const {
  listDatasetsForVehicle,
  createDataset,
} = require('../controllers/datasetController');
const {
  listPredictionsForVehicle,
} = require('../controllers/predictionController');
const {
  validateVehicleId,
  validateCreateVehicle,
  validateUpdateVehicle,
} = require('../validators/vehicleValidator');
const { validateCreateDataset } = require('../validators/datasetValidator');
const { requireAuth } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const vehicleService = require('../services/vehicleService');
const authorizeVehicle = async (req, res, next) => {
  try { await vehicleService.getVehicleById(req.userId, req.params.vehicleId); next(); }
  catch (err) { next(err); }
};

const router = express.Router();

// Vehicle CRUD
router.get('/', requireAuth, listVehicles);
router.post('/', requireAuth, validateCreateVehicle, createVehicle);
router.get('/:vehicleId', requireAuth, validateVehicleId, getVehicleById);
router.patch('/:vehicleId', requireAuth, validateVehicleId, validateUpdateVehicle, updateVehicle);
router.delete('/:vehicleId', requireAuth, validateVehicleId, deleteVehicle);

// Nested: Datasets for Vehicle
router.get('/:vehicleId/datasets', requireAuth, validateVehicleId, listDatasetsForVehicle);
router.post(
  '/:vehicleId/datasets',
  requireAuth,
  validateVehicleId,
  authorizeVehicle,
  upload.single('file'),
  validateCreateDataset,
  createDataset
);

// Nested: Predictions for Vehicle
router.get('/:vehicleId/predictions', requireAuth, validateVehicleId, listPredictionsForVehicle);

module.exports = router;
