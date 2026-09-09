const path = require('path');
const Dataset = require('../models/Dataset');
const Vehicle = require('../models/Vehicle');
const PipelineRun = require('../models/PipelineRun');
const storageService = require('./storageService');
const ApiError = require('../utils/apiError');
const { formatDocument, formatDocuments } = require('../utils/idHelper');

class DatasetService {
  async listDatasetsForVehicle(userId, vehicleId) {
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      throw ApiError.notFound(`Vehicle not found with ID '${vehicleId}'`, 'RESOURCE_NOT_FOUND');
    }

    if (vehicle.userId.toString() !== userId) {
      throw ApiError.forbidden('You do not have permission to view datasets for this vehicle');
    }

    const datasets = await Dataset.find({ vehicleId }).sort({ uploadedAt: -1 });
    const total = await Dataset.countDocuments({ vehicleId });

    return {
      datasets: formatDocuments(datasets),
      total,
    };
  }

  async createDataset(userId, vehicleId, file, sourceType = 'user_upload') {
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      throw ApiError.notFound(`Vehicle not found with ID '${vehicleId}'`, 'RESOURCE_NOT_FOUND');
    }

    if (vehicle.userId.toString() !== userId) {
      throw ApiError.forbidden('You do not have permission to upload datasets for this vehicle');
    }

    if (!file) {
      throw ApiError.badRequest('A telemetry file (.csv, .json, .parquet) is required', 'VALIDATION_ERROR');
    }

    const rawExt = path.extname(file.originalname).toLowerCase().replace('.', '');
    const fileType = ['csv', 'json', 'parquet'].includes(rawExt) ? rawExt : 'csv';

    const storage = await storageService.saveRawTelemetry(vehicleId, file);

    const dataset = await Dataset.create({
      userId,
      vehicleId,
      manufacturer: vehicle.manufacturer,
      originalFileName: file.originalname,
      fileType,
      fileSize: file.size,
      sourceType: sourceType || 'user_upload',
      storage,
      schemaVersion: `${vehicle.manufacturer}_BMS_V1.0`,
      status: 'uploaded',
      uploadedAt: new Date(),
    });

    return formatDocument(dataset);
  }

  async getDatasetById(userId, datasetId) {
    const dataset = await Dataset.findById(datasetId);
    if (!dataset) {
      throw ApiError.notFound(`Dataset not found with ID '${datasetId}'`, 'RESOURCE_NOT_FOUND');
    }

    if (dataset.userId.toString() !== userId) {
      throw ApiError.forbidden('You do not have permission to access this dataset');
    }

    return formatDocument(dataset);
  }

  async deleteDataset(userId, datasetId) {
    const dataset = await Dataset.findById(datasetId);
    if (!dataset) {
      throw ApiError.notFound(`Dataset not found with ID '${datasetId}'`, 'RESOURCE_NOT_FOUND');
    }

    if (dataset.userId.toString() !== userId) {
      throw ApiError.forbidden('You do not have permission to delete this dataset');
    }

    await Dataset.findByIdAndDelete(datasetId);
    return null;
  }

  async triggerProcessing(userId, datasetId) {
    const dataset = await Dataset.findById(datasetId);
    if (!dataset) {
      throw ApiError.notFound(`Dataset not found with ID '${datasetId}'`, 'RESOURCE_NOT_FOUND');
    }

    if (dataset.userId.toString() !== userId) {
      throw ApiError.forbidden('You do not have permission to process this dataset');
    }

    if (dataset.status === 'processing') {
      throw ApiError.conflict('Dataset is already in processing state', 'CONFLICT');
    }

    const pipelineRun = await PipelineRun.create({
      datasetId: dataset._id,
      vehicleId: dataset.vehicleId,
      userId,
      manufacturerAdapter: `${dataset.manufacturer || 'Standard'}_Adapter`,
      pipelineVersion: '1.0.0',
      status: 'queued',
      startedAt: new Date(),
    });

    dataset.status = 'processing';
    await dataset.save();

    return {
      pipelineRunId: pipelineRun._id.toString(),
      datasetId: dataset._id.toString(),
      status: 'queued',
      startedAt: pipelineRun.startedAt,
    };
  }

  async getProcessingStatus(userId, datasetId) {
    const dataset = await Dataset.findById(datasetId);
    if (!dataset) {
      throw ApiError.notFound(`Dataset not found with ID '${datasetId}'`, 'RESOURCE_NOT_FOUND');
    }

    if (dataset.userId.toString() !== userId) {
      throw ApiError.forbidden('You do not have permission to view status for this dataset');
    }

    const pipelineRun = await PipelineRun.findOne({ datasetId }).sort({ startedAt: -1 });

    return {
      datasetId: dataset._id.toString(),
      status: dataset.status,
      pipelineRun: pipelineRun ? formatDocument(pipelineRun) : null,
    };
  }
}

module.exports = new DatasetService();
