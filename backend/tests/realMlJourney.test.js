// Opt-in integration: real local FastAPI, disposable MongoDB, no provider traffic.
const request = require('supertest');
const { spawn } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const net = require('net');
const nativeFetch = global.fetch;
const integration = process.env.RUN_REAL_ML_TESTS === '1' ? describe : describe.skip;

integration('real unapproved ML service journey', () => {
  require('./setup');
  const app = require('../src/app');
  const env = require('../src/config/env');
  const pipeline = require('../src/services/analysisPipelineService');
  const Dataset = require('../src/models/Dataset');
  const Prediction = require('../src/models/Prediction');
  const PipelineRun = require('../src/models/PipelineRun');
  let child, directory, endpoint, originalUrl;
  beforeAll(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'voltsense-ml-test-'));
    const manifest = path.join(directory, 'manifest.json');
    await fs.writeFile(manifest, JSON.stringify({ approved: false }));
    const port = await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const assigned = server.address().port;
        server.close((error) => error ? reject(error) : resolve(assigned));
      });
    });
    endpoint = 'http://127.0.0.1:' + port;
    originalUrl = env.ML_SERVICE_URL;
    env.ML_SERVICE_URL = endpoint;
    child = spawn('python', ['-B', '-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', String(port)], {
      cwd: path.resolve(__dirname, '../../ml-service'),
      env: { ...process.env, ML_MODEL_MANIFEST: manifest }, stdio: 'ignore', windowsHide: true,
    });
    let startError;
    child.once('error', (error) => { startError = error; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (startError) throw startError;
      if (child.exitCode !== null) throw new Error('FastAPI exited before readiness');
      try {
        const health = await nativeFetch(endpoint + '/health');
        expect(await health.json()).toEqual({ status: 'error', models_loaded: false });
        return;
      } catch (_) { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    throw new Error('Local FastAPI did not become ready');
  }, 20000);
  afterAll(async () => {
    env.ML_SERVICE_URL = originalUrl;
    if (child && child.exitCode === null) {
      await new Promise((resolve) => { child.once('exit', resolve); child.kill(); });
    }
    if (directory) {
      await fs.unlink(path.join(directory, 'manifest.json'));
      await fs.rmdir(directory);
    }
  });
  test('observed EOL still requires an approved model over real HTTP', async () => {
    const cycleTable = [2, 1.98, 1.96, 1.94, 1.92, 1.6, 1.8].map((capacity, i) => ({ cycle: i + 1, capacity }));
    const response = await nativeFetch(endpoint + '/predict', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cycleTable, eolThreshold: 80, batteryId: 'SYNTHETIC_TERMINAL' }) });
    expect(response.status).toBe(503);
    expect((await response.json()).detail.code).toBe('MODEL_UNAVAILABLE');
    expect(await Prediction.countDocuments()).toBe(0);
  });
  test('synthetic upload fails honestly at model gate and persists failure across login and retry', async () => {
    global.fetch.mockImplementation((url, options) => {
      if (!String(url).startsWith(endpoint + '/')) return Promise.reject(new Error('External HTTP disabled'));
      return nativeFetch(url, options);
    });
    const credentials = { email: 'realml@test.io', password: 'Password123!' };
    let response = await request(app).post('/api/auth/register').send({ ...credentials, name: 'ML Journey' });
    expect(response.status).toBe(201);
    const token = response.body.data.token;
    const auth = { Authorization: 'Bearer ' + token };
    response = await request(app).post('/api/vehicles').set(auth).send({ manufacturer: 'Tesla', model: 'Model 3' });
    expect(response.status).toBe(201);
    const vehicle = response.body.data.vehicle;
    response = await request(app).post('/api/vehicles/' + vehicle.id + '/datasets').set(auth)
      .field('sourceType', 'user_upload').attach('file', path.resolve(__dirname, '../../sample_data/owner_1.csv'));
    expect(response.status).toBe(201);
    const dataset = response.body.data.dataset;
    for (let attempt = 0; attempt < 2; attempt++) {
      response = await request(app).post('/api/datasets/' + dataset.id + '/process').set(auth).send({});
      expect(response.status).toBe(202);
      await pipeline.drain();
      response = await request(app).get('/api/datasets/' + dataset.id + '/status').set(auth);
      expect(response.body.data.status).toBe('failed');
      expect(response.body.data.pipelineRun.errors.join(' ')).toMatch(/MODEL_UNAVAILABLE/);
      expect(response.body.data.pipelineRun.stages.featureEngineering.status).toBe('failed');
      for (const stage of ['validation', 'schemaMapping', 'cleaning', 'missingValueHandling', 'outlierDetection']) {
        expect(response.body.data.pipelineRun.stages[stage].status).toBe('completed');
      }
    }
    expect(await PipelineRun.countDocuments()).toBe(2);
    expect(await Prediction.countDocuments()).toBe(0);
    response = await request(app).post('/api/auth/login').send(credentials);
    const refreshed = { Authorization: 'Bearer ' + response.body.data.token };
    response = await request(app).get('/api/vehicles/' + vehicle.id + '/predictions').set(refreshed);
    expect(response.status).toBe(200);
    expect(response.body.data.predictions).toEqual([]);
    response = await request(app).get('/api/datasets/' + dataset.id + '/status').set(refreshed);
    expect(response.body.data.status).toBe('failed');
    expect((await Dataset.findById(dataset.id)).storage.rawUrl).toBeTruthy();
  });
});
