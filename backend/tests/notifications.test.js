const request = require('supertest');
const app = require('../src/app');
const Notification = require('../src/models/Notification');
const { createTestUser } = require('./setup');

describe('Notifications API', () => {
  let userA, tokenA;
  let userB, tokenB;
  let notifA;

  beforeEach(async () => {
    const a = await createTestUser({ email: 'notif_userA@voltsense.io' });
    userA = a.user;
    tokenA = a.token;

    const b = await createTestUser({ email: 'notif_userB@voltsense.io' });
    userB = b.user;
    tokenB = b.token;

    notifA = await Notification.create({
      userId: userA._id,
      type: 'analysis_complete',
      title: 'Diagnostic Complete',
      message: 'Telemetry processing finished successfully',
      read: false,
    });
  });

  describe('GET /api/notifications', () => {
    it('should list user notifications with unread count', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notifications.length).toBe(1);
      expect(res.body.data.unreadCount).toBe(1);
    });

    it('should return empty list for user without notifications', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.data.notifications.length).toBe(0);
      expect(res.body.data.unreadCount).toBe(0);
    });
  });

  describe('PATCH /api/notifications/:notificationId/read', () => {
    it('should mark notification as read', async () => {
      const res = await request(app)
        .patch(`/api/notifications/${notifA._id.toString()}/read`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notification.read).toBe(true);
    });

    it('should return 403 FORBIDDEN if User B attempts to mark User A notification', async () => {
      const res = await request(app)
        .patch(`/api/notifications/${notifA._id.toString()}/read`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});
