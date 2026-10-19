const request = require('supertest');
const app = require('../src/app');
require('./setup');
const pipeline = require('../src/services/analysisPipelineService');
const Dataset = require('../src/models/Dataset');
const Prediction = require('../src/models/Prediction');

test('register, login, upload, process, retrieve history and reauthenticate preserve API contracts', async () => {
  const credentials = { email: 'journey@test.io', password: 'Password123!' };
  let res = await request(app).post('/api/auth/register').send({ ...credentials, name: 'Journey User' });
  expect(res.status).toBe(201);
  const token = res.body.data.token;
  res = await request(app).post('/api/vehicles').set('Authorization', 'Bearer ' + token).send({ manufacturer: 'Tesla', model: 'Model 3', latestSOH: 95, currentCycleCount: 7 });
  expect(res.status).toBe(201);
  const vehicle = res.body.data.vehicle;
  expect(vehicle.latestRUL).toBeNull();
  const raw = Buffer.from('Cycle,Capacity\n' + Array.from({ length: 7 }, (_, i) => (i + 1) + ',' + (2 - i * .02)).join('\n'));
  const upload = () => request(app).post('/api/vehicles/' + vehicle.id + '/datasets').set('Authorization', 'Bearer ' + token).attach('file', raw, 'cycles.csv');
  const first = await upload(); const duplicate = await upload();
  expect(first.status).toBe(201);
  expect(duplicate.body.data.dataset.id).toBe(first.body.data.dataset.id);
  expect(await Dataset.countDocuments()).toBe(1);
  const dataset = first.body.data.dataset;
  global.fetch.mockResolvedValue({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ soh: 94, rul: 20, capacity: 1.88,
    referenceCapacity: 2, currentCycle: 7, eolThreshold: 80, status: 'healthy', factors: [], recommendations: [],
    model: { name: 'Approved fixture', version: 'test', algorithm: 'Untrained double' },
    metrics: { mae: null, rmse: null, r2: null }, confidence: { calibrated: false, value: null } }) });
  res = await request(app).post('/api/datasets/' + dataset.id + '/process').set('Authorization', 'Bearer ' + token).send({});
  expect(res.status).toBe(202);
  expect(Object.keys(res.body.data).sort()).toEqual(['datasetId', 'pipelineRunId', 'startedAt', 'status']);
  await pipeline.drain();
  res = await request(app).get('/api/datasets/' + dataset.id + '/status').set('Authorization', 'Bearer ' + token);
  expect(res.body.data.status).toBe('processed');
  expect(res.body.data.pipelineRun.status).toBe('completed');
  res = await request(app).post('/api/auth/login').send(credentials);
  expect(res.status).toBe(200);
  const refreshed = res.body.data.token;
  res = await request(app).get('/api/vehicles/' + vehicle.id + '/predictions').set('Authorization', 'Bearer ' + refreshed);
  expect(res.status).toBe(200);
  expect(res.body.data.predictions).toHaveLength(1);
  const prediction = res.body.data.predictions[0];
  expect(prediction.prediction.rulCycles).toBe(20);
  res = await request(app).get('/api/predictions/' + prediction.id).set('Authorization', 'Bearer ' + refreshed);
  expect(res.body.data.prediction.structuredAnalysis.soh.measured).toBe(94);
  for (const endpoint of ['/api/predictions/' + prediction.id + '/insights', '/api/vehicles/' + vehicle.id + '/anomalies']) {
    expect((await request(app).get(endpoint).set('Authorization', 'Bearer ' + refreshed)).status).toBe(200);
  }
  expect(await Prediction.countDocuments()).toBe(1);
});
