const PipelineRun = require('../models/PipelineRun');
const Dataset = require('../models/Dataset');
const Vehicle = require('../models/Vehicle');
const Prediction = require('../models/Prediction');
const AIInsight = require('../models/AIInsight');
const Notification = require('../models/Notification');
const parser = require('./csvParserService');
const storage = require('./storageService');
const mlClient = require('./mlClient');
const { rollbackRun, repairVehicle } = require('./analysisPersistenceService');
const jobs = new Map();
const activeRuns = new Map();
const STAGES = ['validation', 'schemaMapping', 'cleaning', 'missingValueHandling', 'outlierDetection', 'featureEngineering', 'normalization'];

function setStage(run, name, status, time = new Date()) {
  const stage = run.stages[name];
  stage.status = status;
  if (status === 'processing') stage.startedAt = time;
  else stage.completedAt = time;
}
function quality(parsed) {
  const q = parsed.quality;
  const total = parsed.recordCount + q.duplicateRowCount;
  return { missingPercentage: q.missingPercentage, outlierPercentage: Math.min(100, 100 * q.outlierCount / Math.max(1, total)),
    duplicateRecords: q.duplicateRowCount, invalidRecords: q.invalidNumericCount,
    overallQuality: q.outlierCount || q.invalidNumericCount ? 'fair' : q.missingPercentage > 0 ? 'good' : 'excellent' };
}
function applyParsed(dataset, parsed) {
  for (const key of ['recordCount', 'cycleCount', 'columnStats', 'timeShare', 'cycleTable', 'fadeShare', 'chargingSessions', 'latestSoc',
    'selectedBatteryId', 'availableBatteries', 'soh', 'degradation', 'rul', 'analysisReport', 'schemaInfo', 'spreads', 'sourceColumns', 'anomalies', 'measurementDate']) dataset[key] = parsed[key];
  dataset.dataQuality = quality(parsed);
}

async function execute(pipelineRunId, options) {
  const run = await PipelineRun.findById(pipelineRunId);
  if (!run || !['queued', 'processing'].includes(run.status)) return;
  activeRuns.set(String(run._id), { vehicleId: String(run.vehicleId), datasetId: String(run.datasetId) });
  try {
    run.status = 'processing';
    setStage(run, 'validation', 'processing');
    await run.save();
    const dataset = await Dataset.findOne({ _id: run.datasetId, userId: run.userId, vehicleId: run.vehicleId });
    const vehicle = await Vehicle.findOne({ _id: run.vehicleId, userId: run.userId });
    if (!dataset || !vehicle) throw new Error('Dataset or owned vehicle no longer exists');
    const raw = await storage.readRaw(dataset.storage, vehicle.id);
    const parsed = parser.parseBuffer(raw, { fileName: dataset.originalFileName, targetBatteryId: options.batteryId || dataset.selectedBatteryId,
      onStage: (name, status, time) => setStage(run, name, status, time) });
    run.inputRecords = parsed.recordCount + parsed.quality.duplicateRowCount;
    run.outputRecords = parsed.recordCount;
    applyParsed(dataset, parsed);
    await dataset.save();
    await run.save();
    // Check for prior completed pipeline runs and predictions for this vehicle to track longitudinal evolution
    const priorCompletedRuns = await PipelineRun.find({ vehicleId: run.vehicleId, userId: run.userId, status: 'completed' })
      .sort({ completedAt: 1 })
      .distinct('_id');
    const priorPredictions = await Prediction.find({ pipelineRunId: { $in: priorCompletedRuns } })
      .sort({ measurementDate: 1, createdAt: 1 });

    // Combine historical cycles across successive uploads for this vehicle
    const cycleMap = new Map();
    for (const pp of priorPredictions) {
      if (Array.isArray(pp.cycleTable)) {
        for (const c of pp.cycleTable) {
          if (c && c.cycle && c.capacity > 0) cycleMap.set(c.cycle, c);
        }
      }
    }

    const currentCycles = parsed.cycleTable;
    // If current upload cycles start at 1 but there are prior cycles with earlier dates, offset to preserve continuity
    const maxPriorCycle = cycleMap.size > 0 ? Math.max(...Array.from(cycleMap.keys())) : 0;
    const shouldOffset = maxPriorCycle > 0 && currentCycles.length > 0 && currentCycles[0].cycle === 1;
    const cycleOffset = shouldOffset ? maxPriorCycle : 0;

    for (const c of currentCycles) {
      if (c && c.cycle && c.capacity > 0) {
        const adjustedCycle = c.cycle + cycleOffset;
        cycleMap.set(adjustedCycle, { ...c, cycle: adjustedCycle });
      }
    }

    const combinedCycles = Array.from(cycleMap.values()).sort((a, b) => a.cycle - b.cycle);
    const cycles = combinedCycles.length > 0 ? combinedCycles : currentCycles;
    const valid = cycles.filter((c) => Number.isFinite(c.capacity) && c.capacity > 0);
    const eligible = parsed.schemaInfo.hasExplicitCycles && cycles.length >= 7 && valid.length === cycles.length;

    if (valid.length >= 7 && !cycles.every((c, i) => c.cycle === i + 1 && c.capacity > 0)) {
      setStage(run, 'validation', 'failed');
      dataset.dataQuality.overallQuality = 'poor';
      await dataset.save();
      throw new Error('Inference requires complete consecutive discharge history beginning at cycle 1');
    }

    let result = null;
    let reason = null;
    if (eligible) {
      setStage(run, 'featureEngineering', 'processing');
      setStage(run, 'normalization', 'processing');
      await run.save();
      const response = await mlClient.predict({ cycleTable: cycles, eolThreshold: 80, batteryId: parsed.selectedBatteryId });
      if (!response.available) {
        const readable = response.reason === 'unreachable'
          ? 'ML inference service is unreachable at ' + (process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000') + '. Please start the ML service (python -m uvicorn app:app --port 8000) and retry.'
          : response.reason === 'not_configured'
          ? 'ML service URL is not configured. Set ML_SERVICE_URL in backend/.env.'
          : response.reason === 'timeout'
          ? 'ML inference service timed out. The model did not respond within the allocated timeout.'
          : 'ML inference unavailable: ' + response.reason;
        throw new Error(readable);
      }
      result = response.result;
      setStage(run, 'featureEngineering', 'completed');
      setStage(run, 'normalization', 'completed');
      // The approved ML service and manifest define the exact feature order.
      run.featuresGenerated = require('./mlClient').FEATURES;
    } else {
      reason = 'SOH/RUL require 7 or more complete discharge-capacity cycles beginning at cycle 1. Telemetry diagnostics remain available.';
      setStage(run, 'featureEngineering', 'skipped');
      setStage(run, 'normalization', 'skipped');
    }

    // Baseline reference capacity established on the vehicle's very first cycle
    const baselineCapacity = cycles[0]?.capacity || parsed.soh?.referenceCapacityAh || null;
    const latestCapacity = cycles[cycles.length - 1]?.capacity || parsed.soh?.currentCapacityAh || null;
    const longitudinalEmpiricalSoh = (baselineCapacity && latestCapacity)
      ? Number(((latestCapacity / baselineCapacity) * 100).toFixed(1))
      : (parsed.soh?.empirical ?? null);

    // Guard against single-cell lab model scale mismatch (< 50% when battery is healthy > 70%)
    let effectiveSoh = null;
    if (result && result.soh != null) {
      effectiveSoh = (result.soh >= 50)
        ? result.soh
        : (longitudinalEmpiricalSoh ?? parsed.soh?.empirical ?? result.soh);
    } else if (eligible && longitudinalEmpiricalSoh != null) {
      effectiveSoh = longitudinalEmpiricalSoh;
    }

    // Terminal zero RUL retains the first observed crossing, even after recovery.
    const observedEolCycle = (baselineCapacity && cycles.find((c) => c.capacity / baselineCapacity <= 0.8)?.cycle) || null;
    const currentCycle = cycles.at(-1)?.cycle || 1;

    let effectiveRul = null;
    if (result) {
      if (observedEolCycle != null) {
        effectiveRul = 0;
      } else if (result.rul !== null && result.rul !== undefined) {
        effectiveRul = result.rul;
      }
    }

    const estimatedEolCycle = result
      ? (observedEolCycle ?? (currentCycle + (effectiveRul || 0)))
      : null;

    const isExperimental = Boolean(result?.experimental);
    const model = result?.model || { name: 'Telemetry Signal Processor', version: '1.0', algorithm: 'Measured telemetry diagnostics' };

    // Build historical degradation points
    const fullHistory = (baselineCapacity && cycles.length > 0)
      ? cycles.map((c) => ({
          cycle: c.cycle,
          soh: Number(((c.capacity / baselineCapacity) * 100).toFixed(1)),
          capacity: Number(c.capacity.toFixed(2)),
          date: c.date || null,
        }))
      : (parsed.curves?.historical || []);
    const sampled = fullHistory.length > 96
      ? fullHistory.filter((_, i) => i === 0 || i === fullHistory.length - 1 || i % Math.ceil(fullHistory.length / 48) === 0)
      : fullHistory;

    // Build future prediction points if RUL is positive
    const predictedFuture = [];
    if (effectiveRul && effectiveRul > 0 && effectiveSoh) {
      const projSteps = 12;
      for (let step = 1; step <= projSteps; step++) {
        const pCyc = Math.round(currentCycle + (step / projSteps) * effectiveRul);
        const pSoh = Number((effectiveSoh - (step / projSteps) * (effectiveSoh - 80.0)).toFixed(1));
        predictedFuture.push({ cycle: pCyc, soh: pSoh });
      }
    }

    const now = new Date();
    const measurementDate = parsed.measurementDate || null;
    const doc = {
      userId: run.userId, vehicleId: run.vehicleId, datasetId: run.datasetId, pipelineRunId: run._id, model,
      measurementDate,
      prediction: {
        soh: effectiveSoh,
        modelSoh: result?.soh ?? null,
        measuredSoh: longitudinalEmpiricalSoh,
        mlStatus: result ? 'connected' : 'telemetry_only',
        mlReason: isExperimental ? 'Experimental candidate: unapproved model; not validated for real-world battery decisions.' : reason,
        isExperimental,
        factors: result?.factors || [], mlRecommendations: result?.recommendations || [],
        referenceCapacityAh: baselineCapacity ? Number(baselineCapacity.toFixed(4)) : null,
        currentCapacityAh: latestCapacity ? Number(latestCapacity.toFixed(4)) : null,
        measurementDate,
        currentCycle,
        rulCycles: effectiveRul,
        estimatedEOLCycle: estimatedEolCycle,
        eolThreshold: 80,
        rulStatus: result ? 'predicted' : 'telemetry_only',
        degradationSlope: parsed.degradation?.slope ?? null,
        degradationR2: parsed.degradation?.r2 ?? null,
        cyclesUsed: valid.length,
        selectedBatteryId: parsed.selectedBatteryId,
        availableBatteries: parsed.availableBatteries,
      },
      confidence: result?.confidence || { calibrated: false, value: null, method: null, uncertaintyInterval: 'Unavailable' },
      metrics: result?.metrics || { mae: null, rmse: null, r2: null },
      degradation: { historical: sampled, predicted: predictedFuture },
      diagnostics: parsed.diagnostics, lossBreakdown: { lli: null, lam: null, ohmic: null },
      timeShare: parsed.timeShare, cycleTable: cycles, fadeShare: parsed.fadeShare, createdAt: now,
    };
    const prediction = await Prediction.findOneAndUpdate({ pipelineRunId: run._id }, { $set: doc }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
    const summary = result ? (observedEolCycle != null
      ? 'Observed end of life at discharge cycle ' + observedEolCycle + '; remaining discharge cycles: 0.'
      : 'Model SOH: ' + effectiveSoh + '%. Estimated remaining discharge cycles: ' + effectiveRul + '.'
        + (isExperimental ? ' (Experimental candidate — not validated for real-world battery decisions.)' : '')) : reason;
    await AIInsight.findOneAndUpdate({ predictionId: prediction._id, userId: run.userId }, { $set: {
      userId: run.userId, vehicleId: run.vehicleId, predictionId: prediction._id, summary,
      recommendations: result?.recommendations || [], insights: [], generator: { model: model.name, version: model.version }, generatedAt: now,
    } }, { upsert: true, runValidators: true });
    await Notification.updateOne({ userId: run.userId, eventKey: 'analysis:' + run._id }, { $setOnInsert: {
      userId: run.userId, vehicleId: run.vehicleId, predictionId: prediction._id, eventKey: 'analysis:' + run._id,
      type: 'analysis_complete', title: 'Battery analysis complete', message: summary, read: false, createdAt: now,
    } }, { upsert: true });
    dataset.analysisReport = parsed.analysisReport.map((a) => ['soh', 'rul'].includes(a.id)
      ? { ...a, status: result ? 'completed' : 'ineligible', reason: result ? (a.id === 'rul' && observedEolCycle != null
          ? 'Observed 80% SOH end of life at discharge cycle ' + observedEolCycle + '; remaining discharge cycles: 0.'
          : isExperimental
          ? 'Computed by the experimental model (unvalidated candidate).'
          : 'Computed by the approved model.') : reason,
        result: result ? (a.id === 'soh' ? { sohPercent: effectiveSoh } : { rulCycles: effectiveRul }) : null } : a);
    dataset.rul = { currentCycle, eolThreshold: 80, predictedEOLCycle: estimatedEolCycle,
      rulCycles: effectiveRul, status: result ? 'predicted' : 'telemetry_only', method: 'ml_service' };
    dataset.status = 'processed'; dataset.processedAt = now;
    await dataset.save();
    run.status = 'completed'; run.completedAt = now;
    await run.save(); // Commit point: results are visible only for completed runs.
    await repairVehicle(run.vehicleId, run.userId);
  } catch (err) {
    const fresh = await PipelineRun.findById(run._id);
    if (fresh?.status === 'completed') {
      console.error('Analysis committed; latest vehicle pointer requires reconciliation:', err.message);
      return;
    }
    run.status = 'failed'; run.completedAt = new Date(); run.errors.push(err.message);
    for (const name of STAGES) if (run.stages[name].status === 'processing') setStage(run, name, 'failed');
    await run.save();
    await rollbackRun(run);
    const dataset = await Dataset.findById(run.datasetId);
    if (dataset) {
      dataset.status = 'failed'; dataset.processedAt = null;
      dataset.analysisReport = (dataset.analysisReport || []).map((a) => ['soh', 'rul'].includes(a.id) ? { ...a, status: 'failed', reason: err.message, result: null } : a);
      await dataset.save();
    }
  }
}
function runPipeline(id, options = {}) {
  const key = String(id);
  if (jobs.has(key)) return jobs.get(key);
  const job = execute(key, options).finally(() => { jobs.delete(key); activeRuns.delete(key); });
  jobs.set(key, job);
  return job;
}
async function drain() { await Promise.allSettled([...jobs.values()]); }
const isVehicleActive = (id) => [...activeRuns.values()].some((r) => r.vehicleId === String(id));
const isDatasetActive = (id) => [...activeRuns.values()].some((r) => r.datasetId === String(id));
module.exports = { runPipeline, drain, applyParsed, quality, isVehicleActive, isDatasetActive };
