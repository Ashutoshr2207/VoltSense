const request = require('supertest');
const app = require('../src/app');
const { createTestUser } = require('./setup');

describe('Auth API', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user and return 201 with token and user profile', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Jane Doe',
          email: 'jane.doe@voltsense.io',
          password: 'Password123!',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.id).toBeDefined();
      expect(res.body.data.user.email).toBe('jane.doe@voltsense.io');
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.token).toBeDefined();
    });

    it('should reject registration if email is already taken with 409', async () => {
      await createTestUser({ email: 'duplicate@voltsense.io' });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Duplicate User',
          email: 'duplicate@voltsense.io',
          password: 'Password123!',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('DUPLICATE_RESOURCE');
    });

    it('should reject weak password with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test',
          email: 'weak@voltsense.io',
          password: 'weak',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.password).toBeDefined();
    });
  });

  describe('POST /api/auth/login', () => {
    it('should authenticate user and return 200 with token', async () => {
      await createTestUser({ email: 'login_test@voltsense.io' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login_test@voltsense.io',
          password: 'Password123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe('login_test@voltsense.io');
    });

    it('should reject invalid password with 401 INVALID_CREDENTIALS', async () => {
      await createTestUser({ email: 'bad_pass@voltsense.io' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'bad_pass@voltsense.io',
          password: 'WrongPassword999!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should reject unauthenticated request with 401 AUTHENTICATION_REQUIRED', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('should return current user when valid token is supplied', async () => {
      const { user, token } = await createTestUser();

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.id).toBe(user._id.toString());
      expect(res.body.data.user.email).toBe(user.email);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should return 200 on logout', async () => {
      const { token } = await createTestUser();

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
