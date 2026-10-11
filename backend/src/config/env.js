const dotenv = require('dotenv');
const path = require('path');

// Load .env from backend directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  MONGODB_URI: process.env.MONGODB_URI || '',
  MONGODB_DATABASE: process.env.MONGODB_DATABASE || 'voltsense',
  JWT_SECRET: process.env.JWT_SECRET || (process.env.NODE_ENV === 'test' ? 'test-only-secret-not-for-production' : ''),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  MAX_FILE_SIZE_MB: parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10),
  ML_SERVICE_URL: process.env.ML_SERVICE_URL || 'http://localhost:8000',
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  GROQ_MODEL: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
};

// Validate mandatory environment (skipped under test, which uses an in-memory database)
if (env.NODE_ENV !== 'test') {
  if (!env.MONGODB_URI) {
    throw new Error('FATAL: MONGODB_URI is required (e.g. mongodb://127.0.0.1:27017/voltsense)');
  }
  if (!process.env.JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET is required. Set it in backend/.env');
  }
  if (env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) {
    throw new Error('FATAL: JWT_SECRET must be at least 32 characters in production');
  }
  if (!process.env.OCM_API_KEY) {
    console.warn('Open Charge Map API key not configured; using fallback charging provider.');
  }
}

module.exports = env;
