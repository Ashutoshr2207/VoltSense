const mongoose = require('mongoose');
const env = require('./env');

let memoryServer = null;

const connectOptions = {
  dbName: env.MONGODB_DATABASE,
  serverSelectionTimeoutMS: 5000,
};

/**
 * Development-only fallback: if no MongoDB is reachable, start a throw-away
 * in-memory MongoDB (mongodb-memory-server) so the app still runs.
 * Data is NOT persisted. Disable with USE_MEMORY_DB_FALLBACK=false.
 */
const startMemoryFallback = async () => {
  let MongoMemoryServer;
  try {
    ({ MongoMemoryServer } = require('mongodb-memory-server'));
  } catch (e) {
    throw new Error('mongodb-memory-server is not installed (run `npm install` in backend/)');
  }
  memoryServer = await MongoMemoryServer.create();
  const uri = memoryServer.getUri();
  console.warn('\n[VoltSense] WARNING: using a temporary IN-MEMORY MongoDB. Data is lost on restart.');
  console.warn('[VoltSense] For persistent data, start MongoDB (mongod) or set MONGODB_URI to MongoDB Atlas.\n');
  return mongoose.connect(uri, connectOptions);
};

const connectDB = async (customUri = null) => {
  const uri = customUri || env.MONGODB_URI;

  if (!uri) {
    throw new Error('Database connection failed: MONGODB_URI is not defined');
  }

  try {
    const conn = await mongoose.connect(uri, connectOptions);

    if (env.NODE_ENV !== 'test') {
      console.log(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    }

    return conn;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);

    const canFallback =
      env.NODE_ENV === 'development' &&
      !customUri &&
      process.env.USE_MEMORY_DB_FALLBACK !== 'false';

    if (canFallback) {
      try {
        const conn = await startMemoryFallback();
        console.log(`MongoDB (in-memory) Connected: ${conn.connection.host}/${conn.connection.name}`);
        return conn;
      } catch (fallbackError) {
        console.error('In-memory MongoDB fallback failed:', fallbackError.message);
      }
    }

    if (env.NODE_ENV !== 'test') {
      console.error(
        '\nMongoDB is not reachable. Fix with ONE of:\n' +
          '  1) Start local MongoDB:  Windows: net start MongoDB   |  macOS: brew services start mongodb-community   |  Linux: sudo systemctl start mongod\n' +
          '  2) Docker:               docker run -d -p 27017:27017 --name mongo mongo:7\n' +
          '  3) Use MongoDB Atlas:    set MONGODB_URI in backend/.env to your Atlas connection string\n'
      );
      process.exit(1);
    }
    throw error;
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
    if (memoryServer) {
      await memoryServer.stop();
      memoryServer = null;
    }
  } catch (error) {
    console.error('Error during database disconnect:', error.message);
  }
};

module.exports = {
  connectDB,
  disconnectDB,
};
