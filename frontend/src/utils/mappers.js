// Maps raw backend entities (per docs/frontend-backend-contract.md) into the
// view-model shapes the existing page components were built against, so the
// pages themselves need minimal changes.

export function formatRelativeTime(dateInput) {
  if (!dateInput) return "—";
  const date = new Date(dateInput);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));

  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

export function formatReportDate(dateInput) {
  if (!dateInput) return "—";
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return typeof dateInput === "string" ? dateInput : "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function formatTimestampIST(dateInput) {
  if (!dateInput) return "—";
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce((values, part) => ({ ...values, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} IST`;
}

export function formatDateIST(dateInput) {
  if (!dateInput || Number.isNaN(new Date(dateInput).getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "2-digit", day: "2-digit" }).format(new Date(dateInput));
}

function capitalizeStatus(status) {
  if (!status) return "Attention";
  return status.toLowerCase() === "healthy" ? "Healthy" : "Attention";
}

/**
 * Maps a backend Vehicle document into the shape the UI pages read
 * (name, trim, chemistry, vin, soh, cycles, rul, etc). Optionally merges in
 * richer detail once a latest Prediction / AIInsight has been fetched for
 * this vehicle (see mergeVehicleDetail below).
 */
function getStoredEolThreshold() {
  if (typeof window === 'undefined') return 80.0;
  const stored = localStorage.getItem('vs_eol_threshold');
  const val = Number(stored);
  return !isNaN(val) && val >= 50 && val <= 95 ? val : 80.0;
}

export function mapVehicle(apiVehicle) {
  if (!apiVehicle) return null;

  const chemistry = apiVehicle.batteryVariant
    ? apiVehicle.batteryVariant
    : apiVehicle.batteryCapacityKWh
    ? `${apiVehicle.batteryCapacityKWh} kWh`
    : "—";

  const customEol = getStoredEolThreshold();
  const rawRul = typeof apiVehicle.latestRUL === 'number' ? apiVehicle.latestRUL : null;
  const rawEol = typeof apiVehicle.latestEOL === 'number' ? apiVehicle.latestEOL : null;
  let mappedRul = rawRul;
  let mappedEol = rawEol;
  if (typeof rawRul === 'number' && typeof apiVehicle.latestSOH === 'number' && customEol !== 80.0) {
    if (apiVehicle.latestSOH <= customEol) {
      mappedRul = 0;
      if (typeof apiVehicle.currentCycleCount === 'number') mappedEol = apiVehicle.currentCycleCount;
    } else {
      const baseDelta = Math.max(0.5, apiVehicle.latestSOH - 80.0);
      const customDelta = Math.max(0.5, apiVehicle.latestSOH - customEol);
      mappedRul = Math.max(0, Math.round(rawRul * (customDelta / baseDelta)));
      if (typeof apiVehicle.currentCycleCount === 'number') mappedEol = apiVehicle.currentCycleCount + mappedRul;
    }
  }

  return {
    id: apiVehicle.id,
    name: apiVehicle.nickname || `${apiVehicle.manufacturer} ${apiVehicle.model}`.trim(),
    manufacturer: apiVehicle.manufacturer,
    model: apiVehicle.model,
    year: apiVehicle.year ?? "—",
    trim: apiVehicle.trim || apiVehicle.batteryVariant || "—",
    chemistry,
    capacityKWh: apiVehicle.batteryCapacityKWh || null,
    cellType: apiVehicle.cellType || "—",
    vin: apiVehicle.vin || "—",
    status: capitalizeStatus(apiVehicle.status),
    soh: apiVehicle.latestSOH ?? null,
    eolThreshold: customEol,
    cycles: apiVehicle.currentCycleCount ?? null,
    baseRul: rawRul,
    rul: mappedRul,
    estimatedEOLCycle: mappedEol,
    packVoltage: apiVehicle.packVoltage || "—",
    internalResistance: apiVehicle.internalResistance || "—",
    cellImbalance: apiVehicle.cellImbalance || "—",
    tempAvg: apiVehicle.tempAvg || "—",
    lastBatch: formatRelativeTime(apiVehicle.updatedAt),
    degradationRate: apiVehicle.degradationRate || "—",
    lastReportDate: formatReportDate(apiVehicle.updatedAt),
    reportId: `VS-${(apiVehicle.latestPredictionId || apiVehicle.id || "").slice(-6).toUpperCase()}`,
    recordsCount: 0,
    latestPredictionId: apiVehicle.latestPredictionId || null,
    lossBreakdown: { lli: null, lam: null, ohmic: null },
    recommendations: [],
    explanation: [],
    timeShare: null,
    cycleTable: [],
    fadeShare: null,
    hasAnalysis: Boolean(apiVehicle.latestPredictionId)
  };
}

/**
 * Merges the richer per-report detail (loss breakdown, recommendations,
 * degradation curve, report metadata) fetched for the currently viewed
 * vehicle into its mapped view-model.
 */
export function mergeVehicleDetail(vehicleViewModel, { prediction, insight, dataset } = {}) {
  if (!vehicleViewModel) return vehicleViewModel;

  const merged = { ...vehicleViewModel };

  if (prediction) {
    merged.lossBreakdown = prediction.lossBreakdown || merged.lossBreakdown;
    merged.degradation = prediction.degradation || null;
    merged.metrics = prediction.metrics || null;
    merged.internalResistance = prediction.diagnostics?.internalResistanceMOhm ?? merged.internalResistance;
    merged.cellImbalance = prediction.diagnostics?.cellImbalanceMv ?? merged.cellImbalance;
    merged.confidence = prediction.confidence || null;
    merged.timeShare = prediction.timeShare || merged.timeShare || null;
    merged.cycleTable = prediction.cycleTable || merged.cycleTable || [];
    merged.fadeShare = prediction.fadeShare || merged.fadeShare || null;
    merged.lastReportDate = formatReportDate(prediction.createdAt);
    merged.reportId = `VS-${(prediction.id || "").slice(-6).toUpperCase()}`;
    merged.modelVersion = prediction.model
      ? `${prediction.model.name} ${prediction.model.version}`
      : merged.modelVersion;

    // Measured telemetry bindings
    merged.empiricalSoh = prediction.prediction?.measuredSoh ?? null;
    merged.modelSoh = prediction.prediction?.modelSoh ?? null;
    merged.referenceCapacityAh = prediction.prediction?.referenceCapacityAh ?? null;
    merged.currentCapacityAh = prediction.prediction?.currentCapacityAh ?? null;
    merged.degradationSlope = prediction.prediction?.degradationSlope ?? null;
    merged.degradationR2 = prediction.prediction?.degradationR2 ?? null;
    merged.cyclesUsed = prediction.prediction?.cyclesUsed ?? null;
    merged.rulStatus = prediction.prediction?.rulStatus ?? null;
    merged.mlStatus = prediction.prediction?.mlStatus ?? 'unavailable';
    merged.mlReason = prediction.prediction?.mlReason ?? null;
    merged.isExperimental = Boolean(
      prediction.prediction?.isExperimental ||
      prediction.prediction?.mlReason?.toLowerCase().includes('experimental') ||
      prediction.model?.experimental ||
      prediction.model?.version?.includes('candidate')
    );
    merged.measuredSoh = prediction.prediction?.measuredSoh ?? null;
    merged.measurementDate = prediction.measurementDate || prediction.prediction?.measurementDate || null;
    merged.factors = prediction.prediction?.factors || [];
    merged.analysisAt = prediction.createdAt || null;
    merged.selectedBatteryId = prediction.prediction?.selectedBatteryId || null;
    merged.availableBatteries = prediction.prediction?.availableBatteries || [];
    // Always resolve the invariant baseline RUL (never mutate or compound on previous merged.rul)
    const baseRul = typeof prediction.prediction?.rulCycles === 'number'
      ? prediction.prediction.rulCycles
      : (typeof prediction.prediction?.rul === 'number'
          ? prediction.prediction.rul
          : (typeof vehicleViewModel.baseRul === 'number' ? vehicleViewModel.baseRul : null));

    merged.baseRul = baseRul;
    merged.eolThreshold = getStoredEolThreshold() || prediction.prediction?.eolThreshold || 80.0;

    const customEolVal = merged.eolThreshold;
    const baseEolVal = prediction.prediction?.eolThreshold || 80.0;
    const sohVal = merged.soh ?? prediction.prediction?.soh;

    if (typeof baseRul === 'number' && typeof sohVal === 'number' && customEolVal !== baseEolVal) {
      if (sohVal <= customEolVal) {
        merged.rul = 0;
        if (typeof merged.cycles === 'number') merged.estimatedEOLCycle = merged.cycles;
      } else {
        const baseDelta = Math.max(0.5, sohVal - baseEolVal);
        const customDelta = Math.max(0.5, sohVal - customEolVal);
        const scaledRul = Math.max(0, Math.round(baseRul * (customDelta / baseDelta)));
        merged.rul = scaledRul;
        if (typeof merged.cycles === 'number') {
          merged.estimatedEOLCycle = merged.cycles + scaledRul;
        }
      }
    } else {
      merged.rul = baseRul !== null ? baseRul : vehicleViewModel.rul;
      merged.estimatedEOLCycle = typeof prediction.prediction?.estimatedEOLCycle === 'number'
        ? prediction.prediction.estimatedEOLCycle
        : (typeof merged.rul === 'number' && typeof merged.cycles === 'number' ? merged.cycles + merged.rul : null);
    }
    if (prediction.prediction?.degradationSlope !== undefined && prediction.prediction?.degradationSlope !== null) {
      merged.degradationRate = `${prediction.prediction.degradationSlope.toFixed(2)} pp/cyc`;
    }
  }

  if (insight) {
    merged.recommendations = insight.recommendations && insight.recommendations.length
      ? insight.recommendations
      : merged.recommendations;
    merged.explanation = insight.explanation || [];
  }

  if (dataset) {
    merged.recordsCount = dataset.recordCount || 0;
    merged.chargingSessions = dataset.chargingSessions || [];
    merged.soc = typeof dataset.latestSoc === 'number' ? dataset.latestSoc : null;
    merged.telemetryStats = dataset.columnStats || null;
    merged.datasetCycleCount = dataset.cycleCount || 0;
    merged.datasetFileName = dataset.originalFileName || "bms_telemetry.csv";
    if (!merged.timeShare && dataset.timeShare) merged.timeShare = dataset.timeShare;
    if ((!merged.cycleTable || merged.cycleTable.length === 0) && dataset.cycleTable) {
      merged.cycleTable = dataset.cycleTable;
    }
    if (!merged.fadeShare && dataset.fadeShare) merged.fadeShare = dataset.fadeShare;
    if (!merged.selectedBatteryId && dataset.selectedBatteryId) {
      merged.selectedBatteryId = dataset.selectedBatteryId;
    }
    if ((!merged.availableBatteries || merged.availableBatteries.length === 0) && dataset.availableBatteries) {
      merged.availableBatteries = dataset.availableBatteries;
    }

    const isDemo = dataset.sourceType === 'demo_dataset' || dataset.sourceType === 'synthetic_dataset';
    merged.isSynthetic = isDemo;
    merged.datasetSourceLabel = isDemo ? 'Demo data' : 'Uploaded file';
    merged.datasetSourceDetail = dataset.originalFileName || '';
    merged.datasetUploadedAt = dataset.uploadedAt || null;
  }

  return merged;
}

/**
 * Maps a backend Prediction document into a truthful Prediction History table row.
 * Reflects actual observed SOH, cycle count, model algorithm, and run timestamp.
 */
export function mapPredictionRow(prediction, vehicle) {
  const soh = prediction.prediction?.soh ?? null;
  const currentCycle = prediction.prediction?.currentCycle ?? (prediction.cycleTable?.length || 1);
  const rulCycles = prediction.prediction?.rulCycles !== null && prediction.prediction?.rulCycles !== undefined
    ? prediction.prediction.rulCycles
    : '—';

  const measurementDate = prediction.measurementDate || prediction.prediction?.measurementDate || null;

  return {
    id: prediction.id,
    measurementDate,
    uploadTimestampRaw: prediction.createdAt || null,
    uploadTimestamp: formatTimestampIST(prediction.createdAt),
    timestampRaw: measurementDate || prediction.createdAt || null,
    timestamp: measurementDate ? formatReportDate(measurementDate) : formatTimestampIST(prediction.createdAt),
    vehicleId: prediction.vehicleId,
    vehicleName: vehicle ? vehicle.name : "Unknown Vehicle",
    vin: vehicle ? vehicle.vin : "—",
    mlStatus: prediction.prediction?.mlStatus || 'unavailable',
    datasetId: prediction.datasetId,
    measuredSoh: prediction.prediction?.measuredSoh ?? null,
    soh,
    currentCycle,
    currentCapacityAh: prediction.prediction?.currentCapacityAh ?? null,
    rulCycles: typeof prediction.prediction?.rulCycles === 'number' ? prediction.prediction.rulCycles : null,
    status: soh === null ? "Unknown" : soh >= 90 ? "Healthy" : soh >= 80 ? "Attention" : "Critical",
  };
}

export function mapNotification(notification) {
  return {
    id: notification.id,
    title: notification.title,
    message: notification.message,
    read: notification.read,
    type: notification.type,
    vehicleId: notification.vehicleId,
    createdAt: notification.createdAt,
    relativeTime: formatRelativeTime(notification.createdAt)
  };
}
