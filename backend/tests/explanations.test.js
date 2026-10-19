const { buildDeterministicExplanation } = require('../src/services/groqService');
test('telemetry-only explanation never calls unknown health critical or prints null percent', () => {
  const result = buildDeterministicExplanation({ soh: null, rul: null, capacity: null, referenceCapacity: null, factors: [], status: 'unknown' });
  expect(result.summary).toMatch(/unavailable/);
  expect(result.sections.meaning).toMatch(/No model health prediction/);
  expect(JSON.stringify(result)).not.toMatch(/null%|critical|normal operational limits/);
});
