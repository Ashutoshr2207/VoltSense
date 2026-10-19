const request = require('supertest');
const app = require('../src/app');
const { createTestUser } = require('./setup');
const Vehicle = require('../src/models/Vehicle');
const Dataset = require('../src/models/Dataset');

test('anomaly data is accessible only to the vehicle owner with the existing envelope', async () => {
  const a = await createTestUser({ email: 'owner@test.io' });
  const b = await createTestUser({ email: 'other@test.io' });
  const vehicle = await Vehicle.create({ userId: a.user.id, manufacturer: 'Tesla', model: 'Model 3' });
  await Dataset.create({ userId: a.user.id, vehicleId: vehicle.id, originalFileName: 'private.csv', fileType: 'csv', fileSize: 1, anomalies: { profileId: 'generic_reference', anomalies: [] } });
  const endpoint = '/api/vehicles/' + vehicle.id + '/anomalies';
  const denied = await request(app).get(endpoint).set('Authorization', 'Bearer ' + b.token);
  expect(denied.status).toBe(403);
  expect(denied.body.data).toBeNull();
  expect(denied.body.error.code).toBe('FORBIDDEN');
  const own = await request(app).get(endpoint).set('Authorization', 'Bearer ' + a.token);
  expect(own.status).toBe(200);
  expect(Object.keys(own.body).sort()).toEqual(['data', 'error', 'message', 'success']);
  expect(own.body.data.datasetName).toBe('private.csv');
  expect((await request(app).get(endpoint)).status).toBe(401);
});

test('expired and tampered JWTs cannot access owned resources', async () => {
  const { user, token } = await createTestUser();
  const expired = require('jsonwebtoken').sign({ userId: user.id }, require('../src/config/env').JWT_SECRET, { expiresIn: -1 });
  for (const bad of [expired, token + 'tampered', 'invalid']) {
    const response = await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + bad);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  }
});
test('concurrent vehicle creation preserves the existing one-vehicle rule', async () => {
  const { user } = await createTestUser();
  const service = require('../src/services/vehicleService');
  const results = await Promise.allSettled([
    service.createVehicle(user.id, { manufacturer: 'Tesla', model: '3' }),
    service.createVehicle(user.id, { manufacturer: 'Tesla', model: 'Y' }),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(await Vehicle.countDocuments({ userId: user.id })).toBe(1);
});
