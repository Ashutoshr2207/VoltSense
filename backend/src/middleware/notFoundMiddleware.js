const ApiError = require('../utils/apiError');

const notFoundHandler = (req, res, next) => {
  const message = `Endpoint not found: ${req.method} ${req.originalUrl}`;
  next(ApiError.notFound(message, 'RESOURCE_NOT_FOUND'));
};

module.exports = notFoundHandler;
