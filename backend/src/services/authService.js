const bcrypt = require('bcryptjs');
const User = require('../models/User');
const ApiError = require('../utils/apiError');
const { signToken } = require('../utils/jwt');
const { formatDocument } = require('../utils/idHelper');

class AuthService {
  async register({ name, email, password }) {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw ApiError.conflict('An account with this email already exists', 'DUPLICATE_RESOURCE');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email,
      passwordHash,
      preferences: {
        theme: 'light',
        emailNotifications: true,
        batteryAlerts: true,
        analysisNotifications: true,
        dataQualityAlerts: true,
      },
    });

    const token = signToken({ userId: user._id.toString() });

    return {
      user: formatDocument(user),
      token,
    };
  }

  async login({ email, password }) {
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) {
      throw ApiError.invalidCredentials();
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw ApiError.invalidCredentials();
    }

    const token = signToken({ userId: user._id.toString() });

    return {
      user: formatDocument(user),
      token,
    };
  }

  async getMe(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found', 'RESOURCE_NOT_FOUND');
    }
    return formatDocument(user);
  }
}

module.exports = new AuthService();
