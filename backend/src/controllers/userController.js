const userService = require('../services/userService');
const ApiResponse = require('../utils/apiResponse');

const getProfile = async (req, res, next) => {
  try {
    const user = await userService.getProfile(req.userId);
    return ApiResponse.success(res, { user });
  } catch (error) {
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const { name, preferences } = req.body;
    const user = await userService.updateProfile(req.userId, { name, preferences });
    return ApiResponse.success(res, { user }, 'Profile updated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProfile,
  updateProfile,
};
