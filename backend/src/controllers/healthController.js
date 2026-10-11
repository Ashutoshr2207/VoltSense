const mongoose = require('mongoose');
const ApiResponse = require('../utils/apiResponse');

const getHealth = (req, res) => {
  const readyStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const dbState = mongoose.connection.readyState;
  const dbStatus = readyStates[dbState] || 'unknown';

  return ApiResponse.success(res, {
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
      connected: dbState === 1,
    },
  });
};

module.exports = {
  getHealth,
};
