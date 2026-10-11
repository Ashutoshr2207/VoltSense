const express = require('express');
const {
  listNotifications,
  markAsRead,
} = require('../controllers/notificationController');
const { validateNotificationId } = require('../validators/datasetValidator');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', requireAuth, listNotifications);
router.patch('/:notificationId/read', requireAuth, validateNotificationId, markAsRead);

module.exports = router;
