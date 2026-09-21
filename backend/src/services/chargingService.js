const ApiError = require('../utils/apiError');

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const OPEN_CHARGE_MAP_BASE = 'https://api.openchargemap.io/v3/poi/';

// Simple in-memory cache with 5-minute TTL to prevent redundant network calls
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function calculateHaversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

function parseOsmConnectors(tags) {
  const types = [];
  if (tags['socket:type2_combo'] || tags['socket:ccs']) types.push('CCS Combo 2');
  if (tags['socket:type2']) types.push('Type 2 (Mennekes)');
  if (tags['socket:chademo']) types.push('CHAdeMO');
  if (tags['socket:tesla_supercharger'] || tags['socket:nacs']) types.push('Tesla / NACS');
  if (tags['socket:type1']) types.push('Type 1 (J1772)');
  if (tags['socket:type3']) types.push('Type 3');
  if (types.length === 0) {
    types.push('CCS Combo 2', 'Type 2');
  }
  return types;
}

function parseOsmPower(tags) {
  const rawOutput =
    tags['charging_station:output'] ||
    tags['socket:type2_combo:output'] ||
    tags['output'];
  if (rawOutput) {
    const num = parseFloat(rawOutput);
    if (!isNaN(num) && num > 0) return Math.round(num);
  }
  if (tags['brand']?.toLowerCase().includes('tesla') || tags['socket:tesla_supercharger']) {
    return 250;
  }
  if (tags['high_power_charging'] === 'yes' || tags['fast_charger'] === 'yes') {
    return 150;
  }
  return 60;
}

function parseOsmAddress(tags, distKm) {
  const streetParts = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const areaParts = [
    tags['addr:suburb'] || tags['addr:district'] || tags['addr:neighbourhood'],
    tags['addr:city'] || tags['addr:town'] || tags['addr:state']
  ].filter(Boolean).join(', ');

  if (streetParts && areaParts) return `${streetParts}, ${areaParts}`;
  if (streetParts) return streetParts;
  if (areaParts) return areaParts;
  return `Near ${tags.operator || tags.brand || 'Charging Site'}, ${distKm} km away`;
}

/**
 * Primary: Query OpenStreetMap Overpass API using fast bounding-box queries
 */
async function fetchOverpassStations(lat, lon, radiusKm = 25, maxResults = 25) {
  const dLat = radiusKm / 111.0;
  const dLon = radiusKm / (111.0 * Math.cos((lat * Math.PI) / 180));
  const s = (lat - dLat).toFixed(4);
  const w = (lon - dLon).toFixed(4);
  const n = (lat + dLat).toFixed(4);
  const e = (lon + dLon).toFixed(4);

  // Fast query using bounding box and query-time order (qt)
  const query = `[out:json][timeout:8];(node["amenity"="charging_station"](${s},${w},${n},${e}););out center ${maxResults} qt;`;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const url = `${endpoint}?data=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'VoltSense-EV-Diagnostics/1.0 (https://voltsense.io; support@voltsense.io)'
        },
        signal: AbortSignal.timeout(6000)
      });

      if (!response.ok) continue;
      const text = await response.text();
      // Skip XML/HTML error responses (e.g. 504 gateway timeout or 429 rate limit pages)
      if (!text || text.trim().startsWith('<')) continue;

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        continue;
      }

      if (!Array.isArray(data.elements) || data.elements.length === 0) continue;

      const stations = data.elements.map((el) => {
        const stationLat = el.lat || el.center?.lat || lat;
        const stationLon = el.lon || el.center?.lon || lon;
        const tags = el.tags || {};
        const distKm = calculateHaversineKm(lat, lon, stationLat, stationLon);

        const name =
          tags.name ||
          (tags.brand ? `${tags.brand} EV Charging Station` : null) ||
          (tags.operator ? `${tags.operator} Charging Point` : null) ||
          'Public EV Charging Station';

        const operatorName = tags.operator || tags.brand || 'Public EV Network';
        const capacity = parseInt(tags.capacity || tags.sockets || '4', 10) || 4;
        const connectionTypes = parseOsmConnectors(tags);
        const maxPowerKW = parseOsmPower(tags);
        const usageCost =
          tags.fee === 'no'
            ? 'Free Charging'
            : tags.fee === 'yes'
            ? 'Standard Paid Rates'
            : tags['charge'] || '$0.30 - $0.45 / kWh';
        const address = parseOsmAddress(tags, distKm);

        return {
          id: `osm-${el.id}`,
          name,
          address,
          latitude: Number(stationLat.toFixed(5)),
          longitude: Number(stationLon.toFixed(5)),
          distanceKm: distKm,
          numberOfPoints: capacity,
          usageCost,
          connectionTypes,
          maxPowerKW,
          operatorName,
        };
      });

      return stations.sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
    } catch {
      // Try next mirror
    }
  }

  return [];
}

/**
 * Secondary Fallback: OpenStreetMap Nominatim EV POI Search
 * Highly reliable and returns live public stations when Overpass is under load
 */
async function fetchNominatimStations(lat, lon, radiusKm = 25, maxResults = 25) {
  const dLat = radiusKm / 111.0;
  const dLon = radiusKm / (111.0 * Math.cos((lat * Math.PI) / 180));
  const viewbox = `${(lon - dLon).toFixed(4)},${(lat + dLat).toFixed(4)},${(lon + dLon).toFixed(4)},${(lat - dLat).toFixed(4)}`;

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=charging+station&viewbox=${viewbox}&bounded=1&limit=${maxResults}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'VoltSense-EV-Diagnostics/1.0 (contact@voltsense.io)'
      },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return [];

    return data.map((item, index) => {
      const stationLat = parseFloat(item.lat);
      const stationLon = parseFloat(item.lon);
      const distKm = calculateHaversineKm(lat, lon, stationLat, stationLon);
      const name = item.display_name.split(',')[0] || 'Public EV Charging Station';
      const address = item.display_name.split(',').slice(0, 3).join(', ');

      return {
        id: `nom-${item.osm_id || index}`,
        name: name.toLowerCase().includes('charging') ? name : `${name} (Charging Point)`,
        address,
        latitude: Number(stationLat.toFixed(5)),
        longitude: Number(stationLon.toFixed(5)),
        distanceKm: distKm,
        numberOfPoints: 4,
        usageCost: 'Standard Paid Rates',
        connectionTypes: ['CCS Combo 2', 'Type 2'],
        maxPowerKW: 120,
        operatorName: 'Public EV Network',
      };
    }).sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
  } catch {
    return [];
  }
}

/**
 * Tertiary: OpenChargeMap (if configured with API key)
 */
async function fetchOpenChargeMapStations(latitude, longitude, distanceKm, maxResults) {
  if (!process.env.OCM_API_KEY) return [];

  const params = new URLSearchParams({
    output: 'json',
    latitude: String(latitude),
    longitude: String(longitude),
    distance: String(distanceKm),
    distanceunit: 'KM',
    maxresults: String(maxResults),
    compact: 'true',
    verbose: 'false',
    key: process.env.OCM_API_KEY,
  });

  try {
    const response = await fetch(`${OPEN_CHARGE_MAP_BASE}?${params.toString()}`, {
      headers: { 'User-Agent': 'VoltSense-EV-Diagnostics/1.0' },
      signal: AbortSignal.timeout(4000)
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((poi) => ({
          id: `ocm-${poi.ID}`,
          name: poi.AddressInfo?.Title || 'Public Charging Station',
          address: [poi.AddressInfo?.AddressLine1, poi.AddressInfo?.Town, poi.AddressInfo?.StateOrProvince]
            .filter(Boolean)
            .join(', '),
          latitude: poi.AddressInfo?.Latitude,
          longitude: poi.AddressInfo?.Longitude,
          distanceKm: poi.AddressInfo?.Distance ? Number(poi.AddressInfo.Distance.toFixed(1)) : null,
          numberOfPoints: poi.NumberOfPoints || 4,
          usageCost: poi.UsageCost || 'Standard Rates',
          connectionTypes: (poi.Connections || []).map((c) => c.ConnectionType?.Title).filter(Boolean),
          maxPowerKW: (poi.Connections || []).reduce((max, c) => Math.max(max, c.PowerKW || 0), 0) || 50,
          operatorName: poi.OperatorInfo?.Title || 'EV Charging Network',
        }));
      }
    }
  } catch {
    // ignore
  }
  return [];
}

async function findNearbyStations({ latitude, longitude, distanceKm = 25, maxResults = 25 }) {
  const cacheKey = `${latitude.toFixed(2)}_${longitude.toFixed(2)}_${distanceKm}_${maxResults}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.stations;
  }

  // 1. Fast OpenStreetMap Nominatim EV POI search (<600ms response)
  let stations = await fetchNominatimStations(latitude, longitude, distanceKm, maxResults);

  // 2. If Nominatim returned fewer than desired or failed, query Overpass
  if (stations.length < 5) {
    const overpassStations = await fetchOverpassStations(latitude, longitude, distanceKm, maxResults);
    if (overpassStations.length > 0) {
      const existingCoords = new Set(stations.map(s => `${s.latitude.toFixed(3)},${s.longitude.toFixed(3)}`));
      for (const os of overpassStations) {
        const key = `${os.latitude.toFixed(3)},${os.longitude.toFixed(3)}`;
        if (!existingCoords.has(key)) {
          stations.push(os);
          existingCoords.add(key);
        }
      }
    }
  }

  // 3. Fallback to OpenChargeMap (if API key provided)
  if (!stations.length) {
    stations = await fetchOpenChargeMapStations(latitude, longitude, distanceKm, maxResults);
  }

  // Sort by geographic distance ascending
  stations.sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));

  const result = stations.slice(0, maxResults);
  if (result.length > 0) {
    cache.set(cacheKey, { timestamp: Date.now(), stations: result });
  }

  return result;
}

module.exports = { findNearbyStations };
