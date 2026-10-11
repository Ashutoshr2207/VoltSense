/**
 * Standard 4-key API response envelope helper
 * Format:
 * {
 *   "success": true,
 *   "data": ...,
 *   "message": "...",
 *   "error": null
 * }
 */
class ApiResponse {
  static success(res, data = {}, message = null, statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      data,
      message,
      error: null,
    });
  }

  static created(res, data = {}, message = null) {
    return ApiResponse.success(res, data, message, 201);
  }

  static accepted(res, data = {}, message = null) {
    return ApiResponse.success(res, data, message, 202);
  }
}

module.exports = ApiResponse;
