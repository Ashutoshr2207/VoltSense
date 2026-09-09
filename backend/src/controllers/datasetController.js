const datasetService = require('../services/datasetService');
const ApiResponse = require('../utils/apiResponse');

const listDatasetsForVehicle = async (req, res, next) => {
  try {
    const result = await datasetService.listDatasetsForVehicle(req.userId, req.params.vehicleId);
    return ApiResponse.success(res, result);
  } catch (error) {
    next(error);
  }
};

const createDataset = async (req, res, next) => {
  try {
    const { sourceType } = req.body;
    const dataset = await datasetService.createDataset(
      req.userId,
      req.params.vehicleId,
      req.file,
      sourceType
    );
    return ApiResponse.created(res, { dataset }, 'Telemetry file uploaded successfully');
  } catch (error) {
    next(error);
  }
};

const getDatasetById = async (req, res, next) => {
  try {
    const dataset = await datasetService.getDatasetById(req.userId, req.params.datasetId);
    return ApiResponse.success(res, { dataset });
  } catch (error) {
    next(error);
  }
};

const deleteDataset = async (req, res, next) => {
  try {
    await datasetService.deleteDataset(req.userId, req.params.datasetId);
    return ApiResponse.success(res, null, 'Dataset deleted successfully');
  } catch (error) {
    next(error);
  }
};

const triggerProcessing = async (req, res, next) => {
  try {
    const result = await datasetService.triggerProcessing(req.userId, req.params.datasetId);
    return ApiResponse.accepted(res, result, 'Data pipeline execution initiated');
  } catch (error) {
    next(error);
  }
};

const getProcessingStatus = async (req, res, next) => {
  try {
    const result = await datasetService.getProcessingStatus(req.userId, req.params.datasetId);
    return ApiResponse.success(res, result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listDatasetsForVehicle,
  createDataset,
  getDatasetById,
  deleteDataset,
  triggerProcessing,
  getProcessingStatus,
};
