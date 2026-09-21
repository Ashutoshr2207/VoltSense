const request = require('supertest');
const app = require('../src/app');
const Prediction = require('../src/models/Prediction');
const AIInsight = require('../src/models/AIInsight');
const PipelineRun = require('../src/models/PipelineRun');
const Dataset = require('../src/models/Dataset');
const { createTestUser } = require('./setup');

describe('Predictions & Insights API', () => {
  let userA, tokenA;
  let userB, tokenB;
  let vehicleA;
  let predictionA;

  beforeEach(async () => {
    const a = await createTestUser({ email: 'pred_userA@voltsense.io' });
    userA = a.user;
    tokenA = a.token;

    const b = await createTestUser({ email: 'pred_userB@voltsense.io' });
    userB = b.user;
    tokenB = b.token;

    const vehRes = await request(app)
      .post('/api/vehicles')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ manufacturer: 'Tesla', model: 'Model 3' });

    vehicleA = vehRes.body.data.vehicle;

    const dataset = await Dataset.create({
      userId: userA._id,
      vehicleId: vehicleA.id,
      originalFileName: 'test.csv',
      fileType: 'csv',
      fileSize: 1024,
      status: 'processed',
    });

    const run = await PipelineRun.create({
      datasetId: dataset._id,
      vehicleId: vehicleA.id,
      userId: userA._id,
      status: 'completed',
    });

    predictionA = await Prediction.create({
      userId: userA._id,
      vehicleId: vehicleA.id,
      datasetId: dataset._id,
      pipelineRunId: run._id,
      model: {
        name: 'VoltSense Bayesian SOH',
        version: 'v1.0',
        algorithm: 'Bayesian MCMC',
      },
      prediction: {
        soh: 94.2,
        currentCycle: 412,
        rulCycles: 680,
        estimatedEOLCycle: 1092,
        eolThreshold: 70,
      },
      confidence: {
        soh: 0.94,
        rul: 0.87,
      },
      degradation: {
        historical: [{ cycle: 0, soh: 100 }, { cycle: 412, soh: 94.2 }],
        predicted: [{ cycle: 600, soh: 90.1 }, { cycle: 1092, soh: 70 }],
      },
    });

    await AIInsight.create({
      userId: userA._id,
      vehicleId: vehicleA.id,
      predictionId: predictionA._id,
      summary: 'Pack degradation is nominal.',
      insights: [
        {
          type: 'health',
          severity: 'low',
          title: 'Nominal Health',
          description: 'No anomalies detected.',
        },
      ],
      recommendations: ['Maintain charging threshold below 80%'],
    });
  });

  describe('GET /api/vehicles/:vehicleId/predictions', () => {
    it('should list predictions for target vehicle', async () => {
      const res = await request(app)
        .get(`/api/vehicles/${vehicleA.id}/predictions`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.predictions.length).toBe(1);
      expect(res.body.data.predictions[0].prediction.soh).toBe(94.2);
    });

    it('should return 403 FORBIDDEN if another user accesses vehicle predictions', async () => {
      const res = await request(app)
        .get(`/api/vehicles/${vehicleA.id}/predictions`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/predictions/:predictionId', () => {
    it('should return detailed prediction with degradation curves', async () => {
      const res = await request(app)
        .get(`/api/predictions/${predictionA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.prediction.degradation.historical.length).toBe(2);
      expect(res.body.data.prediction.degradation.predicted.length).toBe(2);
    });

    it('should return 403 FORBIDDEN if User B accesses User A prediction', async () => {
      const res = await request(app)
        .get(`/api/predictions/${predictionA._id.toString()}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/predictions/:predictionId/insights', () => {
    it('should retrieve AI insights for prediction', async () => {
      const res = await request(app)
        .get(`/api/predictions/${predictionA._id.toString()}/insights`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.insight.summary).toBe('Pack degradation is nominal.');
      expect(res.body.data.insight.recommendations.length).toBe(1);
    });
  });
});
