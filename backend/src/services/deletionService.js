const Dataset = require('../models/Dataset');
const Vehicle = require('../models/Vehicle');
const PipelineRun = require('../models/PipelineRun');
const Prediction = require('../models/Prediction');
const AIInsight = require('../models/AIInsight');
const Notification = require('../models/Notification');
const storage = require('./storageService');
const { repairVehicle } = require('./analysisPersistenceService');
const { withVehicleLock } = require('./resourceLock');
const ApiError = require('../utils/apiError');

async function deleteOwnedDataset(dataset) {
  const userId = dataset.userId;
  const predictionIds = await Prediction.find({ datasetId: dataset._id, userId }).distinct('_id');
  // Unlink only this verified reference first; a filesystem error preserves the DB
  // record for an explicit retry. A crash between these operations is retryable.
  if (dataset.storage?.rawUrl) await storage.deleteRaw(dataset.storage, dataset.vehicleId);
  await AIInsight.deleteMany({ userId, predictionId: { $in: predictionIds } });
  await Notification.deleteMany({ userId, predictionId: { $in: predictionIds } });
  await Prediction.deleteMany({ userId, datasetId: dataset._id });
  await PipelineRun.deleteMany({ userId, datasetId: dataset._id });
  await Dataset.deleteOne({ _id: dataset._id, userId });
  if (dataset.fileHash && !await Dataset.exists({ vehicleId: dataset.vehicleId, userId, fileHash: dataset.fileHash })) {
    const prefix = 'anomaly:' + dataset.vehicleId + ':' + dataset.fileHash.slice(0, 24) + ':';
    await Notification.deleteMany({ userId, eventKey: { $regex: '^' + prefix } });
  }
}
async function assertIdle(vehicleId, userId) {
  if (require('./analysisPipelineService').isVehicleActive(vehicleId)
    || await Dataset.exists({ vehicleId, userId, status: 'processing' })
    || await PipelineRun.exists({ vehicleId, userId, status: { $in: ['queued', 'processing'] } })) {
    throw ApiError.conflict('Cannot delete while analysis is processing', 'CONFLICT');
  }
}
async function deleteDataset(userId, datasetId) {
  const dataset = await Dataset.findById(datasetId);
  if (!dataset) throw ApiError.notFound('Dataset not found', 'RESOURCE_NOT_FOUND');
  if (String(dataset.userId) !== userId) throw ApiError.forbidden('You do not have permission to delete this dataset');
  return withVehicleLock(dataset.vehicleId, async () => {
    const fresh = await Dataset.findOne({ _id: datasetId, userId });
    if (!fresh) throw ApiError.notFound('Dataset not found', 'RESOURCE_NOT_FOUND');
    await assertIdle(dataset.vehicleId, userId);
    await deleteOwnedDataset(fresh);
    await repairVehicle(dataset.vehicleId, userId);
    const remaining = await Dataset.find({ vehicleId: dataset.vehicleId, userId }).sort({ uploadedAt: -1 });
    const latest = remaining.find((d) => d.anomalies?.totalRecordsAnalyzed > 0);
    await Vehicle.updateOne({ _id: dataset.vehicleId, userId }, { $set: {
      unresolvedAnomaliesCount: remaining.reduce((sum, d) => sum + (d.anomalies?.unresolvedCount || 0), 0),
      latestAnomalyFinding: latest?.anomalies?.anomalies?.[0]?.title || null,
      latestAnomalyAt: latest?.uploadedAt || null,
    } });
  });
}
async function deleteVehicle(userId, vehicleId) {
  return withVehicleLock(vehicleId, async () => {
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) throw ApiError.notFound('Vehicle not found', 'RESOURCE_NOT_FOUND');
    if (String(vehicle.userId) !== userId) throw ApiError.forbidden('You do not have permission to delete this vehicle');
    await assertIdle(vehicleId, userId);
    const datasets = await Dataset.find({ vehicleId, userId });
    for (const dataset of datasets) await deleteOwnedDataset(dataset);
    await AIInsight.deleteMany({ vehicleId, userId });
    await Notification.deleteMany({ vehicleId, userId });
    await Prediction.deleteMany({ vehicleId, userId });
    await PipelineRun.deleteMany({ vehicleId, userId });
    await Vehicle.deleteOne({ _id: vehicleId, userId });
  });
}
module.exports = { deleteDataset, deleteVehicle };
