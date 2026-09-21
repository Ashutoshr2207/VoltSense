const ApiError = require('../utils/apiError');

const validateUpdateUser = (req, res, next) => {
  const { name, preferences } = req.body || {};
  const details = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
      details.name = 'Name must be between 2 and 80 characters';
    } else {
      req.body.name = name.trim();
    }
  }

  if (preferences !== undefined) {
    if (typeof preferences !== 'object' || preferences === null) {
      details.preferences = 'Preferences must be an object';
    } else {
      if (preferences.theme !== undefined && !['light', 'dark', 'system'].includes(preferences.theme)) {
        details['preferences.theme'] = "Theme must be one of: 'light', 'dark', 'system'";
      }
      ['emailNotifications', 'batteryAlerts', 'analysisNotifications', 'dataQualityAlerts'].forEach((field) => {
        if (preferences[field] !== undefined && typeof preferences[field] !== 'boolean') {
          details[`preferences.${field}`] = `${field} must be a boolean`;
        }
      });
    }
  }

  if (Object.keys(details).length > 0) {
    return next(ApiError.badRequest('Validation error', 'VALIDATION_ERROR', details));
  }

  next();
};

module.exports = {
  validateUpdateUser,
};
