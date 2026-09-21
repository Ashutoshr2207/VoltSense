const ApiError = require('../utils/apiError');

const REQUIRED_COLUMNS = [
  'Cycle',
  'Capacity',
  'Voltage_measured',
  'Current_measured',
  'Temperature_measured',
];

const COLUMN_ALIASES = {
  cycle: ['cycle', 'cycle_number', 'cycle_index', 'cycle_count', 'cyc', '__cycle__'],
  capacity: ['discharge_capacity', 'capacity', 'capacity_ah', 'discharge_capacity_ah', 'cap'],
  voltage: ['voltage_measured', 'mean_voltage', 'voltage', 'cell_voltage', 'pack_voltage', 'v', 'v_measured'],
  current: ['current_measured', 'mean_current', 'current', 'i', 'i_measured'],
  temperature: ['temperature_measured', 'mean_temperature', 'temperature', 'temp', 'cell_temperature', 't'],
  time: ['time', 'relative_time', 'timestamp', 'time_s', 'seconds', 'duration'],
  voltageLoad: ['voltage_load', 'load_voltage', 'v_load'],
  currentLoad: ['current_load', 'load_current', 'i_load'],
  batteryId: ['battery_id', 'battery', 'cell_id', 'cell', 'cell_name', 'batteryid'],
  type: ['type', 'operation', 'oper_type', 'operation_type'],
  dischargeDuration: ['discharge_duration', 'duration_s'],
  re: ['re', 're_ohm'],
  rct: ['rct', 'rct_ohm'],
  batteryImpedance: ['battery_impedance', 'batteryimpedance'],
  rectifiedImpedance: ['rectified_impedance', 'rectifiedimpedance'],
};

/**
 * Parses CSV lines handling potential quotes and commas.
 */
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, '_');
}

/**
 * Resolves column index for a given semantic field using alias list.
 */
function findColIndex(headers, aliases) {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    const idx = normalized.indexOf(target);
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Synchronously checks headers of the CSV buffer.
 * Accepts both legacy/strict schema and normalized NASA/Kaggle schemas.
 */
function validateHeaders(buffer) {
  if (!buffer || !buffer.length) {
    throw ApiError.badRequest('Uploaded CSV file is empty', 'VALIDATION_ERROR', {
      file: 'File contains no data',
    });
  }

  const content = buffer.toString('utf8');
  const firstLine = content.split(/\r?\n/).find((l) => l.trim().length > 0);

  if (!firstLine) {
    throw ApiError.badRequest('Uploaded CSV file has no header row', 'VALIDATION_ERROR', {
      file: 'Header row is missing',
    });
  }

  const rawHeaders = parseCsvLine(firstLine);
  const cycleIdx = findColIndex(rawHeaders, COLUMN_ALIASES.cycle);
  const capIdx = findColIndex(rawHeaders, COLUMN_ALIASES.capacity);
  const vIdx = findColIndex(rawHeaders, COLUMN_ALIASES.voltage);

  if (cycleIdx === -1) {
    throw ApiError.badRequest(
      'Missing required CSV cycle column (expected Cycle, cycle_number, or cyc)',
      'VALIDATION_ERROR',
      { expected: ['Cycle', 'cycle_number'] }
    );
  }

  if (capIdx === -1 && vIdx === -1) {
    throw ApiError.badRequest(
      'Missing required telemetry: CSV must contain either Capacity or Voltage measurements.',
      'VALIDATION_ERROR',
      { expected: ['Capacity', 'discharge_capacity', 'Voltage_measured', 'mean_voltage'] }
    );
  }

  return { rawHeaders };
}

/**
 * Ordinary Least Squares linear regression for SOH(c) = slope * c + intercept.
 */
function fitLinearRegression(cycles, sohs) {
  const n = cycles.length;
  if (n < 2) {
    return { slope: null, intercept: null, r2: null, cyclesUsed: n };
  }

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += cycles[i];
    sumY += sohs[i];
    sumXY += cycles[i] * sohs[i];
    sumXX += cycles[i] * cycles[i];
  }

  const meanX = sumX / n;
  const meanY = sumY / n;
  const denom = sumXX - n * meanX * meanX;

  if (Math.abs(denom) < 1e-12) {
    return { slope: 0, intercept: meanY, r2: 0, cyclesUsed: n };
  }

  const slope = (sumXY - n * meanX * meanY) / denom;
  const intercept = meanY - slope * meanX;

  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    const yPred = slope * cycles[i] + intercept;
    ssTot += (sohs[i] - meanY) ** 2;
    ssRes += (sohs[i] - yPred) ** 2;
  }

  const r2 = ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 1.0;

  return {
    slope: Number(slope.toFixed(4)),
    intercept: Number(intercept.toFixed(4)),
    r2: Number(r2.toFixed(4)),
    cyclesUsed: n,
  };
}

/**
 * Parses full CSV buffer into structured telemetry, multi-battery detection,
 * column stats, time-share buckets, and per-cycle degradation inputs.
 */
function parseBuffer(buffer, options = {}) {
  validateHeaders(buffer);

  const content = buffer.toString('utf8');
  const lines = content.split(/\r?\n/);
  const headerLineIndex = lines.findIndex((l) => l.trim().length > 0);
  const headers = parseCsvLine(lines[headerLineIndex]).map((h) => h.trim());

  // Map semantic columns using aliases
  const colIndices = {};
  for (const [semanticName, aliases] of Object.entries(COLUMN_ALIASES)) {
    colIndices[semanticName] = findColIndex(headers, aliases);
  }

  const getCell = (row, idx) => {
    if (idx === -1 || idx >= row.length) return null;
    const str = row[idx];
    return str !== undefined && str !== '' ? str : null;
  };

  const getNumeric = (row, idx) => {
    const val = getCell(row, idx);
    if (val === null) return null;
    const num = parseFloat(val);
    return Number.isFinite(num) ? num : null;
  };

  let duplicateRowCount = 0;
  let invalidNumericCount = 0;
  let outlierCount = 0;
  const seenLineHashes = new Set();

  const allRows = [];
  const batteryIdSet = new Set();

  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    if (seenLineHashes.has(rawLine)) {
      duplicateRowCount++;
    } else {
      seenLineHashes.add(rawLine);
    }

    const parsed = parseCsvLine(rawLine);
    if (parsed.length < Math.min(3, headers.length)) {
      invalidNumericCount++;
      continue;
    }

    const cycle = getNumeric(parsed, colIndices.cycle);
    if (cycle === null) {
      invalidNumericCount++;
      continue;
    }

    const batteryIdRaw = getCell(parsed, colIndices.batteryId);
    if (batteryIdRaw) {
      batteryIdSet.add(batteryIdRaw);
    }

    const voltage = getNumeric(parsed, colIndices.voltage);
    const current = getNumeric(parsed, colIndices.current);
    const temperature = getNumeric(parsed, colIndices.temperature);
    const capacity = getNumeric(parsed, colIndices.capacity);
    const time = getNumeric(parsed, colIndices.time);
    const vLoad = getNumeric(parsed, colIndices.voltageLoad);
    const iLoad = getNumeric(parsed, colIndices.currentLoad);
    const opType = getCell(parsed, colIndices.type);
    const dischargeDuration = getNumeric(parsed, colIndices.dischargeDuration);
    const re = getNumeric(parsed, colIndices.re);
    const rct = getNumeric(parsed, colIndices.rct);

    // Screen physical outliers if voltage/temperature exist
    if (voltage !== null && (voltage < 1.0 || voltage > 5.5)) {
      outlierCount++;
    }
    if (temperature !== null && (temperature < -30 || temperature > 90)) {
      outlierCount++;
    }

    allRows.push({
      batteryId: batteryIdRaw ? String(batteryIdRaw).trim() : null,
      cycle: Math.round(cycle),
      voltage,
      current,
      temperature,
      capacity: capacity !== null && capacity > 0.1 ? capacity : null,
      time: time !== null ? time : 0,
      vLoad,
      iLoad,
      opType: opType ? opType.toLowerCase() : null,
      dischargeDuration,
      re,
      rct,
    });
  }

  if (allRows.length === 0) {
    throw ApiError.badRequest('CSV contains header but no valid numeric data rows', 'VALIDATION_ERROR');
  }

  const availableBatteries = Array.from(batteryIdSet).sort();
  let selectedBatteryId = options.targetBatteryId || (availableBatteries.length > 0 ? availableBatteries[0] : 'NASA Battery 01');

  // Filter rows for the selected battery if multi-battery
  let rows = allRows;
  if (availableBatteries.length > 0) {
    const matchedRows = allRows.filter((r) => r.batteryId === selectedBatteryId);
    if (matchedRows.length > 0) {
      rows = matchedRows;
    } else {
      selectedBatteryId = availableBatteries[0];
      rows = allRows.filter((r) => r.batteryId === selectedBatteryId);
    }
  }

  // Filter discharge operations if 'type' column is present
  const hasTypeCol = colIndices.type !== -1;
  const dischargeRows = hasTypeCol ? rows.filter((r) => !r.opType || r.opType === 'discharge') : rows;

  // Strict sorting: cycle -> time (Requirement 2 & 6)
  dischargeRows.sort((a, b) => a.cycle - b.cycle || a.time - b.time);
  rows.sort((a, b) => a.cycle - b.cycle || a.time - b.time);

  // --- Column Statistics on Selected Battery Telemetry ---
  let vSum = 0, vMin = Infinity, vMax = -Infinity, vCount = 0;
  let cSum = 0, cMin = Infinity, cMax = -Infinity, cCount = 0;
  let tSum = 0, tMin = Infinity, tMax = -Infinity, tCount = 0;

  for (const r of rows) {
    if (r.voltage !== null) {
      vSum += r.voltage;
      if (r.voltage < vMin) vMin = r.voltage;
      if (r.voltage > vMax) vMax = r.voltage;
      vCount++;
    }
    if (r.current !== null) {
      cSum += r.current;
      if (r.current < cMin) cMin = r.current;
      if (r.current > cMax) cMax = r.current;
      cCount++;
    }
    if (r.temperature !== null) {
      tSum += r.temperature;
      if (r.temperature < tMin) tMin = r.temperature;
      if (r.temperature > tMax) tMax = r.temperature;
      tCount++;
    }
  }

  const columnStats = {
    voltage: vCount > 0 ? {
      min: Number(vMin.toFixed(3)),
      max: Number(vMax.toFixed(3)),
      mean: Number((vSum / vCount).toFixed(3)),
      range: Number((vMax - vMin).toFixed(3)),
    } : null,
    current: cCount > 0 ? {
      min: Number(cMin.toFixed(3)),
      max: Number(cMax.toFixed(3)),
      mean: Number((cSum / cCount).toFixed(3)),
      range: Number((cMax - cMin).toFixed(3)),
    } : null,
    temperature: tCount > 0 ? {
      min: Number(tMin.toFixed(1)),
      max: Number(tMax.toFixed(1)),
      mean: Number((tSum / tCount).toFixed(1)),
      range: Number((tMax - tMin).toFixed(1)),
    } : null,
  };

  // --- Operational Phase Share (NASA Convention: Current < -0.05 is discharge) ---
  let dischargeDurationSec = 0;
  let chargeDurationSec = 0;
  let restDurationSec = 0;
  let dischargeSamples = 0;
  let chargeSamples = 0;
  let restSamples = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const dt = i > 0 && rows[i - 1].cycle === r.cycle ? Math.max(0, r.time - rows[i - 1].time) : 1;

    if (r.current !== null) {
      if (r.current < -0.05) {
        dischargeDurationSec += dt;
        dischargeSamples++;
      } else if (r.current > 0.05) {
        chargeDurationSec += dt;
        chargeSamples++;
      } else {
        restDurationSec += dt;
        restSamples++;
      }
    }
  }

  const totalTime = dischargeDurationSec + chargeDurationSec + restDurationSec;
  let dischargePercent = 0, chargePercent = 0, restPercent = 0;

  const isElapsedTime = totalTime > 0 && colIndices.time !== -1 && totalTime > rows.length;
  if (isElapsedTime) {
    dischargePercent = Number(((dischargeDurationSec / totalTime) * 100).toFixed(1));
    chargePercent = Number(((chargeDurationSec / totalTime) * 100).toFixed(1));
    restPercent = Number(Math.max(0, 100 - dischargePercent - chargePercent).toFixed(1));
  } else {
    const totalSamples = dischargeSamples + chargeSamples + restSamples || rows.length;
    dischargePercent = Number(((dischargeSamples / totalSamples) * 100).toFixed(1));
    chargePercent = Number(((chargeSamples / totalSamples) * 100).toFixed(1));
    restPercent = Number(Math.max(0, 100 - dischargePercent - chargePercent).toFixed(1));
  }

  const timeShare = {
    dischargePercent,
    chargePercent,
    restPercent,
    dischargeCount: dischargeSamples,
    chargeCount: chargeSamples,
    restCount: restSamples,
    method: isElapsedTime ? 'elapsed_time' : 'observation_count',
  };

  // --- Group Rows by Cycle ---
  const cycleGroups = new Map();
  for (const r of dischargeRows) {
    if (!cycleGroups.has(r.cycle)) {
      cycleGroups.set(r.cycle, []);
    }
    cycleGroups.get(r.cycle).push(r);
  }

  const sortedCycles = Array.from(cycleGroups.keys()).sort((a, b) => a - b);
  const cycleTable = [];

  for (const cyc of sortedCycles) {
    const cRows = cycleGroups.get(cyc);

    // Identify discharge capacity
    let cap = null;
    const validCaps = cRows.map((r) => r.capacity).filter((c) => c !== null && c > 0.1);
    if (validCaps.length > 0) {
      cap = validCaps[validCaps.length - 1];
    } else {
      // Trapezoidal current integration if time exists
      if (colIndices.current !== -1 && colIndices.time !== -1 && cRows.length > 1) {
        let ah = 0;
        for (let j = 1; j < cRows.length; j++) {
          const dtSec = Math.max(0, cRows[j].time - cRows[j - 1].time);
          const iAvg = Math.abs((cRows[j].current || 0) + (cRows[j - 1].current || 0)) / 2.0;
          if (cRows[j].current < -0.05 || cRows[j - 1].current < -0.05) {
            ah += (iAvg * dtSec) / 3600.0;
          }
        }
        if (ah > 0.1) cap = ah;
      }
    }

    if (cap === null) {
      cap = 1.85; // Fallback
    }

    // Discharge duration for this cycle
    let duration = null;
    const explicitDur = cRows.find((r) => r.dischargeDuration !== null);
    if (explicitDur) {
      duration = Math.round(explicitDur.dischargeDuration);
    } else if (cRows.length > 1 && colIndices.time !== -1) {
      const activeDis = cRows.filter((r) => r.current !== null && r.current < -0.05);
      const targetRows = activeDis.length > 1 ? activeDis : cRows;
      const minT = Math.min(...targetRows.map((r) => r.time));
      const maxT = Math.max(...targetRows.map((r) => r.time));
      duration = Math.max(1, Math.round(maxT - minT));
    }

    const vVals = cRows.map((r) => r.voltage).filter((v) => v !== null);
    const iVals = cRows.map((r) => r.current).filter((i) => i !== null);
    const tVals = cRows.map((r) => r.temperature).filter((t) => t !== null);

    cycleTable.push({
      cycle: cyc,
      capacity: Number(cap.toFixed(4)),
      dischargeDuration: duration,
      meanVoltage: vVals.length > 0 ? Number((vVals.reduce((a, b) => a + b, 0) / vVals.length).toFixed(3)) : null,
      minVoltage: vVals.length > 0 ? Number(Math.min(...vVals).toFixed(3)) : null,
      maxVoltage: vVals.length > 0 ? Number(Math.max(...vVals).toFixed(3)) : null,
      meanCurrent: iVals.length > 0 ? Number((iVals.reduce((a, b) => a + b, 0) / iVals.length).toFixed(3)) : null,
      meanTemperature: tVals.length > 0 ? Number((tVals.reduce((a, b) => a + b, 0) / tVals.length).toFixed(1)) : null,
      maxTemperature: tVals.length > 0 ? Number(Math.max(...tVals).toFixed(1)) : null,
      recordCount: cRows.length,
      re: cRows[0].re,
      rct: cRows[0].rct,
    });
  }

  // --- Capacity & Empirical SOH (Requirement 4 & 5) ---
  const initCount = Math.min(3, cycleTable.length);
  const initialCapacity = initCount > 0
    ? cycleTable.slice(0, initCount).reduce((acc, c) => acc + c.capacity, 0) / initCount
    : 1.85;

  const latestCapacity = cycleTable.length > 0
    ? cycleTable[cycleTable.length - 1].capacity
    : initialCapacity;

  const empiricalSoh = initialCapacity > 0
    ? Number(Math.min(100.0, Math.max(0.0, (latestCapacity / initialCapacity) * 100.0)).toFixed(1))
    : 100.0;

  // --- Historical SOH Degradation Curve ---
  const historical = cycleTable.map((c) => ({
    cycle: c.cycle,
    soh: Number(Math.min(100.0, Math.max(0.0, (c.capacity / initialCapacity) * 100.0)).toFixed(1)),
  }));

  // --- Degradation Rate & RUL Extrapolation (Requirement 7 & 8) ---
  const cyclesArray = historical.map((h) => h.cycle);
  const sohsArray = historical.map((h) => h.soh);
  const regression = fitLinearRegression(cyclesArray, sohsArray);

  const eolThreshold = options.eolThreshold !== undefined ? Number(options.eolThreshold) : 70.0;
  const currentCycle = sortedCycles[sortedCycles.length - 1] || 1;

  let rulCycles = null;
  let estimatedEOLCycle = null;
  let rulStatus = 'insufficient_degradation_history';

  if (regression.slope !== null && regression.slope < 0 && cycleTable.length >= 3) {
    estimatedEOLCycle = Math.round((eolThreshold - regression.intercept) / regression.slope);
    if (empiricalSoh <= eolThreshold) {
      rulCycles = 0;
      rulStatus = 'eol_reached';
    } else if (estimatedEOLCycle > currentCycle) {
      rulCycles = estimatedEOLCycle - currentCycle;
      rulStatus = 'extrapolated';
    } else {
      rulCycles = 0;
      rulStatus = 'eol_reached';
    }
  } else if (empiricalSoh <= eolThreshold) {
    rulCycles = 0;
    estimatedEOLCycle = currentCycle;
    rulStatus = 'eol_reached';
  }

  // Projected trend forward to EOL threshold
  const predicted = [];
  if (rulCycles !== null && rulCycles > 0 && estimatedEOLCycle) {
    const steps = Math.min(6, Math.max(3, rulCycles));
    const stepCycles = Math.max(1, Math.round(rulCycles / steps));
    for (let s = 1; s <= steps; s++) {
      const pCyc = currentCycle + s * stepCycles;
      const pSoh = Math.max(eolThreshold, Number((empiricalSoh - (s / steps) * (empiricalSoh - eolThreshold)).toFixed(1)));
      predicted.push({ cycle: pCyc, soh: pSoh });
      if (pSoh <= eolThreshold) break;
    }
  }

  // --- Capacity Fade Share (First Half vs Second Half) (Requirement 16) ---
  let firstHalfPct = null;
  let secondHalfPct = null;

  if (cycleTable.length >= 2) {
    const midIdx = Math.floor(cycleTable.length / 2);
    const startCap = initialCapacity;
    const midCap = cycleTable[midIdx].capacity;
    const endCap = latestCapacity;
    const totalFade = startCap - endCap;

    if (totalFade > 0.001) {
      const fade1 = Math.max(0, startCap - midCap);
      const fade2 = Math.max(0, midCap - endCap);
      const sum = fade1 + fade2 || totalFade;
      firstHalfPct = Number(((fade1 / sum) * 100).toFixed(1));
      secondHalfPct = Number(Math.max(0, 100 - firstHalfPct).toFixed(1));
    }
  }

  // --- Load Step Internal Resistance Estimation (Requirement 11) ---
  let internalResistanceMOhm = null;
  const loadSteps = [];
  for (const r of rows) {
    if (r.vLoad !== null && r.iLoad !== null && r.voltage !== null && Math.abs(r.iLoad) > 0.1) {
      const rVal = (Math.abs(r.voltage - r.vLoad) / Math.abs(r.iLoad)) * 1000.0;
      if (rVal > 0 && rVal < 1000) loadSteps.push(rVal);
    }
  }
  if (loadSteps.length > 0) {
    loadSteps.sort((a, b) => a - b);
    internalResistanceMOhm = Number(loadSteps[Math.floor(loadSteps.length / 2)].toFixed(2));
  } else {
    // Check EIS Re in cycleTable
    const eisRows = cycleTable.filter((c) => c.re !== null && c.re !== undefined);
    if (eisRows.length > 0) {
      internalResistanceMOhm = Number((eisRows[eisRows.length - 1].re * 1000.0).toFixed(2));
    }
  }

  return {
    recordCount: rows.length,
    cycleCount: sortedCycles.length,
    uniqueCycles: sortedCycles,
    selectedBatteryId,
    availableBatteries,
    columnStats,
    timeShare,
    cycleTable,
    fadeShare: { firstHalfPct, secondHalfPct },
    soh: {
      empirical: empiricalSoh,
      referenceCapacityAh: Number(initialCapacity.toFixed(4)),
      currentCapacityAh: Number(latestCapacity.toFixed(4)),
      method: 'initial_discharge_capacity_ratio',
    },
    degradation: {
      slope: regression.slope,
      unit: 'percentage_points_per_cycle',
      r2: regression.r2,
      cyclesUsed: regression.cyclesUsed,
    },
    rul: {
      currentCycle,
      eolThreshold,
      predictedEOLCycle: estimatedEOLCycle,
      rulCycles,
      status: rulStatus,
      method: 'linear_degradation_extrapolation',
    },
    curves: {
      historical,
      predicted,
    },
    diagnostics: {
      internalResistanceMOhm,
      cellImbalanceMv: null,
    },
    quality: {
      validRecordCount: rows.length,
      invalidNumericCount,
      duplicateRowCount,
      outlierCount,
    },
  };
}

module.exports = {
  REQUIRED_COLUMNS,
  COLUMN_ALIASES,
  validateHeaders,
  parseBuffer,
  fitLinearRegression,
};
