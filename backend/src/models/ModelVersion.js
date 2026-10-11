const mongoose = require('mongoose');

const modelMetricsSchema = new mongoose.Schema(
  {
    mae: { type: Number, default: null },
    rmse: { type: Number, default: null },
    r2: { type: Number, default: null },
  },
  { _id: false }
);

const modelSubComponentSchema = new mongoose.Schema(
  {
    algorithm: { type: String, required: true },
    filePath: { type: String, default: null },
    metrics: { type: modelMetricsSchema, default: () => ({}) },
  },
  { _id: false }
);

const modelVersionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    version: {
      type: String,
      required: true,
    },
    sohModel: {
      type: modelSubComponentSchema,
      required: true,
    },
    rulModel: {
      type: modelSubComponentSchema,
      required: true,
    },
    trainingDataset: {
      type: String,
      default: null,
    },
    featureSchemaVersion: {
      type: String,
      default: '1.0.0',
    },
    status: {
      type: String,
      enum: ['development', 'testing', 'production', 'deprecated'],
      default: 'development',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'modelVersions',
    timestamps: false,
  }
);

// Indexes
modelVersionSchema.index({ name: 1, version: 1 });
modelVersionSchema.index({ status: 1 });

const ModelVersion = mongoose.model('ModelVersion', modelVersionSchema);

module.exports = ModelVersion;
