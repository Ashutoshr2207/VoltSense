const request = require('supertest');
const app = require('../src/app');
const { createTestUser } = require('./setup');

describe('Datasets API', () => {
  let userA, tokenA;
  let userB, tokenB;
  let vehicleA;

  beforeEach(async () => {
    const a = await createTestUser({ email: 'dataset_userA@voltsense.io' });
    userA = a.user;
    tokenA = a.token;

    const b = await createTestUser({ email: 'dataset_userB@voltsense.io' });
    userB = b.user;
    tokenB = b.token;

    const vehRes = await request(app)
      .post('/api/vehicles')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ manufacturer: 'Tesla', model: 'Model 3' });

    vehicleA = vehRes.body.data.vehicle;
  });

  describe('POST /api/vehicles/:vehicleId/datasets', () => {
    it('should upload CSV telemetry file and return 201 with dataset record', async () => {
      const csvContent = 'timestamp,cycle,voltage,current,soc\n2026-09-07T08:00:00Z,412,389.4,45.2,85.0';

      const res = await request(app)
        .post(`/api/vehicles/${vehicleA.id}/datasets`)
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', Buffer.from(csvContent), 'bms_test.csv')
        .field('sourceType', 'user_upload');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dataset).toBeDefined();
      expect(res.body.data.dataset.id).toBeDefined();
      expect(res.body.data.dataset.fileType).toBe('csv');
      expect(res.body.data.dataset.status).toBe('uploaded');
    });

    it('should reject file with unsupported extension with 400 INVALID_FILE', async () => {
      const res = await request(app)
        .post(`/api/vehicles/${vehicleA.id}/datasets`)
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', Buffer.from('console.log("bad")'), 'malicious.js');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_FILE');
    });

    it('should return 403 FORBIDDEN if another user tries to upload to vehicle', async () => {
      const res = await request(app)
        .post(`/api/vehicles/${vehicleA.id}/datasets`)
        .set('Authorization', `Bearer ${tokenB}`)
        .attach('file', Buffer.from('sample'), 'telemetry.csv');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/datasets/:datasetId/process & GET status', () => {
    it('should trigger pipeline execution and allow polling of processing status', async () => {
      // 1. Upload dataset
      const uploadRes = await request(app)
        .post(`/api/vehicles/${vehicleA.id}/datasets`)
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', Buffer.from('time,v\n1,3.8'), 'sample.csv');

      const datasetId = uploadRes.body.data.dataset.id;

      // 2. Trigger pipeline processing
      const processRes = await request(app)
        .post(`/api/datasets/${datasetId}/process`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(processRes.status).toBe(202);
      expect(processRes.body.success).toBe(true);
      expect(processRes.body.data.status).toBe('queued');
      expect(processRes.body.data.pipelineRunId).toBeDefined();

      // 3. Poll processing status
      const statusRes = await request(app)
        .get(`/api/datasets/${datasetId}/status`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.success).toBe(true);
      expect(statusRes.body.data.status).toBe('processing');
      expect(statusRes.body.data.pipelineRun).toBeDefined();
      expect(statusRes.body.data.pipelineRun.stages.validation).toBeDefined();
    });
  });
});
