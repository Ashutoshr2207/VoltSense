const multer = require('multer');
const path = require('path');
const ApiError = require('../utils/apiError');
const env = require('../config/env');

const storage = multer.memoryStorage();

const allowedExtensions = ['.csv', '.xlsx', '.xls'];
const allowedMimeTypes = [
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/octet-stream',
  'application/zip',
];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return cb(
      ApiError.badRequest(
        `Unsupported file type '${ext}'. Allowed types: ${allowedExtensions.join(', ')}`,
        'INVALID_FILE'
      ),
      false
    );
  }
  if (file.mimetype && !allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
    return cb(ApiError.badRequest('This file does not appear to be a valid CSV file.', 'INVALID_FILE'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    files: 1,
    fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024,
  },
  fileFilter,
});

module.exports = upload;
