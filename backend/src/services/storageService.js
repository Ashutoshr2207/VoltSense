const fs = require('fs');
const path = require('path');
const env = require('../config/env');

class StorageService {
  constructor() {
    this.uploadDir = path.resolve(__dirname, '../../uploads/raw');
    // Ensure upload directory exists when using local driver
    if (env.NODE_ENV !== 'test') {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Save uploaded telemetry buffer
   * Returns storage metadata: { provider, rawUrl, processedUrl: null }
   */
  async saveRawTelemetry(vehicleId, file) {
    const timestamp = Date.now();
    const safeFileName = `${timestamp}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    if (env.NODE_ENV === 'production' && process.env.OBJECT_STORAGE_PROVIDER === 's3') {
      // Cloud S3 integration point
      const bucket = process.env.OBJECT_STORAGE_BUCKET || 'voltsense-raw';
      const rawUrl = `s3://${bucket}/${vehicleId}/${safeFileName}`;
      return {
        provider: 's3',
        rawUrl,
        processedUrl: null,
      };
    }

    // Local filesystem driver for development & tests
    const vehicleFolder = path.join(this.uploadDir, vehicleId.toString());
    if (env.NODE_ENV !== 'test') {
      fs.mkdirSync(vehicleFolder, { recursive: true });
      const targetPath = path.join(vehicleFolder, safeFileName);
      fs.writeFileSync(targetPath, file.buffer);
    }

    return {
      provider: 'local',
      rawUrl: `/uploads/raw/${vehicleId}/${safeFileName}`,
      processedUrl: null,
    };
  }
}

module.exports = new StorageService();
