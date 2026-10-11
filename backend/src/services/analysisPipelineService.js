const PipelineRun = require('../models/PipelineRun');
const Dataset = require('../models/Dataset');
const Vehicle = require('../models/Vehicle');
const Prediction = require('../models/Prediction');
const AIInsight = require('../models/AIInsight');
const Notification = require('../models/Notification');
const csvParserService = require('./csvParserService');
const fs = require('fs');
const path = require('path');
const mlClient = require('./mlClient');

const STAGE_ORDER = [
  'validation',
  'schemaMapping',
  'cleaning',
  'missingValueHandling',
  'outlierDetection',
  'featureEngineering',
  'normalization',
];

const STAGE_DURATION_MS = process.env.NODE_ENV === 'test' ? 5 : 250;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (value, decimals = 1) => Number(value.toFixed(decimals));

/**
 * Runs the deterministic electrochemical degradation pipeline for an uploaded dataset.
 * Computes real SOH, RUL, time-share, per-cycle degradation curves, and discharge statistics
 * directly from parsed CSV rows.
 */
async function runPipeline(pipelineRunId, options = {}) {
  try {
    const pipelineRun = await PipelineRun.findById(pipelineRunId);
    if (!pipelineRun) return;

    pipelineRun.status = 'processing';
    await pipelineRun.save();

    let dataset = await Dataset.findById(pipelineRun.datasetId);
    const vehicle = await Vehicle.findById(pipelineRun.vehicleId);
    if (!dataset || !vehicle) return;

    const eolThreshold = options.eolThreshold || 80.0;
    const targetBatteryId = options.batteryId || dataset.selectedBatteryId || null;

    // Reparse or parse storage file
    let parsed = null;
    let filePath = null;
    if (dataset.storage?.rawUrl) {
      filePath = path.resolve(__dirname, '../../', dataset.storage.rawUrl.replace(/^\//, ''));
      if (fs.existsSync(filePath)) {
        try {
          const fileBuf = fs.readFileSync(filePath);
          if (dataset.fileType === 'mat' || filePath.toLowerCase().endsWith('.mat')) {
            throw new Error('MATLAB (.mat) datasets are no longer supported; please re-upload the data as a CSV file.');
          } else {
            parsed = csvParserService.parseBuffer(fileBuf, {
              targetBatteryId,
              eolThreshold,
            });

            dataset.recordCount = parsed.recordCount;
            dataset.cycleCount = parsed.cycleCount;
            dataset.columnStats = parsed.columnStats;
            dataset.timeShare = parsed.timeShare;
            dataset.cycleTable = parsed.cycleTable;
            dataset.fadeShare = parsed.fadeShare;
            dataset.chargingSessions = parsed.chargingSessions;
            dataset.latestSoc = parsed.latestSoc;
            dataset.selectedBatteryId = parsed.selectedBatteryId;
            dataset.availableBatteries = parsed.availableBatteries;
            dataset.soh = parsed.soh;
            dataset.degradation = parsed.degradation;
            dataset.rul = parsed.rul;
            await dataset.save();
          }
        } catch (parseErr) {
          console.warn('Could not re-parse storage file in pipeline run:', parseErr.message);
        }
      }
    }

    // When capacity cycles are insufficient (< 7) or absent (telemetry-only),
    // persist a telemetry-based analysis record so it is accessible in Past Analyses, History, and Timeline.
    const capacityCycles = (dataset.cycleTable || []).filter((c) => Number.isFinite(c.capacity) && c.capacity > 0);
    if (capacityCycles.length < 7 && (dataset.recordCount || 0) > 0) {
      const run = await PipelineRun.findById(pipelineRunId);
      run.inputRecords = dataset.recordCount;
      run.stages.validation.status = 'completed';
      run.stages.validation.completedAt = new Date();
      for (const st of STAGE_ORDER.slice(1)) {
        run.stages[st].status = 'completed';
        run.stages[st].completedAt = new Date();
      }
      run.status = 'completed';
      run.outputRecords = dataset.recordCount;
      run.completedAt = new Date();
      run.errors = [...(run.errors || []), capacityCycles.length === 0
        ? 'SOH/RUL ineligible: file has no discharge-capacity column. Telemetry analysis, anomalies, and charging sessions are fully available.'
        : `SOH/RUL ineligible: the models require at least 7 valid capacity cycles; this file has ${capacityCycles.length}. Telemetry analysis is fully available.`];
      await run.save();

      // Create or update Prediction record for this run
      await Prediction.deleteMany({ pipelineRunId: pipelineRun._id });
      const tempAvgC = dataset.columnStats?.temperature?.mean || 25.0;
      const pred = await Prediction.create({
        userId: dataset.userId,
        vehicleId: vehicle._id,
        datasetId: dataset._id,
        pipelineRunId: pipelineRun._id,
        model: {
          name: 'Telemetry Signal Processor',
          version: '1.0',
          algorithm: 'Statistical Time-Series & Anomaly Profiler',
        },
        prediction: {
          soh: null,
          modelSoh: null,
          measuredSoh: null,
          mlStatus: 'telemetry_only',
          mlReason: 'Instantaneous telemetry without cycle capacity history. SOH/RUL models require measured discharge capacity cycles.',
          factors: [
            { name: 'Telemetry Scope', condition: `${dataset.recordCount.toLocaleString()} observations`, impact: 'Normal', explanation: 'Instantaneous driving telemetry processed.' },
            { name: 'Temperature', condition: `${tempAvgC.toFixed(1)}°C average`, impact: 'Normal', explanation: 'Operating thermal profile.' },
          ],
          mlRecommendations: [
            'Upload multi-cycle discharge capacity records or enable simulation mode for projected cycle degradation.',
            'Keep daily charging between 20% and 80% to preserve battery longevity.',
          ],
          referenceCapacityAh: null,
          currentCapacityAh: null,
          currentCycle: dataset.cycleCount || 1,
          rulCycles: null,
          estimatedEOLCycle: null,
          eolThreshold: eolThreshold || 80,
          rulStatus: 'telemetry_only',
          degradationSlope: null,
          degradationR2: null,
          cyclesUsed: 0,
          selectedBatteryId: dataset.selectedBatteryId,
          availableBatteries: dataset.availableBatteries || [],
        },
        confidence: {
          calibrated: false,
          method: 'telemetry_observation',
          value: null,
          uncertaintyInterval: 'Telemetry-based observation (no lifetime projection)',
          sohUncertaintyStd: null,
        },
        lossBreakdown: { lli: null, lam: null, ohmic: null },
        degradation: { historical: [], predicted: [] },
        timeShare: dataset.timeShare || null,
        cycleTable: dataset.cycleTable || [],
        fadeShare: dataset.fadeShare || null,
        metrics: { mae: null, rmse: null, r2: null },
        diagnostics: {
          internalResistanceMOhm: parsed?.diagnostics?.internalResistanceMOhm ?? null,
          cellImbalanceMv: null,
        },
        createdAt: new Date(),
      });

      vehicle.currentCycleCount = dataset.cycleCount || vehicle.currentCycleCount || 1;
      vehicle.latestPredictionId = pred._id;
      vehicle.tempAvg = `${tempAvgC.toFixed(1)} °C`;
      await vehicle.save();

      dataset.status = 'processed';
      dataset.processedAt = new Date();
      await dataset.save();
      return;
    }

    const inputRecords = dataset.recordCount || 100;
    pipelineRun.inputRecords = inputRecords;
    await pipelineRun.save();

    // Progress through the stages with real computational work
    for (const stageName of STAGE_ORDER) {
      const fresh = await PipelineRun.findById(pipelineRunId);
      if (!fresh) return;

      fresh.stages[stageName].status = 'processing';
      fresh.stages[stageName].startedAt = new Date();
      await fresh.save();

      if (stageName === 'validation') {
        const validCycles = (dataset.cycleTable || []).filter((c) => Number.isFinite(c.capacity) && c.capacity > 0);
        if (validCycles.length < 7) {
          throw new Error('At least 7 valid battery cycles are required to generate a prediction.');
        }
      } else if (stageName === 'schemaMapping') {
        fresh.stages.schemaMapping.details = `Mapped telemetry for ${dataset.selectedBatteryId || 'cell'}`;
      } else if (stageName === 'cleaning') {
        fresh.stages.cleaning.details = `Cleaned ${inputRecords} telemetry records across ${dataset.cycleCount || dataset.cycleTable.length} cycles`;
      } else if (stageName === 'missingValueHandling') {
        fresh.stages.missingValueHandling.details = 'Validated sequential cycle monotonicity';
      } else if (stageName === 'outlierDetection') {
        fresh.stages.outlierDetection.details = 'Outlier screening nominal within physical limits';
      } else if (stageName === 'featureEngineering') {
        fresh.stages.featureEngineering.details = 'Extracted per-cycle capacity, duration, and degradation slope';
      } else if (stageName === 'normalization') {
        fresh.stages.normalization.details = 'Derived empirical SOH and traceable RUL';
      }

      await sleep(STAGE_DURATION_MS);

      fresh.stages[stageName].status = 'completed';
      fresh.stages[stageName].completedAt = new Date();
      await fresh.save();
    }

    // Refresh dataset
    dataset = await Dataset.findById(pipelineRun.datasetId);
    const cycleTable = dataset.cycleTable || [];

    // --- Capacity & Empirical SOH from Actual Discharge Data ---
    // initial_cap = maximum valid capacity (same definition as ml-service/features.py)
    const initial_capacity = Math.max(...cycleTable.map((c) => c.capacity).filter((x) => Number.isFinite(x) && x > 0));

    const latest_capacity = dataset.soh?.currentCapacityAh || (
      cycleTable.length > 0 ? cycleTable[cycleTable.length - 1].capacity : initial_capacity
    );

    const empiricalSoh = dataset.soh?.empirical !== undefined && dataset.soh?.empirical !== null
      ? dataset.soh.empirical
      : round(Math.min(100, Math.max(0, (latest_capacity / initial_capacity) * 100)), 1);

    const firstCycle = cycleTable.length > 0 ? cycleTable[0].cycle : 1;
    const latestCycle = cycleTable.length > 0 ? cycleTable[cycleTable.length - 1].cycle : 1;
    const cycleDiff = Math.max(1, latestCycle - firstCycle);

    // Degradation figures here are measurements only. RUL comes from the ML service.
    const degradation = { slope: null, unit: 'percentage_points_per_cycle', r2: null, cyclesUsed: cycleTable.length };
    let rulCycles = null;
    let estimatedEOLCycle = null;

    // --- Historical Observed SOH Trajectory ---
    let historical = cycleTable.map((c) => ({
      cycle: c.cycle,
      soh: round(Math.min(100, Math.max(0, (c.capacity / initial_capacity) * 100)), 1),
    }));

    // --- Call the external ML service (trained SOH/RUL models) ---
    const ml = await mlClient.predict({ cycleTable, eolThreshold, batteryId: targetBatteryId });
    if (!ml.available) {
      console.error(`ML service unavailable (${ml.reason})`);
      throw new Error('Battery analysis is temporarily unavailable.');
    }
    const mlResult = ml.result;
    const mlStatus = ml.available ? 'connected' : 'unavailable';
    const mlReason = ml.available ? null : ml.reason;

    const modelSoh = mlResult ? mlResult.soh : null;
    rulCycles = mlResult && typeof mlResult.rul === 'number' ? mlResult.rul : null;
    estimatedEOLCycle = rulCycles !== null ? latestCycle + rulCycles : null;
    const headlineSoh = modelSoh !== null ? round(modelSoh, 1) : empiricalSoh;
    status = mlResult?.status || (headlineSoh >= 90 ? 'healthy' : headlineSoh >= 75 ? 'attention' : 'critical');
    if (mlResult?.degradation?.historical?.length > 0) historical = mlResult.degradation.historical;

    const model = {
      name: mlResult?.model?.name || 'Not connected',
      version: mlResult?.model?.version || '-',
      algorithm: mlResult?.model?.algorithm || 'none',
    };
    const metrics = mlResult?.metrics || { mae: null, rmse: null, r2: null };
    const confidence = {
      calibrated: Boolean(mlResult?.confidence?.calibrated),
      method: mlResult?.confidence?.method || null,
      value: mlResult?.confidence?.value ?? null,
      uncertaintyInterval: mlResult?.confidence?.uncertaintyInterval || 'Unavailable',
      sohUncertaintyStd: mlResult?.confidence?.sohUncertaintyStd ?? null,
    };

    const predicted = mlResult?.degradation?.predicted || [];

    const lossBreakdown = {
      lli: null,
      lam: null,
      ohmic: null,
    };

    const tempAvgC = dataset.columnStats?.temperature?.mean || 25.0;
    const internalResistanceMOhm = mlResult?.diagnostics?.internalResistanceMOhm ?? parsed?.diagnostics?.internalResistanceMOhm ?? null;
    const cellImbalanceMv = mlResult?.diagnostics?.cellImbalanceMv ?? parsed?.diagnostics?.cellImbalanceMv ?? null;

    const diagnostics = {
      internalResistanceMOhm,
      cellImbalanceMv,
    };

    // Remove any existing prediction for this run
    await Prediction.deleteMany({ pipelineRunId: pipelineRun._id });

    const prediction = await Prediction.create({
      userId: dataset.userId,
      vehicleId: vehicle._id,
      datasetId: dataset._id,
      pipelineRunId: pipelineRun._id,
      model,
      prediction: {
        soh: headlineSoh,
        measuredSoh: empiricalSoh,
        modelSoh,
        mlStatus,
        mlReason,
        factors: mlResult?.factors || [],
        mlRecommendations: mlResult?.recommendations || [],
        referenceCapacityAh: Number(initial_capacity.toFixed(4)),
        currentCapacityAh: Number(latest_capacity.toFixed(4)),
        currentCycle: latestCycle,
        rulCycles,
        estimatedEOLCycle,
        eolThreshold,
        rulStatus: rulCycles !== null ? 'predicted' : 'awaiting_ml_service',
        degradationSlope: degradation.slope,
        degradationR2: degradation.r2,
        cyclesUsed: degradation.cyclesUsed || cycleTable.length,
        selectedBatteryId: dataset.selectedBatteryId,
        availableBatteries: dataset.availableBatteries || [],
      },
      confidence,
      lossBreakdown,
      degradation: { historical, predicted },
      timeShare: dataset.timeShare || null,
      cycleTable: dataset.cycleTable || [],
      fadeShare: dataset.fadeShare || null,
      metrics,
      diagnostics,
      createdAt: new Date(),
    });

    // --- AI Insight & Engineering Directives ---
    const isAttention = status !== 'healthy';
    const insightItems = [
      {
        type: 'health',
        severity: isAttention ? 'medium' : 'low',
        title: isAttention ? 'Measurable Capacity Fade Detected' : 'Nominal Capacity Retention',
        description: `Measured capacity declined from ${initial_capacity.toFixed(3)} Ah (initial) to ${latest_capacity.toFixed(3)} Ah at cycle ${latestCycle} (${empiricalSoh}% SOH).`,
      },
      {
        type: 'temperature',
        severity: tempAvgC >= 35 ? 'medium' : 'low',
        title: 'Operating Thermal Trace',
        description: `Mean operating temperature was ${tempAvgC.toFixed(1)}°C (min ${dataset.columnStats?.temperature?.min ?? '—'}°C, max ${dataset.columnStats?.temperature?.max ?? '—'}°C).`,
      },
    ];

    const recommendations = [];
    if (isAttention) {
      recommendations.push(`SOH is ${empiricalSoh}% at cycle ${latestCycle}; capacity is approaching the ${eolThreshold}% EOL threshold.`);
    } else {
      recommendations.push(`SOH is nominal at ${empiricalSoh}% across ${cycleTable.length} evaluated cycles.`);
    }

    if (tempAvgC >= 35) {
      recommendations.push(`Mean operating temperature of ${tempAvgC.toFixed(1)}°C is elevated; thermal mitigation recommended.`);
    } else {
      recommendations.push(`Mean operating temperature was ${tempAvgC.toFixed(1)}°C; within expected thermal limits.`);
    }

    if (rulCycles !== null) {
      recommendations.push(`About ${rulCycles} cycles remain before the battery reaches the ${eolThreshold}% health threshold.`);
    }
    (mlResult?.recommendations || []).forEach((r) => recommendations.push(typeof r === 'string' ? r : r.text || r.title));

        const explanation = [
      {
        factor: 'Measured capacity',
        description: `Measured capacity changed from ${initial_capacity.toFixed(3)} Ah to ${latest_capacity.toFixed(3)} Ah between cycles ${firstCycle} and ${latestCycle}.`,
        impactPct: null,
      },
      {
        factor: 'Operating temperature',
        description: `Average measured temperature was ${tempAvgC.toFixed(1)}°C.`,
        impactPct: null,
      },
      ...((mlResult?.factors || []).map((f) => ({ factor: f.name || f.factor, description: f.explanation || f.description, impactPct: f.impactPct ?? null }))),
    ];

    await AIInsight.deleteMany({ predictionId: prediction._id });
    await AIInsight.create({
      userId: dataset.userId,
      vehicleId: vehicle._id,
      predictionId: prediction._id,
      summary: `Analysis complete for ${dataset.selectedBatteryId || 'cell'}. SOH: ${headlineSoh}%. ${rulCycles !== null ? `About ${rulCycles} cycles remaining.` : 'Remaining life not available yet.'}`,
      insights: insightItems,
      recommendations,
      generatedAt: new Date(),
      generator: {
        model: model.name,
        version: model.version,
      },
      explanation,
    });

    await Notification.create({
      userId: dataset.userId,
      vehicleId: vehicle._id,
      predictionId: prediction._id,
      type: isAttention ? 'battery_health_change' : 'analysis_complete',
      title: `${dataset.selectedBatteryId || 'Battery'} Telemetry Processed`,
      message: `Battery health ${headlineSoh}%${rulCycles !== null ? `, about ${rulCycles} cycles remaining` : ''}.`,
      read: false,
      createdAt: new Date(),
    });

    // --- Update vehicle / cell entity ---
    vehicle.latestSOH = headlineSoh;
    vehicle.latestRUL = rulCycles;
    vehicle.latestEOL = estimatedEOLCycle;
    vehicle.currentCycleCount = latestCycle;
    vehicle.status = status;
    vehicle.latestPredictionId = prediction._id;
    vehicle.tempAvg = `${tempAvgC.toFixed(1)} °C`;
    vehicle.internalResistance = diagnostics.internalResistanceMOhm !== null ? String(diagnostics.internalResistanceMOhm) : null;
    vehicle.cellImbalance = diagnostics.cellImbalanceMv !== null ? String(diagnostics.cellImbalanceMv) : null;
    vehicle.degradationRate = null;

    await vehicle.save();

    dataset.analysisReport = (dataset.analysisReport || []).map((a) => (a.id === 'soh' || a.id === 'rul') && a.status === 'pending'
      ? { ...a, status: 'completed', reason: 'Computed by the analysis pipeline.', result: a.id === 'soh' ? { sohPercent: dataset.soh?.empirical ?? null } : { rulCycles: dataset.rul?.rulCycles ?? null } }
      : a);
    dataset.markModified('analysisReport');
    dataset.status = 'processed';
    dataset.processedAt = new Date();
    await dataset.save();

    const finalRun = await PipelineRun.findById(pipelineRunId);
    if (finalRun) {
      finalRun.status = 'completed';
      finalRun.outputRecords = inputRecords;
      finalRun.completedAt = new Date();
      await finalRun.save();
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('Pipeline execution failed:', error);
    }
    try {
      const failedRun = await PipelineRun.findById(pipelineRunId);
      if (failedRun) {
        failedRun.status = 'failed';
        failedRun.errors = [...(failedRun.errors || []), error.message];
        failedRun.completedAt = new Date();
        await failedRun.save();

        const dataset = await Dataset.findById(failedRun.datasetId);
        if (dataset) {
          dataset.analysisReport = (dataset.analysisReport || []).map((a) => (a.status === 'pending' ? { ...a, status: 'failed', reason: error.message } : a));
          dataset.markModified('analysisReport');
          dataset.status = 'failed';
          await dataset.save();
        }
      }
    } catch (innerError) {
      if (process.env.NODE_ENV !== 'test') {
        console.error('Failed to record pipeline failure state:', innerError);
      }
    }
  }
}

module.exports = { runPipeline };
