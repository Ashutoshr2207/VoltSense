const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const ApiError = require('../utils/apiError');

class StorageService {
  constructor(uploadDir = process.env.NODE_ENV === 'test'
    ? path.join(require('os').tmpdir(), 'voltsense-test-uploads-' + process.pid)
    : path.resolve(__dirname, '../../uploads/raw')) {
    this.uploadDir = path.resolve(uploadDir);
  }

  async resolveRaw(storage, vehicleId, allowMissing = false) {
    const match = /^\/uploads\/raw\/([a-f0-9]{24})\/([^/\\]+)$/i.exec(storage?.rawUrl || '');
    if (storage?.provider !== 'local' || !match || match[1] !== String(vehicleId) || ['.', '..'].includes(match[2])) {
      throw ApiError.badRequest('Unsafe or unsupported raw-file reference', 'INVALID_FILE');
    }
    const target = path.join(this.uploadDir, match[1], match[2]);
    try {
      const [base, parent, stat] = await Promise.all([
        fs.realpath(this.uploadDir), fs.realpath(path.dirname(target)), fs.lstat(target),
      ]);
      if (parent !== path.join(base, match[1]) || stat.isSymbolicLink() || !stat.isFile()) {
        throw ApiError.badRequest('Raw file must be a regular file inside its vehicle directory', 'INVALID_FILE');
      }
      return target;
    } catch (err) {
      if (allowMissing && err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async readRaw(storage, vehicleId) {
    return fs.readFile(await this.resolveRaw(storage, vehicleId));
  }

  async deleteRaw(storage, vehicleId) {
    const target = await this.resolveRaw(storage, vehicleId, true);
    if (target) await fs.unlink(target);
  }

  async saveRawTelemetry(vehicleId, file) {
    if (!/^[a-f0-9]{24}$/i.test(String(vehicleId))) throw ApiError.invalidObjectId('vehicleId');
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.csv', '.xlsx', '.xls'].includes(ext)) throw ApiError.badRequest('Unsupported upload extension', 'INVALID_FILE');
    const folder = path.join(this.uploadDir, String(vehicleId));
    await fs.mkdir(folder, { recursive: true });
    const base = await fs.realpath(this.uploadDir);
    if (await fs.realpath(folder) !== path.join(base, String(vehicleId))) throw ApiError.badRequest('Unsafe upload directory', 'INVALID_FILE');
    const name = Date.now() + '_' + crypto.randomBytes(8).toString('hex') + ext;
    await fs.writeFile(path.join(folder, name), file.buffer, { flag: 'wx', mode: 0o600 });
    return { provider: 'local', rawUrl: '/uploads/raw/' + vehicleId + '/' + name, processedUrl: null };
  }
}
module.exports = new StorageService();
module.exports.StorageService = StorageService;
