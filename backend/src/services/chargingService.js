/**
 * Charging station discovery (API based, no ML).
 * Order: Open Charge Map (needs OCM_API_KEY) -> OpenStreetMap Overpass -> clean "unavailable" result.
 * Unknown fields are returned as null / [] and are never invented.
 */
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OCM_URL = 'https://api.openchargemap.io/v3/poi/';
const USER_AGENT = 'VoltSense/1.0 (EV battery analytics application)';
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();
let warnedNoKey = false;

const haversineKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Number((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));
};

async function fetchOpenChargeMap(lat, lon, distanceKm, maxResults) {
  const key = process.env.OCM_API_KEY;
  if (!key) {
    if (!warnedNoKey) { console.warn('Open Charge Map API key not configured; using fallback charging provider.'); warnedNoKey = true; }
    return [];
  }
  const params = new URLSearchParams({
    output: 'json', latitude: String(lat), longitude: String(lon), distance: String(distanceKm),
    distanceunit: 'KM', maxresults: String(maxResults), compact: 'true', verbose: 'false',
  });
  try {
    const res = await fetch(`${OCM_URL}?${params}`, {
      headers: { 'User-Agent': USER_AGENT, 'X-API-Key': key },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { console.warn(`Open Charge Map request failed (${res.status})`); return []; }
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.filter((p) => p.AddressInfo && Number.isFinite(p.AddressInfo.Latitude) && Number.isFinite(p.AddressInfo.Longitude)).map((p) => {
      const a = p.AddressInfo;
      const conns = p.Connections || [];
      const power = conns.map((c) => c.PowerKW).filter((x) => Number.isFinite(x) && x > 0);
      return {
        id: `ocm-${p.ID}`,
        name: a.Title || 'Charging station',
        address: [a.AddressLine1, a.Town, a.StateOrProvince].filter(Boolean).join(', ') || null,
        latitude: a.Latitude, longitude: a.Longitude,
        distanceKm: Number.isFinite(a.Distance) ? Number(a.Distance.toFixed(1)) : haversineKm(lat, lon, a.Latitude, a.Longitude),
        operatorName: p.OperatorInfo?.Title || null,
        connectionTypes: [...new Set(conns.map((c) => c.ConnectionType?.Title).filter(Boolean))],
        maxPowerKW: power.length ? Math.max(...power) : null,
        numberOfPoints: Number.isFinite(p.NumberOfPoints) ? p.NumberOfPoints : null,
        usageCost: p.UsageCost || null,
        status: p.StatusType?.Title || null,
        source: 'openchargemap',
      };
    });
  } catch (err) {
    console.warn(`Open Charge Map request failed: ${err.name}`);
    return [];
  }
}

const osmConnectors = (t) => {
  const out = [];
  if (t['socket:type2_combo'] || t['socket:ccs']) out.push('CCS');
  if (t['socket:type2']) out.push('Type 2');
  if (t['socket:chademo']) out.push('CHAdeMO');
  if (t['socket:tesla_supercharger'] || t['socket:nacs']) out.push('NACS');
  if (t['socket:type1']) out.push('Type 1');
  return out;
};

async function fetchOverpass(lat, lon, radiusKm, maxResults) {
  const dLat = radiusKm / 111.0;
  const dLon = radiusKm / (111.0 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  const bbox = [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map((n) => n.toFixed(4)).join(',');
  const query = `[out:json][timeout:8];node["amenity"="charging_station"](${bbox});out ${maxResults} qt;`;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(7000) });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || text.trim().startsWith('<')) continue;
      const data = JSON.parse(text);
      if (!Array.isArray(data.elements) || !data.elements.length) continue;
      return data.elements.filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lon)).map((e) => {
        const t = e.tags || {};
        const kw = parseFloat(t['charging_station:output'] || t.output);
        const addr = [[t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '), t['addr:city'] || t['addr:town']].filter(Boolean).join(', ');
        return {
          id: `osm-${e.id}`,
          name: t.name || (t.brand ? `${t.brand} charging` : t.operator ? `${t.operator} charging` : 'Charging station'),
          address: addr || null, latitude: e.lat, longitude: e.lon, distanceKm: haversineKm(lat, lon, e.lat, e.lon),
          operatorName: t.operator || t.brand || null, connectionTypes: osmConnectors(t),
          maxPowerKW: Number.isFinite(kw) && kw > 0 ? Math.round(kw) : null,
          numberOfPoints: parseInt(t.capacity, 10) || null,
          usageCost: t.fee === 'no' ? 'Free' : t.fee === 'yes' ? 'Paid' : null,
          status: null, source: 'openstreetmap',
        };
      });
    } catch { /* try next mirror */ }
  }
  return [];
}

async function findNearbyStations({ latitude, longitude, distanceKm = 25, maxResults = 25 }) {
  const radius = Math.min(100, Math.max(1, Number(distanceKm) || 25));
  const limit = Math.min(50, Math.max(1, Number(maxResults) || 25));
  const key = `${latitude.toFixed(2)}_${longitude.toFixed(2)}_${radius}_${limit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_TTL_MS) return hit.value;

  let stations = await fetchOpenChargeMap(latitude, longitude, radius, limit);
  let source = 'openchargemap';
  if (!stations.length) { stations = await fetchOverpass(latitude, longitude, radius, limit); source = 'openstreetmap'; }
  let value;
  if (!stations.length) {
    value = { stations: [], total: 0, source: 'unavailable', message: 'Charging station data is currently unavailable.' };
  } else {
    stations.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    stations = stations.slice(0, limit);
    value = { stations, total: stations.length, source };
    cache.set(key, { t: Date.now(), value });
  }
  return value;
}

module.exports = { findNearbyStations };
