const client = require('../src/services/mlClient');
const env = require('../src/config/env');
const cycles = Array.from({ length: 7 }, (_, i) => ({ cycle: i + 1, capacity: 2 - i * 0.02 }));
const response = () => ({ soh: 94, rul: 20, capacity: 1.88, referenceCapacity: 2, currentCycle: 7, eolThreshold: 80,
  status: 'healthy', model: { name: 'Approved fixture', version: 'test', algorithm: 'double' }, factors: [], recommendations: [],
  metrics: { mae: null, rmse: null, r2: null }, confidence: { calibrated: false, value: null } });
const reply = (status, body, type = 'application/json') => new Response(
  typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type } });
const originalUrl = env.ML_SERVICE_URL;
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); env.ML_SERVICE_URL = originalUrl; });
test('ML request preserves the internal wire shape, endpoint, method and valid response', async () => {
  env.ML_SERVICE_URL = 'http://127.0.0.1:8000/';
  const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(reply(200, response()));
  expect((await client.predict({ cycleTable: cycles })).available).toBe(true);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe('http://127.0.0.1:8000/predict');
  expect(options.method).toBe('POST');
  expect(options.headers['Content-Type']).toBe('application/json');
  expect(JSON.parse(options.body)).toEqual({ batteryId: null, cycleTable: cycles, eolThreshold: 80 });
});
test.each([{ rul: -1 }, { soh: NaN }, { capacity: Infinity }, { referenceCapacity: 9 }, { currentCycle: 8 },
  { eolThreshold: 70 }, { model: null }, { rul: 1.5 }, { status: 'critical' }, { metrics: { mae: -1, rmse: 1, r2: 0 } }])('rejects malformed prediction %j', async (change) => {
  jest.spyOn(global, 'fetch').mockResolvedValue(reply(200, { ...response(), ...change }));
  expect(await client.predict({ cycleTable: cycles })).toEqual({ available: false, reason: 'invalid_response' });
});
test.each([
  [503, { detail: { code: 'MODEL_UNAVAILABLE', message: 'No approved artifact' } }, 'service_error_503:MODEL_UNAVAILABLE'],
  [422, { detail: { code: 'INVALID_ML_INPUT', message: 'Cycle gaps' } }, 'service_error_422:INVALID_ML_INPUT'],
  [503, { detail: { code: 'INVALID_MODEL_OUTPUT', message: 'Invalid capacity' } }, 'service_error_503:INVALID_MODEL_OUTPUT'],
  [422, { detail: [{ loc: ['body'], msg: 'Invalid body', type: 'dict_type' }] }, 'service_error_422:REQUEST_VALIDATION_ERROR'],
  [404, { detail: 'Not Found' }, 'service_error_404'],
  [503, {}, 'invalid_error_response'],
  [503, { detail: { code: 'MODEL_UNAVAILABLE' } }, 'invalid_error_response'],
  [500, { detail: { code: 'MODEL_UNAVAILABLE', message: 'Wrong status' } }, 'invalid_error_response'],
])('classifies HTTP %s service responses correctly', async (status, body, reason) => {
  jest.spyOn(global, 'fetch').mockResolvedValue(reply(status, body));
  expect(await client.predict({ cycleTable: cycles })).toEqual({ available: false, reason });
});
test.each([200, 503])('HTML on HTTP %s is not model unavailability', async (status) => {
  jest.spyOn(global, 'fetch').mockResolvedValue(reply(status, '<html>Proxy error</html>', 'text/html'));
  expect((await client.predict({ cycleTable: cycles })).reason).toBe('invalid_response_content_type');
});
test.each([200, 503])('malformed JSON on HTTP %s is distinct from connection failure', async (status) => {
  jest.spyOn(global, 'fetch').mockResolvedValue(reply(status, '{broken'));
  expect((await client.predict({ cycleTable: cycles })).reason).toBe('invalid_json');
});
test('connection refusal remains unreachable, not MODEL_UNAVAILABLE', async () => {
  jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }));
  expect(await client.predict({ cycleTable: cycles })).toEqual({ available: false, reason: 'unreachable' });
});
test.each(['headers', 'body'])('timeout while waiting for %s aborts the request', async (phase) => {
  jest.useFakeTimers();
  jest.spyOn(global, 'fetch').mockImplementation((url, options) => {
    const blocked = () => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }));
    return phase === 'headers' ? blocked() : Promise.resolve({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: blocked });
  });
  const pending = client.predict({ cycleTable: cycles });
  await jest.advanceTimersByTimeAsync(Number(process.env.ML_SERVICE_TIMEOUT_MS || 20000));
  expect(await pending).toEqual({ available: false, reason: 'timeout' });
  expect(jest.getTimerCount()).toBe(0);
});
test('malformed configuration and input fail without making a request', async () => {
  const fetch = jest.spyOn(global, 'fetch');
  env.ML_SERVICE_URL = 'not-a-url';
  expect((await client.predict({ cycleTable: cycles })).reason).toBe('invalid_configuration');
  env.ML_SERVICE_URL = originalUrl;
  expect((await client.predict({ cycleTable: [null, ...cycles] })).reason).toBe('invalid_input');
  expect(fetch).not.toHaveBeenCalled();
});

test.each([
  [2, 1.98, 1.96, 1.94, 1.92, 1.9, 1.6],
  [2, 1.98, 1.96, 1.94, 1.92, 1.6, 1.5],
  [2, 1.98, 1.96, 1.94, 1.92, 1.6, 2.1],
])('terminal history accepts zero RUL but rejects a positive forecast', (...capacities) => {
  const history = capacities.map((capacity, i) => ({ cycle: i + 1, capacity }));
  expect(client.validResponse({ ...response(), rul: 0 }, history)).toBe(true);
  expect(client.validResponse(response(), history)).toBe(false);
});
