const ApiError = require('../utils/apiError');
const { isValidObjectId } = require('../utils/idHelper');

const allowedSourceTypes = ['user_upload', 'demo_dataset', 'synthetic_dataset'];

const validateDatasetId = (req, res, next) => {
  const { datasetId } = req.params;
  if (!isValidObjectId(datasetId)) {
    return next(ApiError.invalidObjectId('datasetId'));
  }
  next();
};

const validatePredictionId = (req, res, next) => {
  const { predictionId } = req.params;
  if (!isValidObjectId(predictionId)) {
    return next(ApiError.invalidObjectId('predictionId'));
  }
  next();
};

const validateNotificationId = (req, res, next) => {
  const { notificationId } = req.params;
  if (!isValidObjectId(notificationId)) {
    return next(ApiError.invalidObjectId('notificationId'));
  }
  next();
};

const validateCreateDataset = (req, res, next) => {
  const { sourceType } = req.body || {};
  const details = {};

  if (!req.file) {
    details.file = 'Telemetry file (.csv, .json, .parquet) is required';
  }

  if (sourceType && !allowedSourceTypes.includes(sourceType)) {
    details.sourceType = `Source type must be one of: ${allowedSourceTypes.join(', ')}`;
  }

  if (Object.keys(details).length > 0) {
    return next(ApiError.badRequest('Validation error', 'VALIDATION_ERROR', details));
  }

  next();
};

module.exports = {
  validateDatasetId,
  validatePredictionId,
  validateNotificationId,
  validateCreateDataset,
};
