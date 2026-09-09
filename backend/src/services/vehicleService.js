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
    const vehicle = await Vehicle.create({
      userId,
      manufacturer: data.manufacturer,
      model: data.model,
      year: data.year || null,
      batteryVariant: data.batteryVariant || null,
      nickname: data.nickname || null,
      batteryCapacityKWh: data.batteryCapacityKWh || null,
      status: data.status || 'unknown',
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
