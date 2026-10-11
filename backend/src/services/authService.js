const bcrypt = require('bcryptjs');
const User = require('../models/User');
const ApiError = require('../utils/apiError');
const { signToken } = require('../utils/jwt');
const { formatDocument } = require('../utils/idHelper');
const crypto = require('crypto');
const Vehicle = require('../models/Vehicle');

const DEMO_EMAIL = 'reed.parmar@voltsense.io';

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

  /**
   * One-click demo sign-in. Finds (or creates) the demo user server-side and issues a
   * normal JWT. No credential is shipped to the browser; a newly created demo user gets a
   * random password nobody knows. Existing demo data (e.g. from `npm run seed`) is never deleted.
   * A newly created demo vehicle carries NO telemetry values: upload a CSV to populate it.
   */
  async demoLogin() {
    let user = await User.findOne({ email: DEMO_EMAIL });
    if (!user) {
      const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
      user = await User.create({
        name: 'Reed Parmar (Demo)',
        email: DEMO_EMAIL,
        passwordHash,
        preferences: { theme: 'light', emailNotifications: true, batteryAlerts: true, analysisNotifications: true, dataQualityAlerts: true },
      });
    }
    const hasVehicle = await Vehicle.exists({ userId: user._id });
    if (!hasVehicle) {
      await Vehicle.create({
        userId: user._id,
        manufacturer: 'Demo',
        model: 'Demo EV',
        year: 2023,
        nickname: 'Demo vehicle',
        status: 'unknown',
      });
    }
    const token = signToken({ userId: user._id.toString() });
    return { user: formatDocument(user), token };
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
