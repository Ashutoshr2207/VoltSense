/**
 * Client for the external Python ML service (trained SOH/RUL models).
 *
 * The Node backend never runs models itself. It sends the parsed cycle data
 * to ML_SERVICE_URL and returns the result. When the service is not configured
 * or unreachable, `predict` resolves to { available: false, reason } so the
 * rest of the app can show "analysis unavailable" instead of fake numbers.
 *
 * Expected POST {ML_SERVICE_URL}/predict
 *   request : { cycleTable: [...], eolThreshold: 80, batteryId: string|null }
 *   response: { soh, rul, capacity, status, factors: [], recommendations: [],
 *               confidence?, model: { name, version }, degradation?: { historical, predicted } }
 */
const ML_SERVICE_URL = (process.env.ML_SERVICE_URL || '').replace(/\/$/, '');
const ML_TIMEOUT_MS = Number(process.env.ML_SERVICE_TIMEOUT_MS || 20000);

async function predict({ cycleTable, eolThreshold = 80, batteryId = null }) {
  if (!ML_SERVICE_URL) {
    return { available: false, reason: 'not_configured' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);
  try {
    const res = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cycleTable, eolThreshold, batteryId }),
      signal: controller.signal,
    });
    if (!res.ok) return { available: false, reason: `service_error_${res.status}` };
    const body = await res.json();
    if (typeof body?.soh !== 'number') return { available: false, reason: 'invalid_response' };
    return { available: true, result: body };
  } catch (err) {
    return { available: false, reason: err.name === 'AbortError' ? 'timeout' : 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { predict, isConfigured: () => Boolean(ML_SERVICE_URL) };
