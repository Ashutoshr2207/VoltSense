const ApiError = require('../utils/apiError');
const env = require('../config/env');

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'Internal server error';
  let details = err.details || {};

  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_OBJECT_ID';
    message = `Invalid identifier format for field '${err.path}'`;
    details = { field: err.path, value: err.value };
  }

  // Handle Mongoose Validation Error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = {};
    Object.keys(err.errors).forEach((key) => {
      details[key] = err.errors[key].message;
    });
  }

  // Handle MongoDB Duplicate Key (E11000)
  if (err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_RESOURCE';
    const field = Object.keys(err.keyValue || {})[0] || 'resource';
    message = `Duplicate entry: ${field} already exists`;
    details = { field, value: err.keyValue ? err.keyValue[field] : null };
  }

  // Handle Multer upload errors
  if (err.name === 'MulterError') {
    statusCode = 400;
    code = 'INVALID_FILE';
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = `File size exceeds maximum allowable limit of ${env.MAX_FILE_SIZE_MB}MB`;
    } else {
      message = err.message;
    }
  }

  // Hide internal server error details in production
  if (statusCode === 500 && env.NODE_ENV === 'production') {
    message = 'An unexpected internal server error occurred';
    details = {};
  }

  if (env.NODE_ENV !== 'test' && statusCode === 500) {
    console.error('Unhandled Error:', err);
  }

  return res.status(statusCode).json({
    success: false,
    data: null,
    message,
    error: {
      code,
      details,
    },
  });
};

module.exports = errorHandler;
