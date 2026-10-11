const mongoose = require('mongoose');

const stageSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['waiting', 'processing', 'completed', 'failed', 'skipped'],
      default: 'waiting',
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const pipelineRunSchema = new mongoose.Schema(
  {
    datasetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dataset',
      required: true,
    },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    manufacturerAdapter: {
      type: String,
      default: null,
    },
    pipelineVersion: {
      type: String,
      default: '1.0.0',
    },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed'],
      default: 'queued',
    },
    stages: {
      validation: { type: stageSchema, default: () => ({ status: 'waiting' }) },
      schemaMapping: { type: stageSchema, default: () => ({ status: 'waiting' }) },
      cleaning: { type: stageSchema, default: () => ({ status: 'waiting' }) },
      missingValueHandling: { type: stageSchema, default: () => ({ status: 'waiting' }) },
      outlierDetection: { type: stageSchema, default: () => ({ status: 'waiting' }) },
      featureEngineering: { type: stageSchema, default: () => ({ status: 'waiting' }) },
      normalization: { type: stageSchema, default: () => ({ status: 'waiting' }) },
    },
    inputRecords: {
      type: Number,
      default: null,
    },
    outputRecords: {
      type: Number,
      default: null,
    },
    featuresGenerated: {
      type: [String],
      default: [],
    },
    errors: {
      type: [String],
      default: [],
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: 'pipelineRuns',
    timestamps: false,
    suppressReservedKeysWarning: true,
  }
);

// Indexes
pipelineRunSchema.index({ datasetId: 1 });
pipelineRunSchema.index({ vehicleId: 1 });
pipelineRunSchema.index({ userId: 1 });

const PipelineRun = mongoose.model('PipelineRun', pipelineRunSchema);

module.exports = PipelineRun;
