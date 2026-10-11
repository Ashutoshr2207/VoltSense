const ApiError = require('../utils/apiError');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Minimum 6 characters
const validateRegister = (req, res, next) => {
  const { name, email, password } = req.body || {};
  const details = {};

  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
    details.name = 'Name is required and must be between 2 and 80 characters';
  }

  if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
    details.email = 'A valid email address is required';
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    details.password = 'Password must be at least 6 characters long';
  }

  if (Object.keys(details).length > 0) {
    return next(ApiError.badRequest('Validation error', 'VALIDATION_ERROR', details));
  }

  req.body.name = name.trim();
  req.body.email = email.trim().toLowerCase();
  next();
};

const validateLogin = (req, res, next) => {
  const { email, password } = req.body || {};
  const details = {};

  if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
    details.email = 'A valid email address is required';
  }

  if (!password || typeof password !== 'string' || password.length === 0) {
    details.password = 'Password is required';
  }

  if (Object.keys(details).length > 0) {
    return next(ApiError.badRequest('Validation error', 'VALIDATION_ERROR', details));
  }

  req.body.email = email.trim().toLowerCase();
  next();
};

module.exports = {
  validateRegister,
  validateLogin,
};
