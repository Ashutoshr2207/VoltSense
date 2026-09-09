const { verifyToken } = require('../utils/jwt');
const ApiError = require('../utils/apiError');
const User = require('../models/User');

const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Authentication token is required', 'AUTHENTICATION_REQUIRED');
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded || !decoded.userId) {
      throw ApiError.unauthorized('Invalid or expired authentication token', 'AUTHENTICATION_REQUIRED');
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      throw ApiError.unauthorized('User account no longer exists', 'AUTHENTICATION_REQUIRED');
    }

    req.user = user;
    req.userId = user._id.toString();
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  requireAuth,
};
