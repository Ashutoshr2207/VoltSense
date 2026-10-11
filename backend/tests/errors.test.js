const request = require('supertest');
const app = require('../src/app');
const { createTestUser } = require('./setup');

describe('Global Error Handling & Envelopes', () => {
  let token;

  beforeEach(async () => {
    const { token: t } = await createTestUser();
    token = t;
  });

  it('should return 404 with standard error envelope for undefined endpoints', async () => {
    const res = await request(app).get('/api/nonexistent_route_test');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      data: null,
      message: expect.stringContaining('Endpoint not found'),
      error: {
        code: 'RESOURCE_NOT_FOUND',
        details: {},
      },
    });
  });

  it('should return 400 INVALID_OBJECT_ID for malformed MongoDB ObjectId params', async () => {
    const res = await request(app)
      .get('/api/vehicles/invalid_hex_id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_OBJECT_ID');
  });

  it('should return 404 RESOURCE_NOT_FOUND when valid ObjectId does not exist', async () => {
    const fakeObjectId = '68a01f92b7c4d81234567890';
    const res = await request(app)
      .get(`/api/vehicles/${fakeObjectId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });
});
