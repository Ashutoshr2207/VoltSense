// @vitest-environment node
// Opt-in: actual frontend API modules -> Express -> real local FastAPI.
// MongoDB is disposable; never connects to the configured application database.
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const integration = process.env.RUN_REAL_UPLOAD_TESTS === '1' ? describe : describe.skip;

integration('real frontend upload client and disabled inference', () => {
  let mongo, mongoose, server, base, api, datasetApi, pipeline;
  const storage = new Map();
  const observedML = [];
  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('MONGOMS_RUNTIME_DOWNLOAD', 'false');
    const { MongoMemoryServer } = requireBackend('mongodb-memory-server');
    mongoose = requireBackend('mongoose');
    const port = await new Promise((resolve, reject) => {
      const listener = createServer();
      listener.once('error', reject);
      listener.listen(0, '127.0.0.1', () => {
        const assigned = listener.address().port;
        listener.close((error) => error ? reject(error) : resolve(assigned));
      });
    });
    mongo = await MongoMemoryServer.create({
      binary: { downloadDir: fileURLToPath(new URL('../../backend/node_modules/.cache/mongodb-memory-server/', import.meta.url)) },
      instance: { port, ip: '127.0.0.1', launchTimeout: 60000 },
    });
    await mongoose.connect(mongo.getUri());
    const app = requireBackend('./src/app');
    const env = requireBackend('./src/config/env');
    env.ML_SERVICE_URL = 'http://127.0.0.1:8000';
    pipeline = requireBackend('./src/services/analysisPipelineService');
    server = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    base = 'http://127.0.0.1:' + server.address().port;
    vi.stubEnv('VITE_API_URL', base + '/api');
    vi.stubGlobal('localStorage', { getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) });
    const nativeFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (url, options) => {
      const target = String(url);
      if (!target.startsWith(base + '/') && !target.startsWith('http://127.0.0.1:8000/')) throw new Error('External network prohibited in integration test');
      const response = await nativeFetch(url, options);
      if (target.endsWith(':8000/predict')) observedML.push({ payload: JSON.parse(options.body), status: response.status,
        contentType: response.headers.get('content-type'), body: await response.clone().json() });
      return response;
    });
    vi.resetModules();
    api = (await import('../src/api/api')).default;
    datasetApi = await import('../src/api/datasetApi');
    const health = await fetch('http://127.0.0.1:8000/health');
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'error', models_loaded: false });
  }, 65000);
  afterAll(async () => {
    if (pipeline) await pipeline.drain();
    if (mongoose?.connection.readyState === 1) {
      const storageService = requireBackend('./src/services/storageService');
      const datasets = await requireBackend('./src/models/Dataset').find({});
      for (const dataset of datasets) await storageService.deleteRaw(dataset.storage, dataset.vehicleId);
      await mongoose.disconnect();
    }
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    if (mongo) await mongo.stop();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  test('upload, poll, refresh and reauthenticate preserve actual MODEL_UNAVAILABLE without predictions', async () => {
    const credentials = { email: 'frontend-communication@test.io', password: 'Password123!' };
    const registered = await api('/auth/register', { method: 'POST', body: JSON.stringify({ ...credentials, name: 'Communication Test' }) });
    localStorage.setItem('voltsense_token', registered.data.token);
    const vehicle = (await api('/vehicles', { method: 'POST', body: JSON.stringify({ manufacturer: 'Tesla', model: 'Model 3' }) })).data.vehicle;
    const csv = await readFile(new URL('../../sample_data/owner_1.csv', import.meta.url));
    const dataset = await datasetApi.uploadDataset(vehicle.id, new File([csv], 'owner_1.csv', { type: 'text/csv' }), 'user_upload');
    const run = await datasetApi.triggerProcessing(dataset.id);
    await expect(datasetApi.waitForProcessing(dataset.id, { pipelineRunId: run.pipelineRunId, intervalMs: 10 }))
      .rejects.toThrow('ML inference unavailable: service_error_503:MODEL_UNAVAILABLE');
    // The run error is published just before dataset compensation finishes.
    await pipeline.drain();
    const state = await datasetApi.getProcessingStatus(dataset.id);
    expect(state.status).toBe('failed');
    for (const stage of ['validation', 'schemaMapping', 'cleaning', 'missingValueHandling', 'outlierDetection']) {
      expect(state.pipelineRun.stages[stage].status).toBe('completed');
    }
    expect(observedML).toHaveLength(1);
    expect(observedML[0]).toMatchObject({ status: 503, contentType: 'application/json', body: { detail: { code: 'MODEL_UNAVAILABLE' } } });
    expect(observedML[0].payload.cycleTable).toHaveLength(30);
    expect(observedML[0].payload.batteryId).toBe('TESLA-M3-LR-2023-01');
    // Re-import the real clients and log in again, as after a page refresh.
    storage.clear(); vi.resetModules();
    api = (await import('../src/api/api')).default;
    datasetApi = await import('../src/api/datasetApi');
    const login = await api('/auth/login', { method: 'POST', body: JSON.stringify(credentials) });
    localStorage.setItem('voltsense_token', login.data.token);
    expect((await datasetApi.getProcessingStatus(dataset.id)).status).toBe('failed');
    expect((await datasetApi.fetchDatasetsForVehicle(vehicle.id)).datasets).toHaveLength(1);
    expect((await api('/vehicles/' + vehicle.id + '/predictions')).data.predictions).toEqual([]);
    expect(await requireBackend('./src/models/Prediction').countDocuments()).toBe(0);
    expect(await requireBackend('./src/models/PipelineRun').countDocuments()).toBe(1);
  });
});
