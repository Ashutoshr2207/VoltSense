const vehicleService = require('../services/vehicleService');
const ApiResponse = require('../utils/apiResponse');

const listVehicles = async (req, res, next) => {
  try {
    const result = await vehicleService.listVehicles(req.userId, req.query);
    return ApiResponse.success(res, result);
  } catch (error) {
    next(error);
  }
};

const createVehicle = async (req, res, next) => {
  try {
    const vehicle = await vehicleService.createVehicle(req.userId, req.body);
    return ApiResponse.created(res, { vehicle }, 'Vehicle registered successfully');
  } catch (error) {
    next(error);
  }
};

const getVehicleById = async (req, res, next) => {
  try {
    const vehicle = await vehicleService.getVehicleById(req.userId, req.params.vehicleId);
    return ApiResponse.success(res, { vehicle });
  } catch (error) {
    next(error);
  }
};

const updateVehicle = async (req, res, next) => {
  try {
    const vehicle = await vehicleService.updateVehicle(req.userId, req.params.vehicleId, req.body);
    return ApiResponse.success(res, { vehicle }, 'Vehicle updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteVehicle = async (req, res, next) => {
  try {
    await vehicleService.deleteVehicle(req.userId, req.params.vehicleId);
    return ApiResponse.success(res, null, 'Vehicle deleted successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listVehicles,
  createVehicle,
  getVehicleById,
  updateVehicle,
  deleteVehicle,
};
