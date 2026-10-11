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
    // Server-generated filename: the user-supplied name is never used in a path.
    const safeFileName = `${Date.now()}_${require('crypto').randomBytes(8).toString('hex')}.csv`;

    // Local filesystem storage
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
