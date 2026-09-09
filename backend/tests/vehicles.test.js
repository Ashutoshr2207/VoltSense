const request = require('supertest');
const app = require('../src/app');
const { createTestUser } = require('./setup');

describe('Vehicles API', () => {
  let userA, tokenA;
  let userB, tokenB;

  beforeEach(async () => {
    const a = await createTestUser({ email: 'userA@voltsense.io' });
    userA = a.user;
    tokenA = a.token;

    const b = await createTestUser({ email: 'userB@voltsense.io' });
    userB = b.user;
    tokenB = b.token;
  });

  describe('POST /api/vehicles', () => {
    it('should register an EV asset successfully and return 201', async () => {
      const res = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          manufacturer: 'Tesla',
          model: 'Model 3',
          year: 2023,
          batteryVariant: 'Long Range AWD',
          nickname: 'Commuter',
          batteryCapacityKWh: 82.0,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.vehicle).toBeDefined();
      expect(res.body.data.vehicle.id).toBeDefined();
      expect(res.body.data.vehicle.manufacturer).toBe('Tesla');
      expect(res.body.data.vehicle.status).toBe('unknown');
    });

    it('should reject unsupported manufacturer with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          manufacturer: 'Ford', // Not in MVP enum ['Tesla', 'BYD', 'Tata']
          model: 'Mustang Mach-E',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/vehicles', () => {
    it('should list only vehicles belonging to authenticated user', async () => {
      // Create vehicle for User A
      await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ manufacturer: 'Tesla', model: 'Model 3' });

      // Create vehicle for User B
      await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ manufacturer: 'BYD', model: 'Atto 3' });

      // Query as User A
      const resA = await request(app)
        .get('/api/vehicles')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(resA.status).toBe(200);
      expect(resA.body.data.vehicles.length).toBe(1);
      expect(resA.body.data.vehicles[0].manufacturer).toBe('Tesla');

      // Query as User B
      const resB = await request(app)
        .get('/api/vehicles')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(resB.status).toBe(200);
      expect(resB.body.data.vehicles.length).toBe(1);
      expect(resB.body.data.vehicles[0].manufacturer).toBe('BYD');
    });
  });

  describe('GET /api/vehicles/:vehicleId', () => {
    it('should retrieve single vehicle if user owns it', async () => {
      const createRes = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ manufacturer: 'Tata', model: 'Nexon EV' });

      const vehicleId = createRes.body.data.vehicle.id;

      const res = await request(app)
        .get(`/api/vehicles/${vehicleId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.vehicle.id).toBe(vehicleId);
      expect(res.body.data.vehicle.model).toBe('Nexon EV');
    });

    it('should return 403 FORBIDDEN if another user tries to access the vehicle', async () => {
      const createRes = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ manufacturer: 'Tesla', model: 'Model Y' });

      const vehicleId = createRes.body.data.vehicle.id;

      // User B tries to access User A's vehicle
      const res = await request(app)
        .get(`/api/vehicles/${vehicleId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('PATCH /api/vehicles/:vehicleId', () => {
    it('should update vehicle attributes', async () => {
      const createRes = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ manufacturer: 'Tesla', model: 'Model 3', nickname: 'Old Name' });

      const vehicleId = createRes.body.data.vehicle.id;

      const res = await request(app)
        .patch(`/api/vehicles/${vehicleId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ nickname: 'New Falcon' });

      expect(res.status).toBe(200);
      expect(res.body.data.vehicle.nickname).toBe('New Falcon');
    });
  });

  describe('DELETE /api/vehicles/:vehicleId', () => {
    it('should delete vehicle and prevent subsequent queries', async () => {
      const createRes = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ manufacturer: 'Tesla', model: 'Model S' });

      const vehicleId = createRes.body.data.vehicle.id;

      const delRes = await request(app)
        .delete(`/api/vehicles/${vehicleId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(delRes.status).toBe(200);

      const getRes = await request(app)
        .get(`/api/vehicles/${vehicleId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(getRes.status).toBe(404);
    });
  });
});
