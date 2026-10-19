// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { waitForProcessing } from '../src/api/datasetApi';
import { mapVehicle, mergeVehicleDetail, mapPredictionRow } from '../src/utils/mappers';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function mockStates(states) {
  const fetch = vi.fn();
  for (const state of states) fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: state }) });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
const run = (status, extra = {}) => ({ id: 'run1', status, stages: {}, ...extra });
test('polls until the actual run commits; does not infer success from elapsed time', async () => {
  const fetch = mockStates([{ status: 'processing', pipelineRun: run('processing') }, { status: 'processed', pipelineRun: run('completed') }]);
  const result = await waitForProcessing('dataset', { pipelineRunId: 'run1', intervalMs: 0 });
  expect(result.status).toBe('processed'); expect(fetch).toHaveBeenCalledTimes(2);
});
test('pipeline errors and changed attempts are surfaced', async () => {
  mockStates([{ status: 'failed', pipelineRun: run('failed', { errors: ['MODEL_UNAVAILABLE'] }) }]);
  await expect(waitForProcessing('dataset')).rejects.toThrow('MODEL_UNAVAILABLE');
  mockStates([{ status: 'processing', pipelineRun: run('processing', { id: 'different' }) }]);
  await expect(waitForProcessing('dataset', { pipelineRunId: 'run1' })).rejects.toThrow('different processing attempt');
});
test('polling timeout says processing is ongoing, never completed', async () => {
  mockStates([{ status: 'processing', pipelineRun: run('processing') }]);
  await expect(waitForProcessing('dataset', { timeoutMs: 0 })).rejects.toThrow('still running');
});
test('measured and model SOH remain distinct and null remains unknown', () => {
  const vehicle = mapVehicle({ id: 'v', latestSOH: null, manufacturer: 'Tesla', model: '3' });
  const prediction = { prediction: { soh: 90, modelSoh: 90, measuredSoh: 92 }, cycleTable: [] };
  const result = mergeVehicleDetail(vehicle, { prediction });
  expect(result.empiricalSoh).toBe(92); expect(result.modelSoh).toBe(90);
  expect(mapPredictionRow(prediction, vehicle).measuredSoh).toBe(92);
  expect(mergeVehicleDetail(vehicle, { prediction: { prediction: { soh: null } } }).empiricalSoh).toBeNull();
});

test.each(['unreachable', 'timeout', 'invalid_response_content_type', 'invalid_json',
  'service_error_503:MODEL_UNAVAILABLE', 'service_error_422:INVALID_ML_INPUT'])('preserves ML failure reason %s for the upload display', async (reason) => {
  const message = 'ML inference unavailable: ' + reason;
  mockStates([{ status: 'failed', pipelineRun: run('failed', { errors: [message] }) }]);
  await expect(waitForProcessing('dataset')).rejects.toThrow(message);
});

test('zero remaining cycles and the original observed EOL survive frontend mapping', () => {
  const vehicle = mapVehicle({ id: 'v', latestRUL: 0, currentCycleCount: 8 });
  const prediction = { prediction: { rulCycles: 0, currentCycle: 8, estimatedEOLCycle: 7 }, cycleTable: [] };
  expect(vehicle.rul).toBe(0);
  expect(mapPredictionRow(prediction, vehicle).rulCycles).toBe(0);
  expect(mergeVehicleDetail(vehicle, { prediction }).estimatedEOLCycle).toBe(7);
});

test('another completed attempt cannot publish progress or satisfy the initiated run', async () => {
  mockStates([{ status: 'processed', pipelineRun: run('completed', { id: 'newer-run' }) }]);
  const onStatus = vi.fn();
  await expect(waitForProcessing('dataset', { pipelineRunId: 'run1', onStatus })).rejects.toThrow('different processing attempt');
  expect(onStatus).not.toHaveBeenCalled();
});
