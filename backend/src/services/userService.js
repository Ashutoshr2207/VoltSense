const User = require('../models/User');
const ApiError = require('../utils/apiError');
const { formatDocument } = require('../utils/idHelper');

class UserService {
  async getProfile(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found', 'RESOURCE_NOT_FOUND');
    }
    return formatDocument(user);
  }

  async updateProfile(userId, { name, preferences }) {
    const user = await User.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found', 'RESOURCE_NOT_FOUND');
    }

    if (name) {
      user.name = name;
    }

    if (preferences) {
      user.preferences = {
        ...user.preferences.toObject(),
        ...preferences,
      };
    }

    await user.save();
    return formatDocument(user);
  }
}

module.exports = new UserService();
