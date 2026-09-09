const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');
const { signToken } = require('../src/utils/jwt');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

/**
 * Helper to create a test user and generate a valid JWT
 */
const createTestUser = async (overrides = {}) => {
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('Password123!', salt);

  const user = await User.create({
    name: overrides.name || 'Test User',
    email: overrides.email || `test_${Date.now()}@voltsense.io`,
    passwordHash,
    preferences: {
      theme: 'light',
      emailNotifications: true,
      batteryAlerts: true,
      analysisNotifications: true,
      dataQualityAlerts: true,
    },
    ...overrides,
  });

  const token = signToken({ userId: user._id.toString() });

  return { user, token };
};

module.exports = {
  createTestUser,
};
