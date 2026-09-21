/**
 * Seeds the VoltSense database with a demo operator account and their one
 * personal EV (plus a small history of datasets/predictions/insights/
 * notifications) so the app is immediately usable after `npm run seed`.
 *
 * Usage:
 *   npm run seed
 *
 * Requires MONGODB_URI (and optionally MONGODB_DATABASE) to be set, same as
 * running the server itself (see .env.example).
 */
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../src/config/database');

const User = require('../src/models/User');
const Vehicle = require('../src/models/Vehicle');
const Dataset = require('../src/models/Dataset');
const PipelineRun = require('../src/models/PipelineRun');
const Prediction = require('../src/models/Prediction');
const AIInsight = require('../src/models/AIInsight');
const Notification = require('../src/models/Notification');

const DEMO_EMAIL = 'reed.parmar@voltsense.io';
const DEMO_PASSWORD = 'VoltSense#2026';

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const hoursAgo = (n) => new Date(Date.now() - n * 60 * 60 * 1000);
const minutesAgo = (n) => new Date(Date.now() - n * 60 * 1000);

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

async function seed() {
  await connectDB();

  console.log('Clearing previous demo data...');
  const existingUser = await User.findOne({ email: DEMO_EMAIL });
  if (existingUser) {
    await Prediction.deleteMany({ userId: existingUser._id });
    await AIInsight.deleteMany({ userId: existingUser._id });
    await PipelineRun.deleteMany({ userId: existingUser._id });
    await Dataset.deleteMany({ userId: existingUser._id });
    await Notification.deleteMany({ userId: existingUser._id });
    await Vehicle.deleteMany({ userId: existingUser._id });
    await User.deleteOne({ _id: existingUser._id });
  }

  console.log('Creating demo user...');
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, salt);
  const user = await User.create({
    name: 'Reed Parmar',
    email: DEMO_EMAIL,
    passwordHash,
    preferences: {
      theme: 'light',
      emailNotifications: true,
      batteryAlerts: true,
      analysisNotifications: true,
      dataQualityAlerts: true,
    },
  });

  console.log('Creating your EV...');
  const vehicle = await Vehicle.create({
    userId: user._id,
    manufacturer: 'Tesla',
    model: 'Model 3 Long Range',
    year: 2023,
    batteryVariant: '82.0 kWh NCA',
    nickname: 'My EV',
    batteryCapacityKWh: 82.0,
    vin: '5YJ3E1EB9PF829104',
    trim: 'Long Range AWD',
    cellType: '2170 Cylindrical',
    packVoltage: '389.4 V',
    internalResistance: '1.8 mΩ',
    cellImbalance: '6 mV',
    tempAvg: '28.4 °C',
    degradationRate: '-0.12% / mo',
    status: 'healthy',
    latestSOH: 94.2,
    latestRUL: 680,
    latestEOL: 1092,
    currentCycleCount: 412,
  });

  console.log('Creating dataset & pipeline run...');
  const dataset = await Dataset.create({
    userId: user._id,
    vehicleId: vehicle._id,
    manufacturer: vehicle.manufacturer,
    originalFileName: 'bms_telemetry_20260907.csv',
    fileType: 'csv',
    fileSize: 12482 * 180,
    sourceType: 'demo_dataset',
    storage: { provider: 'local', rawUrl: `/uploads/raw/${vehicle._id}/bms_telemetry_20260907.csv`, processedUrl: null },
    recordCount: 12482,
    schemaVersion: 'GENERIC_BMS_V1.0',
    status: 'processed',
    dataQuality: {
      missingPercentage: 0.4,
      outlierPercentage: 0.2,
      duplicateRecords: 3,
      invalidRecords: 1,
      overallQuality: 'excellent',
    },
    uploadedAt: hoursAgo(6),
    processedAt: hoursAgo(6),
  });

  const stageBlock = () => ({ status: 'completed', startedAt: hoursAgo(6), completedAt: hoursAgo(6) });
  const pipelineRun = await PipelineRun.create({
    datasetId: dataset._id,
    vehicleId: vehicle._id,
    userId: user._id,
    manufacturerAdapter: `${vehicle.manufacturer}_Adapter`,
    pipelineVersion: '1.0.0',
    status: 'completed',
    stages: {
      validation: stageBlock(),
      schemaMapping: stageBlock(),
      cleaning: stageBlock(),
      missingValueHandling: stageBlock(),
      outlierDetection: stageBlock(),
      featureEngineering: stageBlock(),
      normalization: stageBlock(),
    },
    inputRecords: 12482,
    outputRecords: 12108,
    startedAt: hoursAgo(6),
    completedAt: hoursAgo(6),
  });

  console.log('Creating predictions...');

  async function makePrediction({ soh, rul, cycle, eol, lossBreakdown, createdAt, modelOverride, runId }) {
    let targetRunId = runId;
    if (!targetRunId) {
      const historicalRun = await PipelineRun.create({
        datasetId: dataset._id,
        vehicleId: vehicle._id,
        userId: user._id,
        manufacturerAdapter: `${vehicle.manufacturer}_Adapter`,
        pipelineVersion: '1.0.0',
        status: 'completed',
        stages: {
          validation: stageBlock(),
          schemaMapping: stageBlock(),
          cleaning: stageBlock(),
          missingValueHandling: stageBlock(),
          outlierDetection: stageBlock(),
          featureEngineering: stageBlock(),
          normalization: stageBlock(),
        },
        inputRecords: 12482,
        outputRecords: 12108,
        startedAt: createdAt,
        completedAt: createdAt,
      });
      targetRunId = historicalRun._id;
    }

    return Prediction.create({
      userId: user._id,
      vehicleId: vehicle._id,
      datasetId: dataset._id,
      pipelineRunId: targetRunId,
      model: modelOverride || { name: 'VoltSense Bayesian SOH', version: 'v1.0', algorithm: 'Bayesian MCMC' },
      prediction: { soh, currentCycle: cycle, rulCycles: rul, estimatedEOLCycle: eol, eolThreshold: 70.0 },
      confidence: { soh: 0.94, rul: 0.87 },
      lossBreakdown,
      degradation: {
        historical: [
          { cycle: 0, soh: 100.0 },
          { cycle: Math.round(cycle * 0.25), soh: round(100 - (100 - soh) * 0.25) },
          { cycle: Math.round(cycle * 0.5), soh: round(100 - (100 - soh) * 0.5) },
          { cycle: Math.round(cycle * 0.75), soh: round(100 - (100 - soh) * 0.75) },
          { cycle, soh },
        ],
        predicted: [
          { cycle: Math.round(cycle + (eol - cycle) * 0.33), soh: round(soh - (soh - 70) * 0.33) },
          { cycle: Math.round(cycle + (eol - cycle) * 0.66), soh: round(soh - (soh - 70) * 0.66) },
          { cycle: eol, soh: 70.0 },
        ],
      },
      metrics: { mae: 0.35, rmse: 0.48, r2: 0.994 },
      createdAt,
    });
  }

  const latestPrediction = await makePrediction({
    soh: 94.2,
    rul: 680,
    cycle: 412,
    eol: 1092,
    lossBreakdown: { lli: 4.1, lam: 1.7, ohmic: 3.2 },
    createdAt: hoursAgo(6),
    runId: pipelineRun._id,
  });

  await makePrediction({
    soh: 94.3,
    rul: 690,
    cycle: 398,
    eol: 1088,
    lossBreakdown: { lli: 4.0, lam: 1.6, ohmic: 3.1 },
    createdAt: daysAgo(2),
    modelOverride: { name: 'VoltSense NeuralODE', version: 'v2.1', algorithm: 'Neural ODE' },
  });

  await makePrediction({
    soh: 94.6,
    rul: 710,
    cycle: 372,
    eol: 1082,
    lossBreakdown: { lli: 3.6, lam: 1.4, ohmic: 2.8 },
    createdAt: daysAgo(9),
  });

  vehicle.latestPredictionId = latestPrediction._id;
  await vehicle.save();

  console.log('Creating AI insight (with recommendations + explanation)...');
  await AIInsight.create({
    userId: user._id,
    vehicleId: vehicle._id,
    predictionId: latestPrediction._id,
    summary: 'Pack degradation is nominal. Estimated remaining useful cycles: 680.',
    insights: [
      {
        type: 'health',
        severity: 'low',
        title: 'Nominal Baseline Degradation',
        description: 'Degradation conforms to factory specifications for NCA 2170 cell chemistry.',
      },
      {
        type: 'temperature',
        severity: 'low',
        title: 'Coolant Thermistor Delta Optimal',
        description: 'Pack temperature gradient maintained within ±0.8°C across all modules.',
      },
    ],
    recommendations: [
      'Maintain daily charging threshold below 80% to curtail SEI layer growth.',
      'Scheduled cell passive balance cycle nominal; next interval at 500 cycles.',
      'Coolant flow impedance optimal; thermistor differential within ±0.8°C.',
    ],
    explanation: [
      { factor: 'Charge Cycle Accumulation', description: '14 additional charge cycles were logged since the previous analysis.', impactPct: 55 },
      { factor: 'Thermal Exposure', description: 'Average pack temperature during this dataset was 28.4°C.', impactPct: 20 },
      { factor: 'Cell Balance Drift', description: 'Bank-to-bank voltage differential of 6mV was recorded during rest stabilization.', impactPct: 25 },
    ],
    generatedAt: hoursAgo(6),
  });

  console.log('Creating notification...');
  await Notification.create({
    userId: user._id,
    vehicleId: vehicle._id,
    predictionId: latestPrediction._id,
    type: 'analysis_complete',
    title: 'Battery Analysis Complete',
    message: 'New SOH reading: 94.2% (680 cycles remaining to 70% EOL).',
    read: false,
    createdAt: hoursAgo(6),
  });

  console.log('\nSeed complete.');
  console.log('-----------------------------------------');
  console.log(`Demo login   : ${DEMO_EMAIL}`);
  console.log(`Demo password: ${DEMO_PASSWORD}`);
  console.log('-----------------------------------------');

  await disconnectDB();
  await mongoose.connection.close().catch(() => {});
  process.exit(0);
}

seed().catch(async (error) => {
  console.error('Seed failed:', error);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
