const env = require('../config/env');
const FEATURES = ['cycle_idx', 'log_cycle', 'cycle_squared', 'cycle_sqrt', 'cap_lag1', 'cap_lag2', 'cap_lag5',
  'cap_roll3', 'cap_roll5', 'deg_rate', 'deg_rate5', 'initial_cap', 'cap_drop_pct'];
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
function validResponse(body, cycleTable) {
  if (!body || !finite(body.soh) || body.soh < 0 || body.soh > 100 || !Number.isSafeInteger(body.rul) || body.rul < 0
    || !finite(body.capacity) || body.capacity <= 0 || !finite(body.referenceCapacity) || body.referenceCapacity <= 0
    || !Number.isSafeInteger(body.currentCycle + body.rul) || body.currentCycle !== cycleTable.at(-1).cycle || body.eolThreshold !== 80
    || Math.abs(body.referenceCapacity - cycleTable[0].capacity) > 1e-6
    || Math.abs(body.soh - Math.min(100, body.capacity / body.referenceCapacity * 100)) > 0.11
    || !['healthy', 'attention', 'critical'].includes(body.status)
    || !['name', 'version', 'algorithm'].every((key) => typeof body.model?.[key] === 'string' && body.model[key].length > 0)
    || !Array.isArray(body.factors) || !Array.isArray(body.recommendations)
    || !body.recommendations.every((r) => typeof r === 'string')
    || !body.factors.every((f) => f && typeof f === 'object' && typeof f.name === 'string' && typeof f.explanation === 'string')) return false;
  const expectedStatus = body.soh >= 90 ? 'healthy' : body.soh >= 80 ? 'attention' : 'critical';
  if (body.status !== expectedStatus || (cycleTable.some((c) => c.capacity / body.referenceCapacity <= 0.8) && body.rul !== 0)) return false;
  if (!body.metrics || !['mae', 'rmse', 'r2'].every((k) => body.metrics[k] === null || finite(body.metrics[k]))) return false;
  if ((body.metrics.mae != null && body.metrics.mae < 0) || (body.metrics.rmse != null && body.metrics.rmse < 0)) return false;
  if (!body.confidence || body.confidence.calibrated !== false || body.confidence.value !== null) return false;
  return true;
}
// Keep transport, decoding, service errors and valid predictions distinct.
async function predict({ cycleTable, eolThreshold = 80, batteryId = null }) {
  const url = String(env.ML_SERVICE_URL || '').trim().replace(/\/+$/, '');
  if (!url) return { available: false, reason: 'not_configured' };
  try {
    const configured = new URL(url);
    if (!['http:', 'https:'].includes(configured.protocol) || configured.search || configured.hash || configured.username || configured.password) throw new Error('Invalid base URL');
  } catch (_) { return { available: false, reason: 'invalid_configuration' }; }
  if (!Array.isArray(cycleTable) || cycleTable.length < 7 || eolThreshold !== 80
    || !cycleTable.every((c, i) => c && c.cycle === i + 1 && finite(c.capacity) && c.capacity > 0)) return { available: false, reason: 'invalid_input' };
  const controller = new AbortController();
  const timeout = Number(process.env.ML_SERVICE_TIMEOUT_MS || 20000);
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeout) && timeout > 0 ? timeout : 20000);
  const timedOut = (err) => controller.signal.aborted || err?.name === 'AbortError' || err?.name === 'TimeoutError';
  try {
    let res;
    try {
      res = await fetch(url + '/predict', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycleTable, eolThreshold, batteryId }), signal: controller.signal });
    } catch (err) {
      return { available: false, reason: timedOut(err) ? 'timeout' : 'unreachable' };
    }
    const contentType = res.headers?.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (contentType !== 'application/json') return { available: false, reason: 'invalid_response_content_type' };
    let body;
    try { body = await res.json(); }
    catch (err) { return { available: false, reason: timedOut(err) ? 'timeout' : 'invalid_json' }; }
    if (!res.ok) {
      const detail = body?.detail;
      if (Array.isArray(detail) && res.status === 422) return { available: false, reason: 'service_error_422:REQUEST_VALIDATION_ERROR' };
      if (typeof detail === 'string') return { available: false, reason: 'service_error_' + res.status };
      const code = detail?.code;
      if (typeof code !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(code)
        || typeof detail.message !== 'string'
        || (code === 'MODEL_UNAVAILABLE' && res.status !== 503)
        || (code === 'INVALID_ML_INPUT' && res.status !== 422)
        || (code === 'INVALID_MODEL_OUTPUT' && res.status !== 503)) {
        return { available: false, reason: 'invalid_error_response' };
      }
      return { available: false, reason: 'service_error_' + res.status + ':' + code };
    }
    if (res.status !== 200 || !validResponse(body, cycleTable)) return { available: false, reason: 'invalid_response' };
    return { available: true, result: body };
  } finally { clearTimeout(timer); }
}
module.exports = { predict, validResponse, FEATURES, isConfigured: () => Boolean(env.ML_SERVICE_URL) };
