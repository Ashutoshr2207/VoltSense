const fs = require('fs');
const path = require('path');
const { parseBuffer, detectSchema, computeCellSpreads } = require('../src/services/csvParserService');

const V1 = 'time,vhc_speed,charging_signal,vhc_totalMile,hv_voltage,hv_current,bcell_soc,bcell_maxVoltage,bcell_minVoltage,bcell_maxTemp,bcell_minTemp\n';
const vehicle1 = (n, mut = (r) => r) => {
  let csv = V1;
  for (let i = 0; i < n; i += 1) csv += mut([1000 + i * 10, 0, 3, 81491, 347, 4.1, 61, 3.83, 3.81, 21, 19], i).join(',') + '\n';
  return Buffer.from(csv);
};
const find = (r, id) => r.analysisReport.find((a) => a.id === id);

describe('addendum: schema adapters and per-analysis outcomes', () => {
  test('3. Vehicle 1 recognised by its actual column names', () => {
    expect(detectSchema(V1.trim().split(',')).id).toBe('vehicle_bms_v1');
    expect(parseBuffer(vehicle1(50), {}).schemaInfo.id).toBe('vehicle_bms_v1');
  });

  test('5. SOH/RUL ineligible without blocking anomaly analysis', () => {
    const r = parseBuffer(vehicle1(50), {});
    expect(find(r, 'soh').status).toBe('ineligible');
    expect(find(r, 'rul').status).toBe('ineligible');
    expect(find(r, 'anomaly').status).toBe('completed');
    expect(r.soh.empirical).toBeNull();
  });

  test('6. pack voltage is not used as cell voltage: spread uses only cell min/max', () => {
    const r = parseBuffer(vehicle1(50), {});
    expect(r.spreads.voltage.maxSpread).toBeCloseTo(0.02, 3); // 3.83 - 3.81, not 347
    expect(r.spreads.voltage.basis).toMatch(/bcell_maxVoltage/);
  });

  test('7. sentinel 0 V / missing cell values are excluded, not counted as faults or zero', () => {
    const r = parseBuffer(vehicle1(20, (row, i) => { if (i === 3) row[8] = 0; if (i === 4) row[7] = ''; return row; }), {});
    expect(r.spreads.voltage.sentinelZero).toBe(1);
    expect(r.spreads.voltage.missing).toBe(1);
    expect(r.spreads.voltage.valid).toBe(18);
  });

  test('9. charging sessions are never forced to Complete and carry warnings; 24h+ flagged', () => {
    const r = parseBuffer(vehicle1(30, (row, i) => { row[0] = 1000 + i * 10000; row[4] = 350; row[5] = 20; return row; }), {});
    expect(r.chargingSessions.length).toBeGreaterThan(0);
    for (const s of r.chargingSessions) {
      expect(s.status).not.toBe('Complete');
      expect(s.warnings.length).toBeGreaterThan(0);
    }
  });

  test('NASA-style file: SOH/RUL pending (to be decided by pipeline), charging ineligible', () => {
    let csv = 'Cycle,Capacity,Voltage_measured,Current_measured,Temperature_measured\n';
    for (let i = 1; i <= 20; i += 1) csv += `${i},${(2 - i * 0.01).toFixed(4)},3.7,-1.5,26\n`;
    const r = parseBuffer(Buffer.from(csv), {});
    expect(find(r, 'soh').status).toBe('pending');
    expect(find(r, 'charging').status).toBe('ineligible');
  });

  test('2/13. UI: Battery Anomalies has no file input; CO2 card text is gone', () => {
    const fe = path.resolve(__dirname, '../../frontend/src');
    const anomalies = fs.readFileSync(path.join(fe, 'pages/BatteryAnomalies.jsx'), 'utf8');
    expect(anomalies).not.toMatch(/type="file"/);
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of walk(fe).filter((x) => /\.jsx?$/.test(x))) {
      expect(fs.readFileSync(f, 'utf8')).not.toMatch(/CO₂ Emissions Avoided/);
    }
  });
});
