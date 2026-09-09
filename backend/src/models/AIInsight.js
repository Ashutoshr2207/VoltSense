const mongoose = require('mongoose');

const insightItemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['health', 'degradation', 'temperature', 'usage', 'data_quality', 'prediction'],
      required: true,
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const aiInsightSchema = new mongoose.Schema(
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
    predictionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Prediction',
      required: true,
    },
    summary: {
      type: String,
      required: true,
    },
    insights: {
      type: [insightItemSchema],
      default: [],
    },
    recommendations: {
      type: [String],
      default: [],
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
    generator: {
      model: { type: String, default: 'VoltSense Rule Classifier' },
      version: { type: String, default: 'v1.0' },
    },
  },
  {
    collection: 'aiInsights',
    timestamps: false,
  }
);

// Indexes
aiInsightSchema.index({ vehicleId: 1 });
aiInsightSchema.index({ predictionId: 1 });
aiInsightSchema.index({ userId: 1 });

const AIInsight = mongoose.model('AIInsight', aiInsightSchema);

module.exports = AIInsight;
