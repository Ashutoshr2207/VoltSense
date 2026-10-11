const { parseBuffer } = require('../src/services/csvParserService');

describe('csvParserService (no database needed)', () => {
  test('NASA-style cycle CSV: SOH from capacity ratio, 120 records', () => {
    let csv = 'Cycle,Capacity,Voltage_measured,Current_measured,Temperature_measured\n';
    for (let i = 1; i <= 20; i += 1) csv += `${i},${(2 - i * 0.01).toFixed(4)},3.7,-1.5,26\n`;
    const r = parseBuffer(Buffer.from(csv), 'nasa.csv');
    expect(r.recordCount).toBe(20);
    expect(r.soh.empirical).toBeCloseTo(90.5, 1);
  });

  test('EV telemetry without capacity: SOH is null (never assumed 100%), charging sessions carry start/end SoC', () => {
    let csv = 'time,vhc_speed,charging_signal,hv_voltage,hv_current,bcell_soc,bcell_maxVoltage,bcell_minVoltage,bcell_maxTemp,bcell_minTemp\n';
    for (let i = 0; i < 60; i += 1) csv += `${1000 + i * 10},0,3,350,${20},${50 + Math.floor(i / 6)},3.8,3.78,25,24\n`;
    const r = parseBuffer(Buffer.from(csv), 'trip.csv');
    expect(r.soh.empirical).toBeNull();
    expect(r.chargingSessions.length).toBeGreaterThan(0);
    const s = r.chargingSessions[0];
    expect(s).toEqual(expect.objectContaining({ startSoc: expect.any(Number), endSoc: expect.any(Number) }));
  });

  test('missing required columns are rejected', () => {
    expect(() => parseBuffer(Buffer.from('foo,bar\n1,2\n'), 'bad.csv')).toThrow();
  });

  test('fragmented charging rows are merged into one session', () => {
    let csv = 'time,vhc_speed,charging_signal,hv_voltage,hv_current,bcell_soc,bcell_maxVoltage,bcell_minVoltage,bcell_maxTemp,bcell_minTemp\n';
    for (let i = 0; i < 60; i += 1) csv += `${1000 + i * 10},0,3,350,${i % 7 === 0 ? 0 : 20},${50 + Math.floor(i / 10)},3.8,3.78,25,24\n`;
    const r = parseBuffer(Buffer.from(csv), 'trip.csv');
    expect(r.chargingSessions.length).toBe(1);
    expect(r.chargingSessions[0].fragments).toBeGreaterThan(1);
  });

  test('non-NASA data is not labelled as a NASA battery', () => {
    const r = parseBuffer(Buffer.from('time,hv_voltage,hv_current,bcell_soc,bcell_maxVoltage,bcell_minVoltage,bcell_maxTemp,bcell_minTemp\n1,350,1,50,3.8,3.7,25,24\n2,350,1,51,3.8,3.7,25,24\n'), 'x.csv');
    expect(r.selectedBatteryId).not.toMatch(/NASA/);
  });

  const hdr = 'time,vhc_speed,charging_signal,hv_voltage,hv_current,bcell_soc,bcell_maxVoltage,bcell_minVoltage,bcell_maxTemp,bcell_minTemp\n';
  test('user-supplied charging encoding drives sessions; without it they stay unverified', () => {
    let csv = hdr;
    for (let i = 0; i < 40; i += 1) csv += `${1000 + i * 10},0,${i < 30 ? 3 : 0},350,-20,${50 + Math.floor(i / 5)},3.8,3.78,25,24\n`;
    const plain = parseBuffer(Buffer.from(csv), 'v.csv');
    expect(plain.chargingSessions.every((s) => s.status !== 'Complete')).toBe(true);
    const enc = parseBuffer(Buffer.from(csv), { chargingEncoding: { chargingValues: [3] } });
    expect(enc.chargingSessions.length).toBe(1);
    expect(enc.chargingSessions[0].status).toBe('Complete');
    expect(enc.chargingSessions[0].energyBasis).toMatch(/estimated/);
  });

  test('unknown columns need confirmation (422); a confirmed mapping is then accepted and traced', () => {
    let csv = 'ts,chan_a,chan_b,chan_c\n';
    for (let i = 0; i < 50; i += 1) csv += `${i},${(3.5 + (i % 5) * 0.01).toFixed(3)},350,${25 + (i % 3)}\n`;
    let err;
    try { parseBuffer(Buffer.from(csv), {}); } catch (e) { err = e; }
    expect(err && err.code).toBe('MAPPING_CONFIRMATION_REQUIRED');
    const r = parseBuffer(Buffer.from(csv), { columnMapping: { time: 'ts', voltage: 'chan_b', temperature: 'chan_c' } });
    expect(r.recordCount).toBe(50);
    expect(r.columnStats.voltage.mean).toBeCloseTo(350, 0);
    expect(r.soh.empirical).toBeNull();
    expect(() => parseBuffer(Buffer.from(csv), { columnMapping: { voltage: 'nope' } })).toThrow();
  });
});
