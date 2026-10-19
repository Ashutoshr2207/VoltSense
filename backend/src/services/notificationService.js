const Notification = require('../models/Notification');
const PipelineRun = require('../models/PipelineRun');
const Prediction = require('../models/Prediction');
const ApiError = require('../utils/apiError');
const { formatDocument, formatDocuments } = require('../utils/idHelper');

class NotificationService {
  async listNotifications(userId, query = {}) {
    const runs = await PipelineRun.find({ userId, status: 'completed' }).distinct('_id');
    const predictions = await Prediction.find({ userId, pipelineRunId: { $in: runs } }).distinct('_id');
    const filter = { userId, $or: [{ predictionId: null }, { predictionId: { $in: predictions } }] };

    if (query.read !== undefined) {
      filter.read = query.read === 'true' || query.read === true;
    }

    const notifications = await Notification.find(filter).sort({ createdAt: -1 });
    const total = await Notification.countDocuments(filter);
    const unreadCount = await Notification.countDocuments({ ...filter, read: false });

    return {
      notifications: formatDocuments(notifications),
      unreadCount,
      total,
    };
  }

  async markAsRead(userId, notificationId) {
    const notification = await Notification.findById(notificationId);
    if (!notification) {
      throw ApiError.notFound(`Notification not found with ID '${notificationId}'`, 'RESOURCE_NOT_FOUND');
    }

    if (notification.userId.toString() !== userId) {
      throw ApiError.forbidden('You do not have permission to modify this notification');
    }

    notification.read = true;
    await notification.save();

    return formatDocument(notification);
  }
}

module.exports = new NotificationService();
