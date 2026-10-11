const path = require('path');
const Dataset = require('../models/Dataset');
const Vehicle = require('../models/Vehicle');
const PipelineRun = require('../models/PipelineRun');
const storageService = require('./storageService');
const analysisPipelineService = require('./analysisPipelineService');
const csvParserService = require('./csvParserService');
const ApiError = require('../utils/apiError');
const { formatDocument, formatDocuments } = require('../utils/idHelper');

class DatasetService {
  async listDatasetsForVehicle(userId, vehicleId) {
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      throw ApiError.notFound('Vehicle not found', 'RESOURCE_NOT_FOUND');
    }
    if (vehicle.userId.toString() !== userId) {
      throw ApiError.forbidden('You do not have permission to access datasets for this vehicle');
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
      throw ApiError.notFound('Vehicle not found', 'RESOURCE_NOT_FOUND');
    }
    if (vehicle.userId.toString() !== userId) {
      throw ApiError.forbidden('You do not have permission to upload datasets to this vehicle');
    }

    if (!file) {
      throw ApiError.badRequest('A telemetry CSV or Excel (.xlsx) file is required', 'VALIDATION_ERROR');
    }

    const rawExt = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (['png', 'jpg', 'jpeg'].includes(rawExt)) {
      throw ApiError.badRequest('Screenshot/image uploads are no longer supported. Please upload a telemetry CSV or Excel file.', 'INVALID_FILE');
    }
    if (rawExt === 'mat') {
      throw ApiError.badRequest('MATLAB (.mat) uploads are no longer supported. Please upload a telemetry CSV or Excel file.', 'INVALID_FILE');
    }
    const fileType = ['xlsx', 'xls'].includes(rawExt) ? 'xlsx' : 'csv';

    // Duplicate detection via SHA-256
    const crypto = require('crypto');
    const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

    // Synchronously parse and validate the telemetry
    let parsedMetadata = null;
    if (fileType === 'csv' || fileType === 'xlsx') {
      parsedMetadata = csvParserService.parseBuffer(file.buffer);
    }

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
      recordCount: parsedMetadata ? parsedMetadata.recordCount : null,
      cycleCount: parsedMetadata ? parsedMetadata.cycleCount : null,
      columnStats: parsedMetadata ? parsedMetadata.columnStats : null,
      timeShare: parsedMetadata ? parsedMetadata.timeShare : null,
      cycleTable: parsedMetadata ? parsedMetadata.cycleTable : [],
      fadeShare: parsedMetadata ? parsedMetadata.fadeShare : null,
      chargingSessions: parsedMetadata ? parsedMetadata.chargingSessions : [],
      analysisReport: parsedMetadata ? parsedMetadata.analysisReport : [],
      schemaInfo: parsedMetadata ? parsedMetadata.schemaInfo : null,
      spreads: parsedMetadata ? parsedMetadata.spreads : null,
      sourceColumns: parsedMetadata ? parsedMetadata.sourceColumns : [],
      latestSoc: parsedMetadata ? parsedMetadata.latestSoc : null,
      selectedBatteryId: parsedMetadata ? parsedMetadata.selectedBatteryId : null,
      availableBatteries: parsedMetadata ? parsedMetadata.availableBatteries : [],
      anomalies: parsedMetadata ? parsedMetadata.anomalies : null,
      fileHash,
      soh: parsedMetadata ? parsedMetadata.soh : null,
      degradation: parsedMetadata ? parsedMetadata.degradation : null,
      rul: parsedMetadata ? parsedMetadata.rul : null,
      schemaVersion: 'EV_BMS_Telemetry_V1.0',
      status: 'uploaded',
      uploadedAt: new Date(),
    });

    // In-app notifications for actionable anomalies (high/critical). One notification per
    // (file, anomaly type); the upsert on eventKey makes re-processing / re-uploading the same
    // file idempotent, so the same event never notifies twice (atomic, no check-then-insert race).
    try {
      const Notification = require('../models/Notification');
      const events = (parsedMetadata?.anomalies?.anomalies || []).filter((a) => a.severity === 'high' || a.severity === 'critical');
      const byType = new Map();
      for (const a of events) {
        const cur = byType.get(a.type) || { count: 0, first: a };
        cur.count += 1;
        byType.set(a.type, cur);
      }
      for (const [type, { count, first }] of byType) {
        const eventKey = `anomaly:${vehicleId}:${fileHash.slice(0, 24)}:${type}`;
        await Notification.updateOne(
          { userId, eventKey },
          {
            $setOnInsert: {
              userId,
              vehicleId,
              type: 'anomaly_detected',
              title: first.title || 'Battery anomaly detected',
              message: `${count} ${first.severity} event${count > 1 ? 's' : ''} in ${file.originalname}. First: ${first.measuredValue} (limit ${first.threshold}).`,
              eventKey,
              read: false,
              createdAt: new Date(),
            },
          },
          { upsert: true }
        );
      }
    } catch (notifyErr) {
      // A notification failure must never fail the upload itself.
      console.error('Anomaly notification failed:', notifyErr.message);
    }

    // Update Vehicle totals: unresolved anomalies
    const allDatasets = await Dataset.find({ vehicleId });
    let unresolvedCount = 0;
    let latestFinding = null;

    for (const d of allDatasets) {
      if (d.anomalies && d.anomalies.unresolvedCount) {
        unresolvedCount += d.anomalies.unresolvedCount;
        if (d.anomalies.anomalies && d.anomalies.anomalies.length > 0 && !latestFinding) {
          latestFinding = d.anomalies.anomalies[0].title;
        }
      }
    }

    await Vehicle.findByIdAndUpdate(vehicleId, {
      unresolvedAnomaliesCount: unresolvedCount,
      latestAnomalyFinding: latestFinding || (parsedMetadata?.anomalies?.totalRecordsAnalyzed > 0 ? 'No anomalies detected against the generic reference limits in the latest analysis' : null),
      latestAnomalyAt: parsedMetadata?.anomalies?.totalRecordsAnalyzed > 0 ? new Date() : null,
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

  async triggerProcessing(userId, datasetId, options = {}) {
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

    // Fire-and-forget: progresses the pipeline stages and produces the
    // resulting Prediction/AIInsight/Notification in the background so the
    // request can respond 202 immediately, per the polling contract.
    analysisPipelineService.runPipeline(pipelineRun._id.toString(), options);

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
