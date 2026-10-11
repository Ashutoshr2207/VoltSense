const Vehicle = require('../models/Vehicle');
const ApiError = require('../utils/apiError');
const { formatDocument, formatDocuments } = require('../utils/idHelper');

class VehicleService {
  async listVehicles(userId, query = {}) {
    const filter = { userId };

    if (query.status) {
      filter.status = query.status.toLowerCase();
    }

    if (query.manufacturer) {
      filter.manufacturer = query.manufacturer;
    }

    if (query.search) {
      const searchRegex = new RegExp(query.search, 'i');
      filter.$or = [{ model: searchRegex }, { nickname: searchRegex }, { batteryVariant: searchRegex }];
    }

    const sortField = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

    const vehicles = await Vehicle.find(filter).sort({ [sortField]: sortOrder });
    const total = await Vehicle.countDocuments(filter);

    return {
      vehicles: formatDocuments(vehicles),
      total,
    };
  }

  async createVehicle(userId, data) {
    // This build manages a single personal EV per account rather than a
    // fleet, so guard against accidentally creating a second vehicle record.
    const existing = await Vehicle.findOne({ userId });
    if (existing) {
      throw ApiError.conflict(
        'You already have a vehicle set up. Update it from Settings, or delete it before adding a different one.',
        'VEHICLE_ALREADY_EXISTS'
      );
    }

    const latestSOH = data.latestSOH !== undefined && data.latestSOH !== null ? Number(data.latestSOH) : null;
    const currentCycleCount =
      data.currentCycleCount !== undefined && data.currentCycleCount !== null
        ? Number(data.currentCycleCount)
        : null;

    // Derive a projected RUL/EOL from the initial SOH reading, mirroring the
    // simple linear heuristic used elsewhere in the platform until a real
    // pipeline run produces a model-fitted prediction for this vehicle.
    const latestRUL = latestSOH !== null ? Math.max(0, Math.round((latestSOH - 70) * 28)) : null;
    const latestEOL = latestRUL !== null && currentCycleCount !== null ? currentCycleCount + latestRUL : null;

    const status = data.status || (latestSOH !== null ? (latestSOH >= 90 ? 'healthy' : 'attention') : 'unknown');

    const vehicle = await Vehicle.create({
      userId,
      manufacturer: data.manufacturer,
      model: data.model,
      year: data.year || null,
      batteryVariant: data.batteryVariant || null,
      nickname: data.nickname || null,
      batteryCapacityKWh: data.batteryCapacityKWh || null,
      vin: data.vin || null,
      trim: data.trim || null,
      cellType: data.cellType || null,
      packVoltage: data.packVoltage || null,
      internalResistance: data.internalResistance || null,
      cellImbalance: data.cellImbalance || null,
      tempAvg: data.tempAvg || null,
      degradationRate: data.degradationRate || null,
      status,
      latestSOH,
      currentCycleCount,
      latestRUL,
      latestEOL,
    });

    return formatDocument(vehicle);
  }

  async getVehicleById(userId, vehicleId) {
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      throw ApiError.notFound(`Vehicle not found with ID '${vehicleId}'`, 'RESOURCE_NOT_FOUND');
    }
    if (vehicle.userId.toString() !== userId) {
      throw ApiError.forbidden('You do not have permission to access this vehicle');
    }

    return formatDocument(vehicle);
  }

  async updateVehicle(userId, vehicleId, data) {
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      throw ApiError.notFound(`Vehicle not found with ID '${vehicleId}'`, 'RESOURCE_NOT_FOUND');
    }

    if (vehicle.userId.toString() !== userId) {
      throw ApiError.forbidden('You do not have permission to modify this vehicle');
    }

    const updatableFields = [
      'manufacturer',
      'model',
      'year',
      'batteryVariant',
      'nickname',
      'batteryCapacityKWh',
      'status',
      'vin',
      'trim',
      'cellType',
      'packVoltage',
      'internalResistance',
      'cellImbalance',
      'tempAvg',
      'degradationRate',
    ];

    updatableFields.forEach((field) => {
      if (data[field] !== undefined) {
        vehicle[field] = data[field];
      }
    });

    await vehicle.save();
    return formatDocument(vehicle);
  }

  async deleteVehicle(userId, vehicleId) {
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      throw ApiError.notFound(`Vehicle not found with ID '${vehicleId}'`, 'RESOURCE_NOT_FOUND');
    }

    if (vehicle.userId.toString() !== userId) {
      throw ApiError.forbidden('You do not have permission to delete this vehicle');
    }

    await Vehicle.findByIdAndDelete(vehicleId);
    return null;
  }
}

module.exports = new VehicleService();
