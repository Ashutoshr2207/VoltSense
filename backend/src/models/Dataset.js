const mongoose = require('mongoose');

const datasetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true,
    },
    manufacturer: {
      type: String,
      default: null,
      trim: true,
    },
    originalFileName: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      enum: ['csv', 'json', 'parquet'],
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    sourceType: {
      type: String,
      enum: ['user_upload', 'demo_dataset', 'synthetic_dataset'],
      default: 'user_upload',
    },
    storage: {
      provider: {
        type: String,
        default: 'local',
      },
      rawUrl: {
        type: String,
        default: null,
      },
      processedUrl: {
        type: String,
        default: null,
      },
    },
    recordCount: {
      type: Number,
      default: null,
    },
    schemaVersion: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['uploaded', 'processing', 'processed', 'failed'],
      default: 'uploaded',
    },
    dataQuality: {
      missingPercentage: { type: Number, default: null },
      outlierPercentage: { type: Number, default: null },
      duplicateRecords: { type: Number, default: null },
      invalidRecords: { type: Number, default: null },
      overallQuality: {
        type: String,
        enum: ['excellent', 'good', 'fair', 'poor', 'unknown', null],
        default: null,
      },
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: 'datasets',
    timestamps: false, // uploadedAt is tracked explicitly per schema
  }
);

// Indexes
datasetSchema.index({ userId: 1 });
datasetSchema.index({ vehicleId: 1 });
datasetSchema.index({ vehicleId: 1, uploadedAt: -1 });

const Dataset = mongoose.model('Dataset', datasetSchema);

module.exports = Dataset;
