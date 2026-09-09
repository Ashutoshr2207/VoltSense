const notificationService = require('../services/notificationService');
const ApiResponse = require('../utils/apiResponse');

const listNotifications = async (req, res, next) => {
  try {
    const result = await notificationService.listNotifications(req.userId, req.query);
    return ApiResponse.success(res, result);
  } catch (error) {
    next(error);
  }
};

const markAsRead = async (req, res, next) => {
  try {
    const notification = await notificationService.markAsRead(req.userId, req.params.notificationId);
    return ApiResponse.success(res, { notification }, 'Notification marked as read');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listNotifications,
  markAsRead,
};
