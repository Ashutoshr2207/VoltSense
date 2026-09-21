/**
 * Standard API error class with status code, machine-readable code, and details.
 */
class ApiError extends Error {
  constructor(statusCode, message, code = 'INTERNAL_SERVER_ERROR', details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, code = 'VALIDATION_ERROR', details = {}) {
    return new ApiError(400, message, code, details);
  }

  static unauthorized(message = 'Authentication required', code = 'AUTHENTICATION_REQUIRED') {
    return new ApiError(401, message, code);
  }

  static invalidCredentials(message = 'Invalid email or password') {
    return new ApiError(401, message, 'INVALID_CREDENTIALS');
  }

  static forbidden(message = 'You do not have permission to access this resource') {
    return new ApiError(403, message, 'FORBIDDEN');
  }

  static notFound(message = 'Resource not found', code = 'RESOURCE_NOT_FOUND') {
    return new ApiError(404, message, code);
  }

  static conflict(message = 'Resource already exists', code = 'DUPLICATE_RESOURCE') {
    return new ApiError(409, message, code);
  }

  static invalidObjectId(paramName = 'id') {
    return new ApiError(400, `Invalid ${paramName} identifier format`, 'INVALID_OBJECT_ID');
  }

  static invalidFile(message = 'Invalid file uploaded', details = {}) {
    return new ApiError(400, message, 'INVALID_FILE', details);
  }

  static unprocessable(message = 'Processing error', code = 'PIPELINE_ERROR', details = {}) {
    return new ApiError(422, message, code, details);
  }

  static internal(message = 'Internal server error', code = 'INTERNAL_SERVER_ERROR') {
    return new ApiError(500, message, code);
  }
}

module.exports = ApiError;
