const request = require('supertest');
const app = require('../src/app');
require('./setup');

describe('Health API', () => {
  it('GET /api/health should return 200 with ok status and connected database', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.database.connected).toBe(true);
    expect(res.body.error).toBeNull();
  });
});
