const ApiError = require('../utils/apiError');
const fileParser = require('./telemetryFileService');

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
  voltage: ['battery_voltage', 'voltage_measured', 'mean_voltage', 'voltage', 'cell_voltage', 'pack_voltage', 'v', 'v_measured', 'hv_voltage', 'bcell_maxvoltage', 'bcell_minvoltage'],
  current: ['battery_current', 'current_measured', 'mean_current', 'current', 'i', 'i_measured', 'hv_current', 'pack_current', 'battery_amps', 'amps'],
  temperature: ['battery_temperature', 'max_battery_temperature', 'temperature_measured', 'mean_temperature', 'temperature', 'temp', 'cell_temperature', 't', 'bcell_maxtemp', 'bcell_mintemp', 'battery_temp', 'pack_temp', 'pack_temperature', 'batt_temp'],
  timestamp: ['timestamp', 'date_time', 'iso_timestamp', 'iso_time'],
  date: ['date', 'datetime', 'measurement_date', 'recorded_at', 'test_date', 'date_recorded'],
  time: ['time', 'relative_time', 'time_s', 'seconds', 'duration'],
  voltageLoad: ['voltage_load', 'load_voltage', 'v_load'],
  currentLoad: ['current_load', 'load_current', 'i_load'],
  batteryId: ['battery_id', 'battery', 'cell_id', 'cell', 'cell_name', 'batteryid'],
  soc: ['soc', 'displayed_soc', 'state_of_charge', 'soc_percent', 'battery_level', 'bcell_soc'],
  speed: ['velocity', 'vhc_speed', 'speed', 'vehicle_speed'],
  mile: ['vhc_totalmile', 'totalmile', 'mile', 'odometer', 'distance'],
  type: ['type', 'operation', 'oper_type', 'operation_type', 'charging_signal', 'regenerative_braking_signal', 'charge_state', 'charging_state', 'charge_status', 'chg_state'],
  dischargeDuration: ['discharge_duration', 'duration_s', 'discharge_duration_min', 'discharge_duration_m'],
  chargeDuration: ['charge_duration', 'chg_duration', 'charge_duration_min', 'charge_duration_m'],
  re: ['re', 're_ohm'],
  rct: ['rct', 'rct_ohm'],
  batteryImpedance: ['battery_impedance', 'batteryimpedance'],
  rectifiedImpedance: ['rectified_impedance', 'rectifiedimpedance'],
};

/**
 * Detect delimiter from first non-empty line
 */
function detectDelimiter(line) {
  const semicolons = (line.match(/;/g) || []).length;
  const commas = (line.match(/,/g) || []).length;
  const tabs = (line.match(/\t/g) || []).length;
  if (semicolons > commas && semicolons > tabs) return ';';
  if (tabs > commas && tabs > semicolons) return '\t';
  return ',';
}

/**
 * Decode text buffer supporting xlsx / latin1 / utf8 fallback and degree symbol cleanup
 */
function decodeCsvBuffer(buffer) {
  return fileParser.decode(buffer);
}

/**
 * Parses CSV lines handling potential quotes, commas, and semicolons.
 */
function parseCsvLine(line, delimiter = ',') {
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
        if (!inQuotes && current.trim()) throw ApiError.badRequest('Quote inside unquoted CSV field', 'VALIDATION_ERROR');
        inQuotes = !inQuotes;
        if (!inQuotes) current += '\0';
      }
    } else if (!inQuotes && current.endsWith('\0')) {
      if (char !== delimiter && !/\s/.test(char)) throw ApiError.badRequest('Characters after a quoted CSV field', 'VALIDATION_ERROR');
      if (char === delimiter) { result.push(current.slice(0, -1).trim()); current = ''; }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.replace(/\0$/, '').trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.replace(/\0$/, '').trim());
  return result;
}

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/\[.*?\]/g, '') // Remove bracketed units [v], [a], [°c]
    .replace(/\(.*?\)/g, '') // Remove parentheses units
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
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
function validateHeaders(buffer, confirmedMapping) {
  if (!buffer || !buffer.length) {
    throw ApiError.badRequest('Uploaded CSV file is empty', 'VALIDATION_ERROR', {
      file: 'File contains no data',
    });
  }

  const content = decodeCsvBuffer(buffer);
  const firstLine = fileParser.logicalLines(content).find((l) => l.trim().length > 0);

  if (!firstLine) {
    throw ApiError.badRequest('Uploaded CSV file has no header row', 'VALIDATION_ERROR', {
      file: 'Header row is missing',
    });
  }

  const delimiter = detectDelimiter(firstLine);
  const rawHeaders = parseCsvLine(firstLine, delimiter);
  const names = rawHeaders.map(normalizeHeader);
  if (names.some((n) => !n) || new Set(names).size !== names.length) {
    throw ApiError.badRequest('Empty or duplicate column names', 'VALIDATION_ERROR');
  }
  for (const field of ['cycle', 'capacity', 'time', 'batteryId']) {
    const matches = names.filter((n) => COLUMN_ALIASES[field].map(normalizeHeader).includes(n));
    if (matches.length > 1) throw ApiError.badRequest('Ambiguous columns for ' + field, 'VALIDATION_ERROR');
  }
  for (const h of rawHeaders) {
    if (/\b(mAh|mV|mA|kWh|Wh|fahrenheit|milliseconds)\b/i.test(h) || /\[(?:ms|f)\]|\((?:ms|f)\)/i.test(h)) {
      throw ApiError.badRequest('Unsupported units in column: ' + h, 'VALIDATION_ERROR');
    }
  }
  const cycleIdx = findColIndex(rawHeaders, COLUMN_ALIASES.cycle);
  const capIdx = findColIndex(rawHeaders, COLUMN_ALIASES.capacity);
  const vIdx = findColIndex(rawHeaders, COLUMN_ALIASES.voltage);
  const tIdx = findColIndex(rawHeaders, COLUMN_ALIASES.time);
  const socIdx = findColIndex(rawHeaders, COLUMN_ALIASES.soc);

  // If file has cycle column, it must have either capacity or voltage
  if (cycleIdx !== -1) {
    if (capIdx === -1 && vIdx === -1) {
      throw ApiError.badRequest(
        'Missing required telemetry: CSV must contain either Capacity or Voltage measurements.',
        'VALIDATION_ERROR',
        { expected: ['Capacity', 'discharge_capacity', 'Voltage_measured', 'mean_voltage'] }
      );
    }
  } else {
    // If no explicit cycle column, verify it is a valid EV driving/time-series telemetry CSV
    if (tIdx === -1 && vIdx === -1 && socIdx === -1 && !(confirmedMapping && Object.keys(confirmedMapping).length)) {
      // Profile each column so the UI can ask the user to confirm a mapping (suggestions only, never auto-applied).
      const dataLines = fileParser.logicalLines(content).filter((l) => l.trim().length > 0).slice(1, 301).map((l) => parseCsvLine(l, delimiter));
      const profiles = rawHeaders.map((h, ci) => {
        const nums = dataLines.map((r) => Number(String(r[ci] ?? '').trim())).filter((x) => Number.isFinite(x));
        const numeric = nums.length >= Math.max(3, dataLines.length * 0.8);
        const prof = { column: h, numeric };
        if (numeric) {
          prof.min = Math.min(...nums); prof.max = Math.max(...nums);
          prof.integerOnly = nums.every((x) => Number.isInteger(x));
          const hints = [];
          if (prof.min >= 2 && prof.max <= 4.5) hints.push('cell voltage (V)?');
          if (prof.min >= 100 && prof.max <= 1000) hints.push('pack voltage (V)?');
          if (prof.min >= -60 && prof.max <= 120 && !prof.integerOnly) hints.push('temperature (C)?');
          if (prof.integerOnly && prof.max - prof.min <= 6) hints.push('state/flag code?');
          prof.suggestions = hints; // unconfirmed: ranges alone cannot identify a measurement
        }
        return prof;
      });
      throw new ApiError(422,
        'Could not identify telemetry columns automatically. Please confirm which columns hold voltage, current, temperature, SoC or time.',
        'MAPPING_CONFIRMATION_REQUIRED',
        { columns: profiles, note: 'Suggestions are based on value ranges only and are NOT applied automatically.' }
      );
    }
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

// ---------------------------------------------------------------------------
// Schema adapters + per-analysis report (authoritative: computed from the FULL file)
// ---------------------------------------------------------------------------
const VEHICLE_BMS_V1_COLUMNS = ['time', 'vhc_speed', 'charging_signal', 'vhc_totalmile', 'hv_voltage', 'hv_current', 'bcell_soc', 'bcell_maxvoltage', 'bcell_minvoltage', 'bcell_maxtemp', 'bcell_mintemp'];

function detectSchema(headers) {
  const lower = headers.map((h) => h.trim().toLowerCase());
  if (VEHICLE_BMS_V1_COLUMNS.every((c) => lower.includes(c))) return { id: 'vehicle_bms_v1', label: 'Vehicle BMS telemetry (pack + cell min/max)', adapter: 'explicit' };
  if (lower.includes('cycle') && (lower.includes('capacity') || lower.includes('discharge_capacity'))) return { id: 'cycle_capacity', label: 'Battery cycle data (NASA-style)', adapter: 'alias' };
  return { id: 'generic_telemetry', label: 'Generic telemetry (no dedicated adapter; mapped by documented aliases only)', adapter: 'alias' };
}

/**
 * Cell-voltage and cell-temperature spread from per-row max/min columns (vehicle_bms_v1 only).
 * Missing values are never treated as 0. A cell minimum voltage of exactly 0 is a SENTINEL (no real cell reads 0 V
 * in service), counted as invalid and excluded, not reported as a fault. Pack voltage (hv_voltage) is never used here.
 */
function computeCellSpreads(lines, headerLineIndex, delimiter, headers) {
  const lower = headers.map((h) => h.trim().toLowerCase());
  const ix = (n) => lower.indexOf(n);
  const iVmax = ix('bcell_maxvoltage'), iVmin = ix('bcell_minvoltage'), iTmax = ix('bcell_maxtemp'), iTmin = ix('bcell_mintemp');
  if ([iVmax, iVmin, iTmax, iTmin].some((i) => i === -1)) return null;
  const num = (row, i) => { const v = row[i]; if (v === undefined || v === '') return null; const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const out = { voltage: { unit: 'V', valid: 0, missing: 0, sentinelZero: 0, inconsistent: 0, maxSpread: null, maxSpreadRow: null, meanSpread: null, basis: 'bcell_maxVoltage - bcell_minVoltage (both present, min > 0)' },
    temperature: { unit: '°C', valid: 0, missing: 0, inconsistent: 0, maxSpread: null, maxSpreadRow: null, meanSpread: null, basis: 'bcell_maxTemp - bcell_minTemp (both present)' } };
  let vSum = 0, tSum = 0;
  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const row = parseCsvLine(raw, delimiter);
    const srcRow = i - headerLineIndex; // 1-based data row number
    const vmax = num(row, iVmax), vmin = num(row, iVmin);
    if (vmax === null || vmin === null) out.voltage.missing++;
    else if (vmin === 0) out.voltage.sentinelZero++;
    else if (vmax < vmin) out.voltage.inconsistent++;
    else { const d = vmax - vmin; out.voltage.valid++; vSum += d; if (out.voltage.maxSpread === null || d > out.voltage.maxSpread) { out.voltage.maxSpread = Number(d.toFixed(4)); out.voltage.maxSpreadRow = srcRow; } }
    const tmax = num(row, iTmax), tmin = num(row, iTmin);
    if (tmax === null || tmin === null) out.temperature.missing++;
    else if (tmax < tmin) out.temperature.inconsistent++;
    else { const d = tmax - tmin; out.temperature.valid++; tSum += d; if (out.temperature.maxSpread === null || d > out.temperature.maxSpread) { out.temperature.maxSpread = Number(d.toFixed(2)); out.temperature.maxSpreadRow = srcRow; } }
  }
  if (out.voltage.valid) out.voltage.meanSpread = Number((vSum / out.voltage.valid).toFixed(4));
  if (out.temperature.valid) out.temperature.meanSpread = Number((tSum / out.temperature.valid).toFixed(2));
  return out;
}

function buildAnalysisReport({ schema, headers, parsed }) {
  const lower = headers.map((h) => h.trim().toLowerCase());
  const found = (names) => names.filter((n) => lower.includes(n));
  const capCycles = (parsed.cycleTable || []).filter((c) => Number.isFinite(c.capacity) && c.capacity > 0).length;
  const an = parsed.anomalies;
  const anomalyRan = !!an && an.totalRecordsAnalyzed > 0;
  const item = (id, name, status, reason, required, inputsFound, validRecords, result, limitation) => ({ id, name, status, reason, requiredInputs: required, inputsFound, validRecords, result: result ?? null, limitation: limitation ?? null });
  return [
    item('validation', 'File & schema validation', 'completed', `Schema recognised as: ${schema.label}.`, ['header row', 'at least one supported battery column'], headers, parsed.recordCount, { schema: schema.id, adapter: schema.adapter, invalidNumericCount: parsed.quality?.invalidNumericCount ?? null, duplicateRowCount: parsed.quality?.duplicateRowCount ?? null }),
    anomalyRan
      ? item('anomaly', 'Battery telemetry anomalies', 'completed', 'Supported telemetry columns present; checked against generic reference limits (not vehicle-specific).', ['voltage, temperature or current'], found(['hv_voltage', 'hv_current', 'bcell_maxvoltage', 'bcell_minvoltage', 'bcell_maxtemp', 'bcell_mintemp', 'voltage_measured', 'current_measured', 'temperature_measured']), an.totalRecordsAnalyzed, { unresolvedCount: an.unresolvedCount ?? 0, findings: (an.anomalies || []).length })
      : item('anomaly', 'Battery telemetry anomalies', 'ineligible', 'No supported voltage/temperature/current columns with valid values.', ['voltage, temperature or current'], [], 0, null, 'Zero anomalies is NOT reported because no analysis ran.'),
    capCycles >= 7
      ? item('soh', 'SOH estimation', 'pending', 'Capacity and cycle data sufficient; computed by the analysis pipeline.', ['Cycle', 'Capacity (7+ valid cycles)'], found(['cycle', 'capacity', 'discharge_capacity']), capCycles)
      : item('soh', 'SOH estimation', 'ineligible', capCycles === 0 ? 'No discharge-capacity column with valid values. Driving telemetry is not fed into the battery-cycle model.' : `Only ${capCycles} valid capacity cycles; 7 are required.`, ['Cycle', 'Capacity (7+ valid cycles)'], found(['cycle', 'capacity', 'discharge_capacity']), capCycles, null, 'Additional data needed: per-cycle discharge capacity.'),
    capCycles >= 7
      ? item('rul', 'RUL prediction', 'pending', 'Same requirements as SOH; computed by the analysis pipeline.', ['Cycle', 'Capacity (7+ valid cycles)'], found(['cycle', 'capacity', 'discharge_capacity']), capCycles)
      : item('rul', 'RUL prediction', 'ineligible', 'Requires the same capacity-cycle data as SOH, which is not available.', ['Cycle', 'Capacity (7+ valid cycles)'], found(['cycle', 'capacity', 'discharge_capacity']), capCycles, null, 'Additional data needed: per-cycle discharge capacity.'),
    (parsed.chargingSessions || []).length > 0
      ? item('charging', 'Charging-session extraction', 'completed', 'Sessions extracted. Charging encoding/current sign is NOT verified, so sessions are marked "Needs verification" and energy is an estimate.', ['time', 'current', 'SoC (optional)'], found(['time', 'hv_current', 'current_measured', 'bcell_soc', 'soc', 'charging_signal']), parsed.recordCount, { sessions: parsed.chargingSessions.length })
      : item('charging', 'Charging-session extraction', 'ineligible', 'No charging rows detected (needs time and current columns with positive-current rows).', ['time', 'current'], found(['time', 'hv_current', 'current_measured']), 0),
  ];
}

function parseBuffer(buffer, options = {}) {
  const stage = (name, status) => options.onStage?.(name, status, new Date());
  stage('validation', 'processing');
  fileParser.validateFormat(buffer, options.fileName);
  validateHeaders(buffer, options && options.columnMapping);

  stage('validation', 'completed');
  stage('schemaMapping', 'processing');
  const content = decodeCsvBuffer(buffer);
  const lines = fileParser.logicalLines(content);
  const headerLineIndex = lines.findIndex((l) => l.trim().length > 0);
  const firstLine = lines[headerLineIndex];
  const delimiter = detectDelimiter(firstLine);
  const headers = parseCsvLine(firstLine, delimiter).map((h) => h.trim());

  // Map semantic columns using aliases
  const colIndices = {};
  for (const [semanticName, aliases] of Object.entries(COLUMN_ALIASES)) {
    colIndices[semanticName] = findColIndex(headers, aliases);
  }
  // User-confirmed mapping (canonical field -> exact source header). Overrides alias guesses; unknown headers are rejected.
  if (options && options.columnMapping && typeof options.columnMapping === 'object') {
    for (const [canon, src] of Object.entries(options.columnMapping)) {
      if (!(canon in COLUMN_ALIASES)) throw ApiError.badRequest(`Unknown canonical field: ${canon}`, 'VALIDATION_ERROR');
      const idx = headers.findIndex((h) => String(h).trim() === String(src).trim());
      if (idx === -1) throw ApiError.badRequest(`Confirmed column "${src}" not found in file`, 'VALIDATION_ERROR');
      colIndices[canon] = idx;
    }
  }

  const getCell = (row, idx) => {
    if (idx === -1 || idx >= row.length) return null;
    const str = row[idx];
    return str !== undefined && str !== '' ? str : null;
  };

  const getNumeric = (row, idx) => {
    const val = getCell(row, idx);
    if (val === null) return null;
    const text = String(val).trim();
    const num = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) ? Number(text) : NaN;
    if (!Number.isFinite(num)) throw ApiError.badRequest('Invalid numeric value: ' + val, 'VALIDATION_ERROR');
    return num;
  };

  stage('schemaMapping', 'completed');
  for (const name of ['cleaning', 'missingValueHandling', 'outlierDetection']) stage(name, 'processing');
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
      continue;
    } else {
      seenLineHashes.add(rawLine);
    }

    const parsed = parseCsvLine(rawLine, delimiter);
    if (parsed.length !== headers.length) throw ApiError.badRequest('Column count mismatch at record ' + (i + 1), 'VALIDATION_ERROR');

    let cycle = getNumeric(parsed, colIndices.cycle);
    if (cycle === null) {
      if (colIndices.cycle === -1) {
        // One diagnostic session; not an inferred battery aging cycle.
        cycle = 1;
      } else {
        invalidNumericCount++;
        continue;
      }
    }

    if (!Number.isInteger(cycle) || cycle < 1) throw ApiError.badRequest('Cycle must be a positive integer', 'VALIDATION_ERROR');
    const batteryIdRaw = getCell(parsed, colIndices.batteryId);
    if (batteryIdRaw) {
      batteryIdSet.add(batteryIdRaw);
    }

    const voltage = getNumeric(parsed, colIndices.voltage);
    const current = getNumeric(parsed, colIndices.current);
    const temperature = getNumeric(parsed, colIndices.temperature);
    let capacity = getNumeric(parsed, colIndices.capacity);
    const opType = getCell(parsed, colIndices.type)?.toLowerCase() || null;

    const timestampCell = colIndices.timestamp !== -1 ? getCell(parsed, colIndices.timestamp) : null;
    const dateCell = colIndices.date !== -1 ? getCell(parsed, colIndices.date) : null;
    const timeCell = colIndices.time !== -1 ? getCell(parsed, colIndices.time) : null;

    let rowDate = null;
    let time = null;

    if (timestampCell) {
      const parsedEpoch = Date.parse(timestampCell);
      if (Number.isFinite(parsedEpoch)) {
        rowDate = new Date(parsedEpoch);
        time = parsedEpoch / 1000;
      }
    }

    if (time === null && dateCell && timeCell && /^\d{1,2}:\d{2}/.test(timeCell)) {
      const parsedEpoch = Date.parse(`${dateCell}T${timeCell}`);
      if (Number.isFinite(parsedEpoch)) {
        rowDate = new Date(parsedEpoch);
        time = parsedEpoch / 1000;
      }
    }

    if (time === null && dateCell) {
      const parsedEpoch = Date.parse(dateCell);
      if (Number.isFinite(parsedEpoch)) {
        rowDate = new Date(parsedEpoch);
        time = parsedEpoch / 1000;
      }
    }

    if (time === null && timeCell) {
      if (/^\d{4}-\d\d-\d\d/.test(timeCell)) {
        const parsedEpoch = Date.parse(timeCell);
        if (Number.isFinite(parsedEpoch)) {
          rowDate = new Date(parsedEpoch);
          time = parsedEpoch / 1000;
        }
      } else if (!timeCell.includes(':')) {
        time = getNumeric(parsed, colIndices.time);
      }
    }

    if (time === null && rowDate) {
      time = rowDate.getTime() / 1000;
    }

    if (time !== null && !Number.isFinite(time)) throw ApiError.badRequest('Invalid timestamp', 'VALIDATION_ERROR');

    // Capacity validation:
    // On discharge rows (or if type not specified): capacity must be positive Ah if provided
    // On charge rows: non-positive or zero capacity is permitted and normalized to null
    if (opType === 'charge') {
      if (capacity !== null && capacity <= 0) {
        capacity = null;
      }
    } else {
      if (capacity !== null && capacity <= 0) {
        throw ApiError.badRequest('Capacity must be positive Ah', 'VALIDATION_ERROR');
      }
    }

    const socVal = getNumeric(parsed, colIndices.soc);
    const vLoad = getNumeric(parsed, colIndices.voltageLoad);
    const iLoad = getNumeric(parsed, colIndices.currentLoad);
    const dischargeDuration = getNumeric(parsed, colIndices.dischargeDuration);
    const chargeDuration = getNumeric(parsed, colIndices.chargeDuration);
    const re = getNumeric(parsed, colIndices.re);
    const rct = getNumeric(parsed, colIndices.rct);

    const speed = getNumeric(parsed, colIndices.speed);
    const mile = getNumeric(parsed, colIndices.mile);

    // Screen physical single-cell outliers if voltage/temperature exist and look like single cell
    if (voltage !== null && voltage < 6.0 && (voltage < 1.0 || voltage > 5.5)) {
      outlierCount++;
    }
    if (temperature !== null && (temperature < -45 || temperature > 110)) {
      outlierCount++;
    }

    allRows.push({
      batteryId: batteryIdRaw ? String(batteryIdRaw).trim() : null,
      cycle: Math.round(cycle),
      voltage,
      current,
      temperature,
      capacity,
      time: time !== null ? time : 0,
      date: rowDate ? rowDate.toISOString().split('T')[0] : (dateCell || null),
      soc: socVal,
      speed,
      mile,
      vLoad,
      iLoad,
      opType,
      dischargeDuration,
      chargeDuration,
      re,
      rct,
      rawRow: parsed,
    });
  }

  if (allRows.length === 0) {
    throw ApiError.badRequest('CSV contains header but no valid numeric data rows', 'VALIDATION_ERROR');
  }

  const availableBatteries = Array.from(batteryIdSet).sort();
  let selectedBatteryId = options.targetBatteryId || (availableBatteries.length > 0 ? availableBatteries[0] : 'Unspecified battery');

  // Filter rows for the selected battery if multi-battery
  let rows = allRows;
  if (availableBatteries.length > 0) {
    const matchedRows = allRows.filter((r) => r.batteryId === selectedBatteryId);
    if (matchedRows.length > 0) {
      rows = matchedRows;
    } else {
      throw ApiError.badRequest('Unknown battery identifier', 'VALIDATION_ERROR');
    }
  }

  if (availableBatteries.length && allRows.some((r) => !r.batteryId)) {
    throw ApiError.badRequest('Battery identifiers must be present on every row', 'VALIDATION_ERROR');
  }
  // Filter discharge operations if 'type' column is present
  const hasTypeCol = colIndices.type !== -1;
  const dischargeRows = hasTypeCol
    ? rows.filter((r) => r.opType === 'discharge' || (!r.opType && (r.current === null || r.current < -0.05)))
    : rows.filter((r) => r.current === null || r.current < -0.05 || (r.capacity !== null && r.capacity > 0));

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

  // --- Charging sessions: contiguous charging rows within a cycle ---
  // Data-evidence inference of the charging-signal encoding (NOT documented; labelled as inferred).
  let inferredEncoding = null;
  if (!(options && options.chargingEncoding) && colIndices.type !== -1) {
    const typesPresent = new Set(rows.map((r) => (r.opType ? String(r.opType).toLowerCase() : null)).filter(Boolean));
    if (typesPresent.has('charge')) {
      inferredEncoding = {
        chargingValues: ['charge'],
        basis: 'Explicit standard "type" column specifies operation phase ("charge")',
      };
    } else {
      const stat = new Map();
      for (let k = 1; k < rows.length; k++) {
        const v = rows[k].opType; if (v === null || rows[k].soc === null || rows[k - 1].soc === null) continue;
        const e = stat.get(v) || { n: 0, d: 0, sp: 0, spn: 0 };
        e.n++; e.d += rows[k].soc - rows[k - 1].soc;
        if (rows[k].speed !== null && rows[k].speed !== undefined) { e.sp += rows[k].speed; e.spn++; }
        stat.set(v, e);
      }
      if (stat.size >= 2 && stat.size <= 6) {
        const cands = [...stat.entries()].filter(([, e]) => e.n >= 20 && e.d > 0 && (e.spn === 0 || e.sp / e.spn < 0.5));
        const others = [...stat.entries()].filter(([k]) => !cands.some((c) => c[0] === k));
        if (cands.length === 1 && others.every(([, e]) => e.d <= 0 || (e.spn > 0 && e.sp / e.spn >= 0.5))) inferredEncoding = { chargingValues: [cands[0][0]], basis: 'inferred from data: this signal value only occurs with SoC rising and vehicle stationary; not documented - please confirm' };
      }
    }
  }
  if (inferredEncoding && options && typeof options === 'object') options = { ...options, chargingEncoding: inferredEncoding };
  else if (inferredEncoding) options = { chargingEncoding: inferredEncoding };
  const chargingSessions = [];
  const sessionSignVerifiedEarly = !!(options && options.chargingEncoding && Array.isArray(options.chargingEncoding.chargingValues) && options.chargingEncoding.chargingValues.length && colIndices.type !== -1);
  if (colIndices.time !== -1) {
    let cur = null;
    const flush = () => {
      if (cur) {
        if (cur.rows.length > 1) {
          const f = cur.rows[0], l = cur.rows[cur.rows.length - 1];
          const secs = Math.max(0, l.time - f.time);
          let ah = 0;
          for (let k = 1; k < cur.rows.length; k++) ah += (Math.abs(sessionSignVerifiedEarly ? (cur.rows[k].current || 0) : Math.max(0, cur.rows[k].current || 0)) * Math.max(0, cur.rows[k].time - cur.rows[k - 1].time)) / 3600;
          const vs = cur.rows.map((x) => x.voltage).filter((x) => x !== null);
          const mv = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
          chargingSessions.push({
            startTime: f.time, endTime: l.time,
            cycle: cur.cycle,
            durationMin: secs > 0 ? Number((secs / 60).toFixed(1)) : null,
            startSoc: f.soc, endSoc: l.soc,
            energyKWh: mv !== null && ah > 0 ? Number(((ah * mv) / 1000).toFixed(3)) : null,
            status: 'Complete',
            avgSpeed: (() => { const sp = cur.rows.map((x) => x.speed).filter((x) => x !== null && x !== undefined); return sp.length ? sp.reduce((a, b) => a + b, 0) / sp.length : 0; })(),
          });
        } else if (cur.rows.length === 1) {
          const r0 = cur.rows[0];
          const durMin = r0.chargeDuration !== null && r0.chargeDuration > 0 ? r0.chargeDuration : null;
          if (durMin !== null) {
            const secs = Math.round(durMin * 60);
            const currentA = Math.abs(r0.current || 0);
            const ah = (currentA * secs) / 3600;
            const mv = r0.voltage;
            const startSoc = r0.soc !== null ? Math.max(0, Number((r0.soc - (ah / 2.0) * 100).toFixed(1))) : null;
            chargingSessions.push({
              startTime: r0.time,
              endTime: r0.time + secs,
              cycle: cur.cycle,
              durationMin: Number(durMin.toFixed(1)),
              startSoc: startSoc !== null ? startSoc : (r0.soc !== null ? Math.max(0, r0.soc - 25) : null),
              endSoc: r0.soc,
              energyKWh: mv !== null && ah > 0 ? Number(((ah * mv) / 1000).toFixed(3)) : null,
              status: 'Complete',
              avgSpeed: 0,
            });
          }
        }
      }
      cur = null;
    };
    for (const r of rows) {
      const enc = options && options.chargingEncoding;
      const useSignal = !!(enc && Array.isArray(enc.chargingValues) && enc.chargingValues.length && colIndices.type !== -1);
      const charging = useSignal
        ? r.opType !== null && enc.chargingValues.map((v) => String(v).toLowerCase()).includes(String(r.opType).toLowerCase())
        : r.current !== null && r.current > 0.05;
      if (charging && cur && cur.cycle === r.cycle) cur.rows.push(r);
      else { flush(); if (charging) cur = { cycle: r.cycle, rows: [r] }; }
    }
    flush();
    // Merge fragments: current dips/noise split one real charge into many pieces. Join sessions of the same cycle
    // separated by <= 120 s; duration spans first start to last end, energy is summed, SoC is first start / last end.
    const sessionSignVerified = !!(options && options.chargingEncoding && Array.isArray(options.chargingEncoding.chargingValues) && options.chargingEncoding.chargingValues.length && colIndices.type !== -1); // true ONLY when the user supplies the documented encoding
    const GAP_S = 120;
    const merged = [];
    for (const sess of chargingSessions) {
      const prev = merged[merged.length - 1];
      if (prev && prev.cycle === sess.cycle && sess.startTime - prev.endTime <= GAP_S) {
        prev.endTime = sess.endTime;
        prev.endSoc = sess.endSoc;
        prev.energyKWh = prev.energyKWh !== null || sess.energyKWh !== null ? Number(((prev.energyKWh || 0) + (sess.energyKWh || 0)).toFixed(3)) : null;
        const secs = Math.max(0, prev.endTime - prev.startTime);
        prev.durationMin = secs > 0 ? Number((secs / 60).toFixed(1)) : null;
        prev.fragments = (prev.fragments || 1) + 1;
      } else {
        merged.push({ ...sess, fragments: 1 });
      }
    }
    // Status is only "Complete" when the data supports it. The charging-state encoding of the source file
    // (e.g. charging_signal) and the current sign convention are NOT documented here, so every session derived
    // from current sign alone is at best "Needs verification". Energy is an ESTIMATE (pack voltage x current integral).
    const MAX_PLAUSIBLE_S = 24 * 3600;
    for (let q = merged.length - 1; q >= 0; q--) { const m = merged[q]; if (!sessionSignVerified && m.avgSpeed > 1) merged.splice(q, 1); }
    for (const m of merged) {
      const warnings = [];
      const hasSoc = Number.isFinite(m.startSoc) && Number.isFinite(m.endSoc);
      const secs = Math.max(0, (m.endTime || 0) - (m.startTime || 0));
      let status = 'Needs verification';
      if (secs <= 0) { status = 'Insufficient data'; warnings.push('Zero duration'); }
      if (secs > MAX_PLAUSIBLE_S) warnings.push('Duration over 24 h: implausible for one charge');
      if (hasSoc && m.endSoc < m.startSoc) warnings.push('SoC decreased: current sign or charging-state encoding may be wrong');
      if (!hasSoc) { warnings.push('SoC unavailable'); status = status === 'Insufficient data' ? status : 'Insufficient data'; }
      if (!sessionSignVerified) warnings.push('Charging encoding / current sign not verified for this schema');
      else {
        const encB = options.chargingEncoding && options.chargingEncoding.basis;
        m.energyBasis = 'estimated: mean voltage x integrated |current|, charging state from ' + (encB ? encB : 'user-supplied encoding');
        if (encB && encB.includes('unconfirmed')) warnings.push(encB);
      }
      if (sessionSignVerified && warnings.length === 0 && status === 'Needs verification') status = 'Complete';
      m.status = status;
      m.warnings = warnings;
      m.socChange = hasSoc ? m.endSoc - m.startSoc : null;
      if (!sessionSignVerified) m.energyBasis = m.energyKWh === null ? null : 'estimated: mean voltage x integrated positive current';
    }
    chargingSessions.length = 0;
    chargingSessions.push(...merged);
  }
  const socRows = rows.filter((r) => r.soc !== null);
  const latestSoc = socRows.length ? socRows[socRows.length - 1].soc : null;

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
    const validCaps = cRows.map((r) => r.capacity).filter((c) => c !== null && c > 0);
    if (validCaps.length > 0) {
      if (validCaps.some((c) => c !== validCaps[0])) throw ApiError.badRequest('Conflicting capacities for cycle ' + cyc, 'VALIDATION_ERROR');
      cap = validCaps[0];
    }

    // Never invent a fallback capacity (e.g. 1.85 Ah) when capacity was not measured
    const finalCap = cap !== null ? Number(cap.toFixed(4)) : null;

    // Discharge duration for this cycle
    let duration = null;
    const explicitDur = cRows.find((r) => r.dischargeDuration !== null && r.dischargeDuration > 0);
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

    const dateWithVal = cRows.find((r) => r.date);
    const cycleDate = dateWithVal ? dateWithVal.date : null;

    cycleTable.push({
      cycle: cyc,
      capacity: finalCap,
      date: cycleDate,
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
  // Reference is the first discharge, never a future maximum.
  const validCaps = cycleTable.map((c) => c.capacity).filter((x) => Number.isFinite(x) && x > 0);
  const initialCapacity = cycleTable[0]?.capacity || 0;

  const latestCapacity = validCaps.length > 0
    ? validCaps[validCaps.length - 1]
    : 0;

  const empiricalSoh = (initialCapacity > 0 && colIndices.capacity !== -1)
    ? Number(Math.min(100.0, Math.max(0.0, (latestCapacity / initialCapacity) * 100.0)).toFixed(1))
    : null; // no capacity data: SOH is unknown, never assume 100%

  // --- Historical SOH Degradation Curve ---
  const historical = initialCapacity > 0
    ? cycleTable
        .filter((c) => Number.isFinite(c.capacity) && c.capacity > 0)
        .map((c) => ({
          cycle: c.cycle,
          soh: Number(Math.min(100.0, Math.max(0.0, (c.capacity / initialCapacity) * 100.0)).toFixed(1)),
        }))
    : [];

  // --- Degradation Rate & RUL Extrapolation (Requirement 7 & 8) ---
  const cyclesArray = historical.map((h) => h.cycle);
  const sohsArray = historical.map((h) => h.soh);
  const regression = fitLinearRegression(cyclesArray, sohsArray);

  const eolThreshold = options.eolThreshold !== undefined ? Number(options.eolThreshold) : 80.0;
  const currentCycle = sortedCycles[sortedCycles.length - 1] || 1;

  const rulCycles = null;
  const estimatedEOLCycle = null;
  const rulStatus = 'awaiting_ml_service';
  const predicted = [];

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
  }

  // --- Run Anomaly Detection against Anonymized Profile B ---
  const { detectAnomalies } = require('./anomalyService');
  // Reconstruct telemetry record dictionary for anomaly rules
  const telemetryRecords = rows.map((r) => {
    const raw = r.rawRow || [];
    const rec = {
      time: r.time,
      hv_voltage: r.voltage,
      hv_current: r.current,
      bcell_soc: r.soc,
      bcell_maxTemp: r.temperature,
      bcell_minTemp: r.temperature,
    };
    // If original headers contain specific bcell keys, pick them up
    if (headers && raw.length > 0) {
      for (let hIdx = 0; hIdx < headers.length; hIdx++) {
        const hName = headers[hIdx];
        if (/bcell_maxvoltage/i.test(hName)) rec.bcell_maxVoltage = parseFloat(raw[hIdx]);
        if (/bcell_minvoltage/i.test(hName)) rec.bcell_minVoltage = parseFloat(raw[hIdx]);
        if (/bcell_maxtemp/i.test(hName)) rec.bcell_maxTemp = parseFloat(raw[hIdx]);
        if (/bcell_mintemp/i.test(hName)) rec.bcell_minTemp = parseFloat(raw[hIdx]);
        if (/hv_voltage/i.test(hName)) rec.hv_voltage = parseFloat(raw[hIdx]);
        if (/hv_current/i.test(hName)) rec.hv_current = parseFloat(raw[hIdx]);
      }
    }
    return rec;
  });

  const anomalyResults = detectAnomalies(telemetryRecords, 'generic_reference');

  const schemaInfo = detectSchema(headers);
  schemaInfo.hasExplicitCycles = colIndices.cycle !== -1;
  schemaInfo.capacityUnit = 'Ah';
  schemaInfo.timeUnit = 'seconds';
  schemaInfo.reference = 'first_discharge';
  const spreads = schemaInfo.id === 'vehicle_bms_v1' ? computeCellSpreads(lines, headerLineIndex, delimiter, headers) : null;
  let latestMeasurementDate = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].date) {
      latestMeasurementDate = new Date(rows[i].date);
      break;
    }
  }

  const resultObj = {
    recordCount: rows.length,
    cycleCount: sortedCycles.length,
    uniqueCycles: sortedCycles,
    selectedBatteryId,
    availableBatteries,
    measurementDate: latestMeasurementDate,
    columnStats,
    timeShare,
    cycleTable,
    chargingSessions: chargingSessions.slice(-200),
    latestSoc,
    fadeShare: { firstHalfPct, secondHalfPct },
    anomalies: anomalyResults,
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
      method: 'ml_service',
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
      missingPercentage: Number((100 * (hasTypeCol ? dischargeRows : rows).filter((r) => r.capacity === null).length / Math.max(1, (hasTypeCol ? dischargeRows : rows).length)).toFixed(2)),
    },
  };
  resultObj.schemaInfo = schemaInfo;
  resultObj.spreads = spreads;
  resultObj.sourceColumns = headers;
  resultObj.analysisReport = buildAnalysisReport({ schema: schemaInfo, headers, parsed: resultObj });
  for (const name of ['cleaning', 'missingValueHandling', 'outlierDetection']) stage(name, 'completed');
  return resultObj;
}

module.exports = {
  REQUIRED_COLUMNS,
  COLUMN_ALIASES,
  validateHeaders,
  parseBuffer,
  fitLinearRegression,
  detectSchema,
  computeCellSpreads,
  buildAnalysisReport,
};
