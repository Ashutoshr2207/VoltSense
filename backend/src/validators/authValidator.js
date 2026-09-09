const ApiError = require('../utils/apiError');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Minimum 8 chars, 1 uppercase, 1 number, 1 special character
const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

const validateRegister = (req, res, next) => {
  const { name, email, password } = req.body || {};
  const details = {};

  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
    details.name = 'Name is required and must be between 2 and 80 characters';
  }

  if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
    details.email = 'A valid email address is required';
  }

  if (!password || typeof password !== 'string' || !passwordRegex.test(password)) {
    details.password =
      'Password must be at least 8 characters long and contain at least 1 uppercase letter, 1 number, and 1 special character';
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
