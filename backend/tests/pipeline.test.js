const request = require('supertest');
const app = require('../src/app');
const { createTestUser } = require('./setup');
const Vehicle = require('../src/models/Vehicle');
const Dataset = require('../src/models/Dataset');
const PipelineRun = require('../src/models/PipelineRun');
const Prediction = require('../src/models/Prediction');
const AIInsight = require('../src/models/AIInsight');
const Notification = require('../src/models/Notification');
const pipeline = require('../src/services/analysisPipelineService');
const service = require('../src/services/datasetService');
const ml = require('../src/services/mlClient');
const recovery = require('../src/services/analysisPersistenceService');
const storage = require('../src/services/storageService');
const csv = 'Cycle,Capacity\n' + Array.from({ length: 8 }, (_, i) => (i + 1) + ',' + (2 - i * 0.02)).join('\n');
let user, token, vehicle;
beforeEach(async () => {
  ({ user, token } = await createTestUser());
  vehicle = await Vehicle.create({ userId: user.id, manufacturer: 'Tesla', model: 'Model 3' });
});
async function upload(content = csv) {
  return service.createDataset(user.id, vehicle.id, { originalname: 'sample.csv', buffer: Buffer.from(content), size: Buffer.byteLength(content) });
}
function validML() {
  return { soh: 93, rul: 30, capacity: 1.86, referenceCapacity: 2, currentCycle: 8, eolThreshold: 80,
    model: { name: 'Approved fixture', version: 'test', algorithm: 'Test double' }, factors: [], recommendations: [],
    confidence: { calibrated: false, value: null }, metrics: { mae: null, rmse: null, r2: null } };
}
test('success records real stage times and authoritative model report, once per run', async () => {
  jest.spyOn(ml, 'predict').mockResolvedValue({ available: true, result: validML() });
  const dataset = await upload();
  const response = await service.triggerProcessing(user.id, dataset.id);
  await pipeline.drain();
  await pipeline.runPipeline(response.pipelineRunId);
  const run = await PipelineRun.findById(response.pipelineRunId);
  expect(run.status).toBe('completed');
  for (const stage of Object.values(run.stages.toObject())) {
    expect(stage.status).toBe('completed');
    expect(stage.startedAt).toBeInstanceOf(Date);
    expect(stage.completedAt.getTime()).toBeGreaterThanOrEqual(stage.startedAt.getTime());
  }
  expect(await Prediction.countDocuments({ pipelineRunId: run.id })).toBe(1);
  expect(await Notification.countDocuments({ eventKey: 'analysis:' + run.id })).toBe(1);
  const stored = await Dataset.findById(dataset.id);
  expect(stored.analysisReport.find((a) => a.id === 'rul').result.rulCycles).toBe(30);
  expect((await Vehicle.findById(vehicle.id)).latestRUL).toBe(30);
});
test('simultaneous submissions create one active run, failure is inspectable, retry succeeds', async () => {
  let release;
  jest.spyOn(ml, 'predict').mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  const dataset = await upload();
  const results = await Promise.allSettled([service.triggerProcessing(user.id, dataset.id), service.triggerProcessing(user.id, dataset.id)]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(await PipelineRun.countDocuments({ datasetId: dataset.id })).toBe(1);
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  release({ available: false, reason: 'timeout' });
  await pipeline.drain();
  let run = await PipelineRun.findOne({ datasetId: dataset.id });
  expect(run.status).toBe('failed');
  expect(run.stages.featureEngineering.status).toBe('failed');
  expect(run.errors.join(' ')).toMatch(/timeout/);
  expect(await Prediction.countDocuments()).toBe(0);
  ml.predict.mockResolvedValue({ available: true, result: validML() });
  await service.triggerProcessing(user.id, dataset.id);
  await pipeline.drain();
  expect(await PipelineRun.countDocuments({ datasetId: dataset.id })).toBe(2);
  expect(await Prediction.countDocuments()).toBe(1);
});
test('missing raw file fails validation instead of reusing cached metadata', async () => {
  const dataset = await upload();
  await storage.deleteRaw(dataset.storage, vehicle.id);
  const response = await service.triggerProcessing(user.id, dataset.id);
  await pipeline.drain();
  const run = await PipelineRun.findById(response.pipelineRunId);
  expect(run.status).toBe('failed');
  expect(run.stages.validation.status).toBe('failed');
});
test('telemetry remains available without pretending to run ML transformations', async () => {
  const dataset = await upload('time,hv_voltage\n0,350\n1,351');
  const response = await service.triggerProcessing(user.id, dataset.id);
  await pipeline.drain();
  const run = await PipelineRun.findById(response.pipelineRunId);
  expect(run.status).toBe('completed');
  expect(run.stages.featureEngineering.status).toBe('skipped');
  const p = await Prediction.findOne({ pipelineRunId: run.id });
  expect(p.prediction.soh).toBeNull(); expect(p.prediction.rulCycles).toBeNull();
  const view = await request(app).get('/api/predictions/' + p.id).set('Authorization', 'Bearer ' + token);
  expect(view.status).toBe(200);
});
test('persistence error compensates partial prediction and allows retry', async () => {
  jest.spyOn(ml, 'predict').mockResolvedValue({ available: true, result: validML() });
  jest.spyOn(AIInsight, 'findOneAndUpdate').mockRejectedValueOnce(new Error('write failed'));
  const dataset = await upload();
  await service.triggerProcessing(user.id, dataset.id); await pipeline.drain();
  expect(await Prediction.countDocuments()).toBe(0);
  expect((await Dataset.findById(dataset.id)).status).toBe('failed');
  await service.triggerProcessing(user.id, dataset.id); await pipeline.drain();
  expect(await Prediction.countDocuments()).toBe(1);
});
test('restart reconciliation fails interrupted runs without replaying inference', async () => {
  const dataset = await upload();
  await Dataset.updateOne({ _id: dataset.id }, { status: 'processing' });
  const run = await PipelineRun.create({ datasetId: dataset.id, vehicleId: vehicle.id, userId: user.id, status: 'processing' });
  await recovery.reconcileInterruptedRuns();
  expect((await PipelineRun.findById(run.id)).status).toBe('failed');
  expect((await Dataset.findById(dataset.id)).status).toBe('failed');
});

test('results of an unfinished run are hidden until the persistence commit', async () => {
  jest.spyOn(ml, 'predict').mockResolvedValue({ available: true, result: validML() });
  const dataset = await upload();
  const response = await service.triggerProcessing(user.id, dataset.id); await pipeline.drain();
  const p = await Prediction.findOne();
  await PipelineRun.updateOne({ _id: response.pipelineRunId }, { status: 'processing' });
  const listed = await request(app).get('/api/vehicles/' + vehicle.id + '/predictions').set('Authorization', 'Bearer ' + token);
  expect(listed.body.data.predictions).toHaveLength(0);
  const detail = await request(app).get('/api/predictions/' + p.id).set('Authorization', 'Bearer ' + token);
  expect(detail.status).toBe(404);
  const insights = await request(app).get('/api/predictions/' + p.id + '/insights').set('Authorization', 'Bearer ' + token);
  expect(insights.status).toBe(404);
  const notifications = await request(app).get('/api/notifications').set('Authorization', 'Bearer ' + token);
  expect(notifications.body.data.notifications).toHaveLength(0);
});

test('cycle gaps fail the validation stage and downgrade data quality', async () => {
  const dataset = await upload(csv.replace('\n8,', '\n9,'));
  const response = await service.triggerProcessing(user.id, dataset.id); await pipeline.drain();
  const run = await PipelineRun.findById(response.pipelineRunId);
  expect(run.status).toBe('failed');
  expect(run.stages.validation.status).toBe('failed');
  expect((await Dataset.findById(dataset.id)).dataQuality.overallQuality).toBe('poor');
});

test.each([1.6, 1.5, 2.1])('terminal RUL preserves first crossing after latest capacity %s Ah', async (latest) => {
  const capacities = [2, 1.98, 1.96, 1.94, 1.92, 1.9, 1.6, latest];
  const content = 'Cycle,Capacity' + String.fromCharCode(10) + capacities.map((q, i) => (i + 1) + ',' + q).join(String.fromCharCode(10));
  jest.spyOn(ml, 'predict').mockResolvedValue({ available: true, result: { ...validML(), rul: 0 } });
  const dataset = await upload(content);
  await service.triggerProcessing(user.id, dataset.id);
  await pipeline.drain();
  const prediction = await Prediction.findOne();
  expect(prediction.prediction.rulCycles).toBe(0);
  expect(prediction.prediction.currentCycle).toBe(8);
  expect(prediction.prediction.estimatedEOLCycle).toBe(7);
  expect((await Dataset.findById(dataset.id)).rul.predictedEOLCycle).toBe(7);
  expect((await Vehicle.findById(vehicle.id)).latestRUL).toBe(0);
  const stored = await Dataset.findById(dataset.id);
  expect(stored.analysisReport.find((a) => a.id === 'rul').reason).toMatch(/Observed 80% SOH/);
  expect((await AIInsight.findOne()).summary).toMatch(/cycle 7/);
});
