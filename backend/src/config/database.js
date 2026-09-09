const mongoose = require('mongoose');
const env = require('./env');

const connectDB = async (customUri = null) => {
  const uri = customUri || env.MONGODB_URI;

  if (!uri) {
    throw new Error('Database connection failed: MONGODB_URI is not defined');
  }

  try {
    const conn = await mongoose.connect(uri, {
      dbName: env.MONGODB_DATABASE,
    });

    if (env.NODE_ENV !== 'test') {
      console.log(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    }

    return conn;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    if (env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error during database disconnect:', error.message);
  }
};

module.exports = {
  connectDB,
  disconnectDB,
};
