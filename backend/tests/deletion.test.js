const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { createTestUser } = require('./setup');
const Vehicle = require('../src/models/Vehicle');
const Dataset = require('../src/models/Dataset');
const Prediction = require('../src/models/Prediction');
const PipelineRun = require('../src/models/PipelineRun');
const Notification = require('../src/models/Notification');
const AIInsight = require('../src/models/AIInsight');
const datasets = require('../src/services/datasetService');
const vehicles = require('../src/services/vehicleService');
const storage = require('../src/services/storageService');
const { StorageService } = storage;
const pipeline = require('../src/services/analysisPipelineService');
let user, vehicle;
beforeEach(async () => {
  ({ user } = await createTestUser());
  vehicle = await Vehicle.create({ userId: user.id, manufacturer: 'Tesla', model: '3' });
});
let uploaded = 0;
async function upload() {
  const buffer = Buffer.from('time,hv_voltage\n1,350\n2,' + (351 + uploaded++));
  return datasets.createDataset(user.id, vehicle.id, { originalname: 'x.csv', buffer, size: buffer.length });
}
test('dataset cascade deletes only its file/dependents and repairs latest pointer', async () => {
  const first = await upload();
  await datasets.triggerProcessing(user.id, first.id); await pipeline.drain();
  const second = await upload();
  await datasets.triggerProcessing(user.id, second.id); await pipeline.drain();
  const preserved = await storage.readRaw(first.storage, vehicle.id);
  await datasets.deleteDataset(user.id, second.id);
  expect(await Dataset.countDocuments()).toBe(1);
  expect(await Prediction.countDocuments()).toBe(1);
  expect(await AIInsight.countDocuments()).toBe(1);
  expect(await PipelineRun.countDocuments()).toBe(1);
  expect(await Notification.countDocuments()).toBe(1);
  expect(await storage.readRaw(first.storage, vehicle.id)).toEqual(preserved);
  await expect(storage.readRaw(second.storage, vehicle.id)).rejects.toThrow();
  const latest = await Prediction.findOne();
  expect(String((await Vehicle.findById(vehicle.id)).latestPredictionId)).toBe(latest.id);
});
test('vehicle cascade preserves another owner and unrelated files', async () => {
  const a = await upload();
  const other = await createTestUser();
  const v = await Vehicle.create({ userId: other.user.id, manufacturer: 'Tesla', model: 'Y' });
  const buffer = Buffer.from('Cycle,Capacity\n1,2');
  const b = await datasets.createDataset(other.user.id, v.id, { originalname: 'b.csv', buffer, size: buffer.length });
  await vehicles.deleteVehicle(user.id, vehicle.id);
  expect(await Dataset.findById(a.id)).toBeNull();
  expect(await Vehicle.findById(v.id)).not.toBeNull();
  expect(await storage.readRaw(b.storage, v.id)).toEqual(buffer);
});
test('active analysis blocks deletion and unauthorized deletion preserves data', async () => {
  const a = await upload();
  const other = await createTestUser();
  await expect(datasets.deleteDataset(other.user.id, a.id)).rejects.toMatchObject({ statusCode: 403 });
  await Dataset.updateOne({ _id: a.id }, { status: 'processing' });
  await expect(vehicles.deleteVehicle(user.id, vehicle.id)).rejects.toMatchObject({ statusCode: 409 });
  expect(await storage.readRaw(a.storage, vehicle.id)).toBeInstanceOf(Buffer);
});
test('unsafe and cross-vehicle paths cannot be unlinked; absent files are idempotent', async () => {
  const a = await upload();
  const other = 'abcdef012345678901234567';
  await expect(storage.deleteRaw(a.storage, other)).rejects.toThrow();
  await expect(storage.deleteRaw({ provider: 'local', rawUrl: '/uploads/raw/' + vehicle.id + '/../outside.csv' }, vehicle.id)).rejects.toThrow();
  await storage.deleteRaw(a.storage, vehicle.id);
  await storage.deleteRaw(a.storage, vehicle.id);
});
test('failed metadata insertion removes only the newly created raw upload', async () => {
  const a = await upload();
  jest.spyOn(Dataset, 'create').mockRejectedValueOnce(new Error('database write failure'));
  await expect(upload()).rejects.toThrow('database write failure');
  const folder = path.dirname(await storage.resolveRaw(a.storage, vehicle.id));
  expect(await fs.readdir(folder)).toHaveLength(1);
});

test('publication still in flight blocks deletion even after database completion', async () => {
  const dataset = await upload();
  jest.spyOn(pipeline, 'isVehicleActive').mockReturnValueOnce(true);
  await expect(datasets.deleteDataset(user.id, dataset.id)).rejects.toMatchObject({ statusCode: 409 });
  expect(await Dataset.findById(dataset.id)).not.toBeNull();
});

test('metadata-only datasets delete without a raw reference; unsafe references still fail', async () => {
  const a = await upload();
  await storage.deleteRaw(a.storage, vehicle.id);
  await Dataset.updateOne({ _id: a.id }, { $unset: { storage: '' } });
  const spy = jest.spyOn(storage, 'deleteRaw');
  await datasets.deleteDataset(user.id, a.id);
  expect(spy).not.toHaveBeenCalled();
  expect(await Dataset.findById(a.id)).toBeNull();
  const b = await upload();
  await Dataset.updateOne({ _id: b.id }, { $set: { 'storage.rawUrl': '/uploads/raw/unsafe.csv' } });
  await expect(datasets.deleteDataset(user.id, b.id)).rejects.toThrow('Unsafe');
  expect(await Dataset.findById(b.id)).not.toBeNull();
});
