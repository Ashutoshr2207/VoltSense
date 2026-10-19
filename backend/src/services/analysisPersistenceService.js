const Dataset = require('../models/Dataset');
const PipelineRun = require('../models/PipelineRun');
const Prediction = require('../models/Prediction');
const Vehicle = require('../models/Vehicle');
const AIInsight = require('../models/AIInsight');
const Notification = require('../models/Notification');

async function repairVehicle(vehicleId, userId) {
  const runs = await PipelineRun.find({ vehicleId, userId, status: 'completed' }).distinct('_id');
  const latest = await Prediction.findOne({ vehicleId, userId, pipelineRunId: { $in: runs } }).sort({ measurementDate: -1, createdAt: -1, _id: -1 });
  const p = latest?.prediction;
  await Vehicle.updateOne({ _id: vehicleId, userId }, { $set: {
    latestPredictionId: latest?._id || null,
    latestSOH: p?.soh ?? null, latestRUL: p?.rulCycles ?? null,
    latestEOL: p?.estimatedEOLCycle ?? null, currentCycleCount: p?.currentCycle ?? null,
    status: p?.soh == null ? 'unknown' : p.soh >= 90 ? 'healthy' : p.soh >= 80 ? 'attention' : 'critical',
  } });
}

async function rollbackRun(run) {
  const ids = await Prediction.find({ pipelineRunId: run._id, userId: run.userId }).distinct('_id');
  await AIInsight.deleteMany({ predictionId: { $in: ids }, userId: run.userId });
  await Notification.deleteMany({ userId: run.userId, $or: [{ predictionId: { $in: ids } }, { eventKey: 'analysis:' + run._id }] });
  await Prediction.deleteMany({ pipelineRunId: run._id, userId: run.userId });
  await repairVehicle(run.vehicleId, run.userId);
}

// Single worker startup recovery: do not rerun inference or manufacture results.
async function reconcileInterruptedRuns() {
  const runs = await PipelineRun.find({ status: { $in: ['queued', 'processing'] } });
  for (const run of runs) {
    run.status = 'failed';
    run.errors.push('Processing interrupted by backend restart; explicitly retry this dataset.');
    run.completedAt = new Date();
    for (const key of Object.keys(run.stages.toObject())) {
      if (run.stages[key].status === 'processing') {
        run.stages[key].status = 'failed'; run.stages[key].completedAt = new Date();
      }
    }
    await run.save();
    await rollbackRun(run);
    await Dataset.updateOne({ _id: run.datasetId, userId: run.userId }, { $set: { status: 'failed', processedAt: null } });
  }
  await Dataset.updateMany({ status: 'processing' }, { $set: { status: 'failed', processedAt: null } });
  // Complete the pointer publication if a crash occurred immediately after commit.
  const completed = await PipelineRun.find({ status: 'completed' }).select('vehicleId userId');
  const repaired = new Set();
  for (const run of completed) {
    if (!repaired.has(String(run.vehicleId))) {
      await repairVehicle(run.vehicleId, run.userId); repaired.add(String(run.vehicleId));
    }
  }
}
module.exports = { repairVehicle, rollbackRun, reconcileInterruptedRuns };
