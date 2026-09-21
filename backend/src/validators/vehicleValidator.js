const ApiError = require('../utils/apiError');
const { isValidObjectId } = require('../utils/idHelper');

const allowedStatuses = ['healthy', 'attention', 'critical', 'unknown'];

const validateVehicleId = (req, res, next) => {
  const { vehicleId } = req.params;
  if (!isValidObjectId(vehicleId)) {
    return next(ApiError.invalidObjectId('vehicleId'));
  }
  next();
};

const stringFields = [
  'vin',
  'trim',
  'cellType',
  'packVoltage',
  'internalResistance',
  'cellImbalance',
  'tempAvg',
  'degradationRate',
];

const validateCreateVehicle = (req, res, next) => {
  const {
    manufacturer,
    model,
    year,
    batteryVariant,
    nickname,
    batteryCapacityKWh,
    status,
    latestSOH,
    currentCycleCount,
  } = req.body || {};
  const details = {};

  // Manufacturer/model are optional free-text labels now that the app
  // manages a single personal EV rather than a fleet of named makes/models.
  if (manufacturer !== undefined && manufacturer !== null && typeof manufacturer === 'string') {
    req.body.manufacturer = manufacturer.trim().slice(0, 50);
  }

  if (model !== undefined && model !== null && typeof model === 'string') {
    if (model.trim().length > 50) {
      details.model = 'Model must be 50 characters or fewer';
    } else {
      req.body.model = model.trim();
    }
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

  if (latestSOH !== undefined && latestSOH !== null) {
    const numSoh = Number(latestSOH);
    if (isNaN(numSoh) || numSoh < 0 || numSoh > 100) {
      details.latestSOH = 'Initial SOH must be a number between 0 and 100';
    }
  }

  if (currentCycleCount !== undefined && currentCycleCount !== null) {
    const numCycles = Number(currentCycleCount);
    if (isNaN(numCycles) || numCycles < 0) {
      details.currentCycleCount = 'Cycle count must be a non-negative number';
    }
  }

  if (batteryVariant !== undefined && batteryVariant !== null && typeof batteryVariant === 'string') {
    req.body.batteryVariant = batteryVariant.trim();
  }

  if (nickname !== undefined && nickname !== null && typeof nickname === 'string') {
    req.body.nickname = nickname.trim();
  }

  stringFields.forEach((field) => {
    const value = req.body[field];
    if (value !== undefined && value !== null && typeof value === 'string') {
      req.body[field] = value.trim();
    }
  });

  if (Object.keys(details).length > 0) {
    return next(ApiError.badRequest('Validation error', 'VALIDATION_ERROR', details));
  }

  next();
};

const validateUpdateVehicle = (req, res, next) => {
  const { manufacturer, model, year, batteryCapacityKWh, status, batteryVariant, nickname } = req.body || {};
  const details = {};

  if (manufacturer !== undefined && manufacturer !== null && typeof manufacturer === 'string') {
    req.body.manufacturer = manufacturer.trim().slice(0, 50);
  }

  if (model !== undefined && model !== null && typeof model === 'string') {
    if (model.trim().length > 50) {
      details.model = 'Model must be 50 characters or fewer';
    } else {
      req.body.model = model.trim();
    }
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

  stringFields.forEach((field) => {
    const value = req.body[field];
    if (value !== undefined && value !== null && typeof value === 'string') {
      req.body[field] = value.trim();
    }
  });

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
