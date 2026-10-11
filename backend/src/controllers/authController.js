const authService = require('../services/authService');
const ApiResponse = require('../utils/apiResponse');

const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const result = await authService.register({ name, email, password });
    return ApiResponse.created(res, result, 'User registered successfully');
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login({ email, password });
    return ApiResponse.success(res, result, 'Authentication successful');
  } catch (error) {
    next(error);
  }
};

const demoLogin = async (req, res, next) => {
  try {
    if (process.env.DEMO_ACCOUNT_ENABLED === 'false') {
      return res.status(403).json({ success: false, error: { code: 'DEMO_DISABLED', message: 'Demo account is disabled on this server.' } });
    }
    const result = await authService.demoLogin();
    return ApiResponse.success(res, result, 'Demo session started');
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    const user = await authService.getMe(req.userId);
    return ApiResponse.success(res, { user });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    return ApiResponse.success(res, null, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  demoLogin,
  register,
  login,
  getMe,
  logout,
};
