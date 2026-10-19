const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');
const { signToken } = require('../src/utils/jwt');

let mongoServer;

// Unit/integration tests must never send real telemetry or questions to providers.
beforeEach(() => {
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('External HTTP disabled in tests'));
});
afterEach(() => jest.restoreAllMocks());

beforeAll(async () => {
  // Optional: point the tests at an existing MongoDB-compatible server (e.g. offline CI)
  // instead of downloading a binary: TEST_MONGODB_URI=mongodb://127.0.0.1:27017/voltsense_test
  if (process.env.TEST_MONGODB_URI) {
    await mongoose.connect(process.env.TEST_MONGODB_URI);
    return;
  }
  // Ask the OS for a usable loopback port instead of probing random Windows
  // ports, which may fall inside Hyper-V/WinNAT reserved ranges (EACCES).
  const port = await new Promise((resolve, reject) => {
    const server = require('net').createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((err) => err ? reject(err) : resolve(port));
    });
  });
  mongoServer = await MongoMemoryServer.create({
    instance: {
      port,
      ip: '127.0.0.1',
      launchTimeout: 60000,
    },
  });
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
}, 65000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

afterEach(async () => {
  await require('../src/services/analysisPipelineService').drain();
  if (mongoose.connection.readyState !== 1) return;
  const datasets = await require('../src/models/Dataset').find({});
  for (const dataset of datasets) {
    if (dataset.storage?.rawUrl) await require('../src/services/storageService').deleteRaw(dataset.storage, dataset.vehicleId).catch(() => {});
  }
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
