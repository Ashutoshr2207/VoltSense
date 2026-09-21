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
  return new Date(dateInput).toLocaleDateString("en-US", {
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
export function mapVehicle(apiVehicle) {
  if (!apiVehicle) return null;

  const chemistry = apiVehicle.batteryVariant
    ? apiVehicle.batteryVariant
    : apiVehicle.batteryCapacityKWh
    ? `${apiVehicle.batteryCapacityKWh} kWh`
    : "—";

  return {
    id: apiVehicle.id,
    name: apiVehicle.nickname || `${apiVehicle.manufacturer} ${apiVehicle.model}`.trim(),
    manufacturer: apiVehicle.manufacturer,
    model: apiVehicle.model,
    year: apiVehicle.year ?? "—",
    trim: apiVehicle.trim || apiVehicle.batteryVariant || "—",
    chemistry,
    capacityKWh: apiVehicle.batteryCapacityKWh || 60,
    cellType: apiVehicle.cellType || "—",
    vin: apiVehicle.vin || "—",
    status: capitalizeStatus(apiVehicle.status),
    soh: apiVehicle.latestSOH ?? 0,
    eolThreshold: 70.0,
    cycles: apiVehicle.currentCycleCount ?? 0,
    rul: apiVehicle.latestRUL !== undefined && apiVehicle.latestRUL !== null ? apiVehicle.latestRUL : 0,
    estimatedEOLCycle: typeof apiVehicle.latestEOL === 'number' ? apiVehicle.latestEOL : null,
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

    // Truthful NASA/synthetic telemetry bindings
    merged.empiricalSoh = prediction.prediction?.soh ?? merged.soh;
    merged.modelSoh = prediction.prediction?.modelSoh ?? null;
    merged.referenceCapacityAh = prediction.prediction?.referenceCapacityAh ?? null;
    merged.currentCapacityAh = prediction.prediction?.currentCapacityAh ?? null;
    merged.degradationSlope = prediction.prediction?.degradationSlope ?? null;
    merged.degradationR2 = prediction.prediction?.degradationR2 ?? null;
    merged.cyclesUsed = prediction.prediction?.cyclesUsed ?? null;
    merged.rulStatus = prediction.prediction?.rulStatus ?? null;
    merged.selectedBatteryId = prediction.prediction?.selectedBatteryId || null;
    merged.availableBatteries = prediction.prediction?.availableBatteries || [];
    merged.eolThreshold = prediction.prediction?.eolThreshold || 70.0;
    merged.estimatedEOLCycle = typeof prediction.prediction?.estimatedEOLCycle === 'number'
      ? prediction.prediction.estimatedEOLCycle
      : (typeof merged.rul === 'number' && typeof merged.cycles === 'number' ? merged.cycles + merged.rul : null);
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

    const isSyn = (dataset.originalFileName && dataset.originalFileName.toLowerCase().includes('synthetic')) ||
      dataset.sourceType === 'synthetic_dataset';
    merged.isSynthetic = isSyn;
    merged.datasetSourceLabel = isSyn ? 'Synthetic Test Data' : 'NASA Battery Experimental Data';
    merged.datasetSourceDetail = isSyn ? 'Synthetic Benchmark (320 rows)' : 'NASA Battery Experimental Data';
  }

  return merged;
}

/**
 * Maps a backend Prediction document into a truthful Prediction History table row.
 * Reflects actual observed SOH, cycle count, model algorithm, and run timestamp.
 */
export function mapPredictionRow(prediction, vehicle) {
  const soh = prediction.prediction?.soh ?? 0;
  const currentCycle = prediction.prediction?.currentCycle ?? (prediction.cycleTable?.length || 1);
  const rulCycles = prediction.prediction?.rulCycles !== null && prediction.prediction?.rulCycles !== undefined
    ? prediction.prediction.rulCycles
    : '—';

  return {
    id: prediction.id,
    timestampRaw: prediction.createdAt || null,
    timestamp: formatTimestampIST(prediction.createdAt),
    vehicleId: prediction.vehicleId,
    vehicleName: vehicle ? vehicle.name : "Unknown Vehicle",
    vin: vehicle ? vehicle.vin : "—",
    modelVersion: prediction.model ? `${prediction.model.name}` : "Telemetry-Derived Baseline",
    algorithm: prediction.model?.algorithm || "Linear Degradation Projection",
    measuredSoh: soh,
    currentCycle,
    rulCycles: typeof rulCycles === 'number' ? `${rulCycles} cyc` : rulCycles,
    status: soh >= 90 ? "Healthy" : soh >= 75 ? "Attention" : "Critical",
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
