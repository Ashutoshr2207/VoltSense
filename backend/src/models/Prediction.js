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
      modelSoh: { type: Number, default: null },
      referenceCapacityAh: { type: Number, default: null },
      currentCapacityAh: { type: Number, default: null },
      currentCycle: { type: Number, required: true },
      rulCycles: { type: mongoose.Schema.Types.Mixed, default: null },
      estimatedEOLCycle: { type: mongoose.Schema.Types.Mixed, default: null },
      eolThreshold: { type: Number, default: 70 },
      rulStatus: { type: String, default: null },
      degradationSlope: { type: Number, default: null },
      degradationR2: { type: Number, default: null },
      cyclesUsed: { type: Number, default: null },
      selectedBatteryId: { type: String, default: null },
      availableBatteries: { type: [String], default: [] },
    },
    confidence: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({
        calibrated: false,
        method: null,
        value: null,
        uncertaintyInterval: 'Unavailable',
        sohUncertaintyStd: null,
      }),
    },
    lossBreakdown: {
      lli: { type: Number, default: null },
      lam: { type: Number, default: null },
      ohmic: { type: Number, default: null },
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
    timeShare: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    cycleTable: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },
    fadeShare: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    metrics: {
      mae: { type: Number, default: null },
      rmse: { type: Number, default: null },
      r2: { type: Number, default: null },
    },
    diagnostics: {
      internalResistanceMOhm: { type: Number, default: null },
      cellImbalanceMv: { type: Number, default: null },
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
predictionSchema.index({ pipelineRunId: 1 }, { unique: true });
predictionSchema.index({ vehicleId: 1, createdAt: -1 });

const Prediction = mongoose.model('Prediction', predictionSchema);

module.exports = Prediction;
