const xlsx = require('xlsx');
const { parseBuffer } = require('../src/services/csvParserService');
const parse = (s, options = {}) => parseBuffer(Buffer.from(s), options);

test('first discharge is the fixed reference; parser never predicts RUL', () => {
  const r = parse('Cycle,Capacity\n1,2\n2,2.1\n3,1.8\n');
  expect(r.soh.referenceCapacityAh).toBe(2);
  expect(r.soh.empirical).toBe(90);
  expect(r.rul.rulCycles).toBeNull();
  expect(r.curves.predicted).toEqual([]);
});
test('exact duplicates are removed and recorded', () => {
  const r = parse('Cycle,Capacity\n1,2\n1,2\n2,1.9\n');
  expect(r.recordCount).toBe(2);
  expect(r.quality.duplicateRowCount).toBe(1);
});
test.each([
  'Cycle,Capacity\n1,2Ah\n',
  'Cycle,Capacity\n1,Infinity\n',
  'Cycle,Capacity\n1.5,2\n',
  'Cycle,Capacity\n1,-2\n',
  'Cycle,Capacity\n1,2,3\n',
  'Cycle,Capacity,capacity\n1,2,2\n',
  'Cycle,Capacity [mAh]\n1,2000\n',
  'Cycle,Capacity\n1,2\n1,1.9\n',
  'Cycle,Capacity\n1,"2\n',
])('malformed or ambiguous input is rejected: %s', (csv) => expect(() => parse(csv)).toThrow());
test('quoted multiline identifiers and UTF-8 BOM survive CSV decoding', () => {
  const r = parse('\uFEFFbattery_id,Cycle,Capacity\n"cél,\nA",1,2\n');
  expect(r.selectedBatteryId).toBe('cél,\nA');
});
test.each(['xlsx', 'biff8'])('workbook decoding supports %s', (bookType) => {
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet([['Cycle', 'Capacity'], [1, 2], [2, 1.9]]), 'cycles');
  const r = parseBuffer(xlsx.write(book, { type: 'buffer', bookType }));
  expect(r.cycleTable.map((c) => c.capacity)).toEqual([2, 1.9]);
});
test('unknown battery selection is rejected, not silently substituted', () => {
  expect(() => parse('battery_id,Cycle,Capacity\nA,1,2\nB,1,1.9', { targetBatteryId: 'C' })).toThrow('Unknown battery');
});
test('telemetry has no synthetic aging history or integrated capacity', () => {
  const r = parse('time,hv_current,hv_voltage\n0,-2,350\n3600,-2,350\n');
  expect(r.cycleCount).toBe(1);
  expect(r.cycleTable[0].capacity).toBeNull();
  expect(r.soh.empirical).toBeNull();
});

test('declared workbook format and strict quoted numeric tokens are enforced', () => {
  expect(() => parseBuffer(Buffer.from('Cycle,Capacity\n1,2'), { fileName: 'fake.xlsx' })).toThrow('format');
  expect(() => parse('Cycle,Capacity\n1,"2"3')).toThrow();
  expect(() => parse('Cycle,Capacity\n1,0x20')).toThrow();
});

test('quoted final fields remove the closing marker, including escaped quotes', () => {
  const r = parse('Cycle,Capacity,battery_id\n1,"2","demo ""A"""\n2,"1.9","demo ""A"""');
  expect(r.selectedBatteryId).toBe('demo "A"');
  expect(r.cycleTable.map((c) => c.capacity)).toEqual([2, 1.9]);
  expect(parse('Cycle,Capacity\n1,"2"').cycleTable[0].capacity).toBe(2);
});
