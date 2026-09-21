const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    manufacturer: {
      type: String,
      default: 'My EV',
      trim: true,
    },
    model: {
      type: String,
      default: '',
      trim: true,
    },
    year: {
      type: Number,
      default: null,
    },
    batteryVariant: {
      type: String,
      default: null,
      trim: true,
    },
    nickname: {
      type: String,
      default: null,
      trim: true,
    },
    batteryCapacityKWh: {
      type: Number,
      default: null,
    },
    vin: {
      type: String,
      default: null,
      trim: true,
    },
    trim: {
      type: String,
      default: null,
      trim: true,
    },
    cellType: {
      type: String,
      default: null,
      trim: true,
    },
    packVoltage: {
      type: String,
      default: null,
      trim: true,
    },
    internalResistance: {
      type: String,
      default: null,
      trim: true,
    },
    cellImbalance: {
      type: String,
      default: null,
      trim: true,
    },
    tempAvg: {
      type: String,
      default: null,
      trim: true,
    },
    degradationRate: {
      type: String,
      default: null,
      trim: true,
    },
    status: {
      type: String,
      enum: ['healthy', 'attention', 'critical', 'unknown'],
      default: 'unknown',
    },
    latestSOH: {
      type: Number,
      default: null,
    },
    latestRUL: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    latestEOL: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    currentCycleCount: {
      type: Number,
      default: null,
    },
    latestPredictionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Prediction',
      default: null,
    },
  },
  {
    collection: 'vehicles',
    timestamps: true,
  }
);

// Compound indexes
vehicleSchema.index({ userId: 1 });
vehicleSchema.index({ userId: 1, manufacturer: 1 });

const Vehicle = mongoose.model('Vehicle', vehicleSchema);

module.exports = Vehicle;
