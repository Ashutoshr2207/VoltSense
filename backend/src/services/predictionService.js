const Prediction = require('../models/Prediction');
const Vehicle = require('../models/Vehicle');
const Dataset = require('../models/Dataset');
const ApiError = require('../utils/apiError');
const { formatDocument, formatDocuments } = require('../utils/idHelper');

class PredictionService {
  buildStructuredAnalysis(prediction, dataset) {
    const isSynthetic = dataset?.sourceType === 'synthetic_dataset' ||
      (dataset?.originalFileName && dataset.originalFileName.toLowerCase().includes('synthetic'));

    const batteryId = prediction.prediction?.selectedBatteryId || dataset?.selectedBatteryId || (isSynthetic ? 'Synthetic Cell 01' : 'Battery 01');
    const availableBatteries = prediction.prediction?.availableBatteries || dataset?.availableBatteries || [];
    const eolThreshold = prediction.prediction?.eolThreshold || 70;
    const currentCycle = prediction.prediction?.currentCycle || 1;
    const rulCycles = typeof prediction.prediction?.rulCycles === 'number' ? prediction.prediction.rulCycles : null;

    const cycleTable = prediction.cycleTable || dataset?.cycleTable || [];
    const historical = prediction.degradation?.historical || [];

    const warnings = [];
    if (prediction.prediction?.soh < 75) {
      warnings.push(`Low State of Health: SOH is ${prediction.prediction.soh}%, approaching the ${eolThreshold}% EOL threshold.`);
    }
    if (prediction.prediction?.rulStatus === 'insufficient_degradation_history') {
      warnings.push('Insufficient degradation slope observed to establish a reliable RUL projection.');
    }

    return {
      dataset: {
        source: isSynthetic ? 'Synthetic Test Data' : 'NASA Battery Experimental Data',
        type: isSynthetic ? 'synthetic' : 'experimental',
        batteryId,
        availableBatteries,
        rows: dataset?.recordCount || cycleTable.length,
        cycles: prediction.prediction?.cyclesUsed || cycleTable.length,
      },
      soh: {
        empirical: prediction.prediction?.soh ?? null,
        predicted: prediction.prediction?.modelSoh ?? null,
        referenceCapacityAh: prediction.prediction?.referenceCapacityAh ?? null,
        currentCapacityAh: prediction.prediction?.currentCapacityAh ?? null,
        method: 'initial_discharge_capacity_ratio',
      },
      degradation: {
        slope: prediction.prediction?.degradationSlope ?? null,
        unit: 'percentage_points_per_cycle',
        r2: prediction.prediction?.degradationR2 ?? null,
        cyclesUsed: prediction.prediction?.cyclesUsed ?? cycleTable.length,
      },
      rul: {
        currentCycle,
        eolThreshold,
        predictedEolCycle: prediction.prediction?.estimatedEOLCycle ?? null,
        rulCycles,
        method: 'linear_degradation_extrapolation',
        status: prediction.prediction?.rulStatus || 'insufficient_degradation_history',
      },
      confidence: {
        value: prediction.confidence?.value ?? null,
        calibrated: prediction.confidence?.calibrated ?? false,
        method: prediction.confidence?.method ?? null,
        uncertaintyInterval: prediction.confidence?.uncertaintyInterval ?? 'Not calibrated',
        sohUncertaintyStd: prediction.confidence?.sohUncertaintyStd ?? null,
      },
      telemetry: {
        voltageMin: dataset?.columnStats?.voltage?.min ?? null,
        voltageMax: dataset?.columnStats?.voltage?.max ?? null,
        temperatureMin: dataset?.columnStats?.temperature?.min ?? null,
        temperatureMax: dataset?.columnStats?.temperature?.max ?? null,
        temperatureMean: dataset?.columnStats?.temperature?.mean ?? null,
        dischargePercent: prediction.timeShare?.dischargePercent ?? null,
        chargePercent: prediction.timeShare?.chargePercent ?? null,
        restPercent: prediction.timeShare?.restPercent ?? null,
      },
      capacityAnalysis: {
        firstHalfLoss: prediction.fadeShare?.firstHalfPct ?? null,
        secondHalfLoss: prediction.fadeShare?.secondHalfPct ?? null,
      },
      charts: {
        capacityByCycle: cycleTable.map((c) => ({ cycle: c.cycle, capacity: c.capacity })),
        sohByCycle: historical,
        dischargeDurationByCycle: cycleTable.map((c) => ({ cycle: c.cycle, durationSeconds: c.dischargeDuration })),
      },
      warnings,
    };
  }

  async listPredictionsForVehicle(userId, vehicleId, query = {}) {
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      throw ApiError.notFound(`Vehicle not found with ID '${vehicleId}'`, 'RESOURCE_NOT_FOUND');
    }
    if (vehicle.userId.toString() !== userId) {
      throw ApiError.forbidden('You do not have permission to access predictions for this vehicle');
    }

    const page = Math.max(1, parseInt(query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize || '20', 10)));
    const skip = (page - 1) * pageSize;

    const filter = { vehicleId };
    const predictions = await Prediction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize);

    const total = await Prediction.countDocuments(filter);

    return {
      predictions: formatDocuments(predictions),
      total,
      page,
      pageSize,
    };
  }

  async getPredictionById(userId, predictionId) {
    const prediction = await Prediction.findById(predictionId);
    if (!prediction) {
      throw ApiError.notFound(`Prediction not found with ID '${predictionId}'`, 'RESOURCE_NOT_FOUND');
    }

    if (prediction.userId.toString() !== userId) {
      throw ApiError.forbidden('You do not have permission to access this prediction');
    }

    const dataset = await Dataset.findById(prediction.datasetId);
    const structuredAnalysis = this.buildStructuredAnalysis(prediction, dataset);

    const formatted = formatDocument(prediction);
    formatted.structuredAnalysis = structuredAnalysis;
    return formatted;
  }

  async getAnalysisByPredictionId(userId, predictionId) {
    const prediction = await Prediction.findById(predictionId);
    if (!prediction) {
      throw ApiError.notFound(`Prediction not found with ID '${predictionId}'`, 'RESOURCE_NOT_FOUND');
    }

    if (prediction.userId.toString() !== userId) {
      throw ApiError.forbidden('You do not have permission to access this prediction');
    }

    const dataset = await Dataset.findById(prediction.datasetId);
    return this.buildStructuredAnalysis(prediction, dataset);
  }
}

module.exports = new PredictionService();
