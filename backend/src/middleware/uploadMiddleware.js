const multer = require('multer');
const path = require('path');
const ApiError = require('../utils/apiError');
const env = require('../config/env');

const storage = multer.memoryStorage();

const allowedExtensions = ['.csv', '.json', '.parquet'];

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
  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024,
  },
  fileFilter,
});

module.exports = upload;
