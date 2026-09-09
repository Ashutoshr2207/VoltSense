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
      required: true,
      enum: ['Tesla', 'BYD', 'Tata'],
      trim: true,
    },
    model: {
      type: String,
      required: true,
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
      type: Number,
      default: null,
    },
    latestEOL: {
      type: Number,
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
