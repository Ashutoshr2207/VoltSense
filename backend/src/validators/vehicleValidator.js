const ApiError = require('../utils/apiError');
const { isValidObjectId } = require('../utils/idHelper');

const allowedManufacturers = ['Tesla', 'BYD', 'Tata'];
const allowedStatuses = ['healthy', 'attention', 'critical', 'unknown'];

const validateVehicleId = (req, res, next) => {
  const { vehicleId } = req.params;
  if (!isValidObjectId(vehicleId)) {
    return next(ApiError.invalidObjectId('vehicleId'));
  }
  next();
};

const validateCreateVehicle = (req, res, next) => {
  const { manufacturer, model, year, batteryVariant, nickname, batteryCapacityKWh, status } = req.body || {};
  const details = {};

  if (!manufacturer || !allowedManufacturers.includes(manufacturer)) {
    details.manufacturer = `Manufacturer is required and must be one of: ${allowedManufacturers.join(', ')}`;
  }

  if (!model || typeof model !== 'string' || model.trim().length === 0 || model.trim().length > 50) {
    details.model = 'Model is required and must be between 1 and 50 characters';
  }

  if (year !== undefined && year !== null) {
    const numYear = Number(year);
    if (!Number.isInteger(numYear) || numYear < 2010 || numYear > 2030) {
      details.year = 'Year must be an integer between 2010 and 2030';
    }
  }

  if (batteryCapacityKWh !== undefined && batteryCapacityKWh !== null) {
    const numCap = Number(batteryCapacityKWh);
    if (isNaN(numCap) || numCap < 10 || numCap > 250) {
      details.batteryCapacityKWh = 'Battery capacity must be a number between 10.0 and 250.0 kWh';
    }
  }

  if (status !== undefined && status !== null && !allowedStatuses.includes(status)) {
    details.status = `Status must be one of: ${allowedStatuses.join(', ')}`;
  }

  if (batteryVariant !== undefined && batteryVariant !== null && typeof batteryVariant === 'string') {
    req.body.batteryVariant = batteryVariant.trim();
  }

  if (nickname !== undefined && nickname !== null && typeof nickname === 'string') {
    req.body.nickname = nickname.trim();
  }

  if (Object.keys(details).length > 0) {
    return next(ApiError.badRequest('Validation error', 'VALIDATION_ERROR', details));
  }

  next();
};

const validateUpdateVehicle = (req, res, next) => {
  const { manufacturer, model, year, batteryCapacityKWh, status, batteryVariant, nickname } = req.body || {};
  const details = {};

  if (manufacturer !== undefined && !allowedManufacturers.includes(manufacturer)) {
    details.manufacturer = `Manufacturer must be one of: ${allowedManufacturers.join(', ')}`;
  }

  if (model !== undefined && (typeof model !== 'string' || model.trim().length === 0 || model.trim().length > 50)) {
    details.model = 'Model must be between 1 and 50 characters';
  }

  if (year !== undefined && year !== null) {
    const numYear = Number(year);
    if (!Number.isInteger(numYear) || numYear < 2010 || numYear > 2030) {
      details.year = 'Year must be an integer between 2010 and 2030';
    }
  }

  if (batteryCapacityKWh !== undefined && batteryCapacityKWh !== null) {
    const numCap = Number(batteryCapacityKWh);
    if (isNaN(numCap) || numCap < 10 || numCap > 250) {
      details.batteryCapacityKWh = 'Battery capacity must be a number between 10.0 and 250.0 kWh';
    }
  }

  if (status !== undefined && status !== null && !allowedStatuses.includes(status)) {
    details.status = `Status must be one of: ${allowedStatuses.join(', ')}`;
  }

  if (batteryVariant !== undefined && batteryVariant !== null && typeof batteryVariant === 'string') {
    req.body.batteryVariant = batteryVariant.trim();
  }

  if (nickname !== undefined && nickname !== null && typeof nickname === 'string') {
    req.body.nickname = nickname.trim();
  }

  if (Object.keys(details).length > 0) {
    return next(ApiError.badRequest('Validation error', 'VALIDATION_ERROR', details));
  }

  next();
};

module.exports = {
  validateVehicleId,
  validateCreateVehicle,
  validateUpdateVehicle,
};
