// Serializes lifecycle mutations within the supported single backend process.
const pending = new Map();
async function withVehicleLock(vehicleId, work) {
  const key = String(vehicleId);
  const previous = pending.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  pending.set(key, current);
  await previous;
  try { return await work(); }
  finally {
    release();
    if (pending.get(key) === current) pending.delete(key);
  }
}
module.exports = { withVehicleLock };
