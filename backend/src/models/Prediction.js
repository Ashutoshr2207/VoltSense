const mongoose = require('mongoose');

const degradationPointSchema = new mongoose.Schema(
  {
    cycle: { type: Number, required: true },
    soh: { type: Number, required: true },
  },
  { _id: false }
);

const predictionSchema = new mongoose.Schema(
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
    datasetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dataset',
      required: true,
    },
    pipelineRunId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PipelineRun',
      required: true,
    },
    model: {
      name: { type: String, required: true },
      version: { type: String, required: true },
      algorithm: { type: String, required: true },
    },
    prediction: {
      soh: { type: Number, required: true },
      currentCycle: { type: Number, required: true },
      rulCycles: { type: Number, required: true },
      estimatedEOLCycle: { type: Number, required: true },
      eolThreshold: { type: Number, default: 70 },
    },
    confidence: {
      soh: { type: Number, default: null },
      rul: { type: Number, default: null },
    },
    degradation: {
      historical: {
        type: [degradationPointSchema],
        default: [],
      },
      predicted: {
        type: [degradationPointSchema],
        default: [],
      },
    },
    metrics: {
      mae: { type: Number, default: null },
      rmse: { type: Number, default: null },
      r2: { type: Number, default: null },
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'predictions',
    timestamps: false,
  }
);

// Indexes
predictionSchema.index({ vehicleId: 1 });
predictionSchema.index({ datasetId: 1 });
predictionSchema.index({ userId: 1 });
predictionSchema.index({ vehicleId: 1, createdAt: -1 });

const Prediction = mongoose.model('Prediction', predictionSchema);

module.exports = Prediction;
