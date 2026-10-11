import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { findNearbyChargingStations } from '../api/chargingApi';
import useVehicleDetail from '../hooks/useVehicleDetail';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const REFERENCE_WH_PER_KM = 160;
const SAFETY_RESERVE = 0.10; // 10% safety reserve buffer

export default function ChargingMap() {
  const { vehicles } = useApp();
  const vehicle = vehicles[0] || null;

  // Manual battery percentage state (defaults to 25% or vehicle SOC)
  const [batteryPercent, setBatteryPercent] = useState(25);
  // Use the latest REAL SOC from an uploaded analysis when one exists; otherwise the slider is a manual input only.
  const { vehicle: detail } = useVehicleDetail();
  const realSoc = typeof detail?.soc === 'number' && Number.isFinite(detail.soc) ? Math.round(detail.soc) : null;
  const socTouchedRef = useRef(false);
  useEffect(() => {
    if (realSoc !== null && !socTouchedRef.current) setBatteryPercent(Math.max(1, Math.min(100, realSoc)));
  }, [realSoc]);

  // Location state
  const [coords, setCoords] = useState(null);
  const [locationName, setLocationName] = useState('');
  const [inputLocation, setInputLocation] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState('Acquiring location… Click Live GPS or type your city/address.');

  // Charging stations state
  const [stations, setStations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [radiusKm, setRadiusKm] = useState(25);
  const [filterType, setFilterType] = useState('all'); // 'all' | 'reachable' | 'fast'
  const [selectedStationId, setSelectedStationId] = useState(null);

  // Map DOM and Leaflet References
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const lastFitSigRef = useRef('');

  // Calculate pack capacity and usable range based on typed battery percent with safety reserve
  const capacityKWh = vehicle?.capacityKWh || 75;
  const rawRangeKm = (capacityKWh * (batteryPercent / 100) * 1000) / REFERENCE_WH_PER_KM;
  const usableRangeKm = Math.round(rawRangeKm * (1 - SAFETY_RESERVE));
  const isLowBattery = batteryPercent <= 20;
  const isHighBattery = batteryPercent >= 90;

  // Browser GPS Locate function
  const locateMe = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('Geolocation is not supported by this browser. Please type your city/address above.');
      return;
    }
    setIsLocating(true);
    setLocationStatus('Accessing live GPS location…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newCoords = {
          lat: Number(position.coords.latitude.toFixed(5)),
          lon: Number(position.coords.longitude.toFixed(5)),
        };
        setCoords(newCoords);
        setLocationName(`Live GPS (${newCoords.lat.toFixed(3)}°, ${newCoords.lon.toFixed(3)}°)`);
        setLocationStatus('Using live GPS location.');
        setIsLocating(false);
      },
      () => {
        setLocationStatus('GPS location access was denied. Please type your city, address, or coordinates.');
        setIsLocating(false);
      },
      { timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  // Try locating on first mount
  useEffect(() => {
    locateMe();
  }, [locateMe]);

  // Geocode user-typed location (lat,lon or city)
  const handleLocationSubmit = async (e) => {
    if (e) e.preventDefault();
    const query = inputLocation.trim();
    if (!query) return;

    const latLonMatch = query.match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/);
    if (latLonMatch) {
      const lat = Number(parseFloat(latLonMatch[1]).toFixed(5));
      const lon = Number(parseFloat(latLonMatch[3]).toFixed(5));
      setCoords({ lat, lon });
      setLocationName(query);
      setLocationStatus(`Centered on coordinates: ${lat}, ${lon}`);
      return;
    }

    setIsLocating(true);
    setLocationStatus(`Searching for "${query}"…`);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
        { headers: { 'User-Agent': 'VoltSense-EV-Diagnostics/1.0' } }
      );
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const place = data[0];
        const newCoords = {
          lat: Number(parseFloat(place.lat).toFixed(5)),
          lon: Number(parseFloat(place.lon).toFixed(5)),
        };
        setCoords(newCoords);
        setLocationName(place.display_name.split(',').slice(0, 2).join(','));
        setLocationStatus(`Located: ${place.display_name.split(',').slice(0, 3).join(',')}`);
      } else {
        setLocationStatus(`Could not find "${query}". Please check spelling or enter city name.`);
      }
    } catch {
      setLocationStatus('Geocoding request failed. Please check your internet connection.');
    } finally {
      setIsLocating(false);
    }
  };

  // Fetch nearby charging stations
  const searchStations = useCallback(async () => {
    if (!coords) return;
    setIsLoading(true);
    setFetchError('');
    try {
      const result = await findNearbyChargingStations(coords.lat, coords.lon, radiusKm);
      setStations(result.stations || []);
    } catch (error) {
      setFetchError('Unable to retrieve nearby charging stations right now.');
    } finally {
      setIsLoading(false);
    }
  }, [coords, radiusKm]);

  useEffect(() => {
    if (coords) {
      searchStations();
    }
  }, [coords, searchStations]);

  // Evaluate reachability of each station
  const processedStations = useMemo(() => {
    return stations.map((s) => {
      const dist = s.distanceKm || 0;
      let reachStatus = 'reachable';
      let reachLabel = 'Reachable';

      if (dist > usableRangeKm) {
        reachStatus = 'out_of_range';
        reachLabel = `Out of range (+${(dist - usableRangeKm).toFixed(0)} km deficit)`;
      } else if (dist > usableRangeKm * 0.75) {
        reachStatus = 'tight';
        reachLabel = `Tight reach (Reserve: ${(usableRangeKm - dist).toFixed(0)} km)`;
      } else {
        reachStatus = 'safe';
        reachLabel = `Safe reach (Reserve: ${(usableRangeKm - dist).toFixed(0)} km)`;
      }

      return {
        ...s,
        reachStatus,
        reachLabel,
      };
    });
  }, [stations, usableRangeKm]);

  // Battery-aware station recommendation
  const { topSuggestedStation, noneReachableWarning } = useMemo(() => {
    if (!processedStations.length) return { topSuggestedStation: null, noneReachableWarning: false };
    const reachable = processedStations.filter((s) => s.reachStatus !== 'out_of_range');

    if (reachable.length) {
      if (batteryPercent <= 20) {
        const sorted = reachable.slice().sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
        return { topSuggestedStation: sorted[0], noneReachableWarning: false };
      }
      if (batteryPercent <= 60) {
        const sorted = reachable.slice().sort((a, b) => {
          const distDiff = (a.distanceKm || 0) - (b.distanceKm || 0);
          if (Math.abs(distDiff) < 3) {
            return (b.maxPowerKW || 0) - (a.maxPowerKW || 0);
          }
          return distDiff;
        });
        return { topSuggestedStation: sorted[0], noneReachableWarning: false };
      }
      const sorted = reachable.slice().sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
      return { topSuggestedStation: sorted[0], noneReachableWarning: false };
    }

    const closestAbsolute = processedStations.slice().sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0))[0];
    return { topSuggestedStation: closestAbsolute, noneReachableWarning: true };
  }, [processedStations, batteryPercent]);

  // Filtered stations for display
  const filteredStations = useMemo(() => {
    let list = processedStations;
    if (filterType === 'reachable') {
      list = processedStations.filter((s) => s.reachStatus !== 'out_of_range');
    } else if (filterType === 'fast') {
      list = processedStations.filter((s) => (s.maxPowerKW || 0) >= 100);
    }

    return list.slice().sort((a, b) => {
      const aReachable = a.reachStatus !== 'out_of_range' ? 1 : 0;
      const bReachable = b.reachStatus !== 'out_of_range' ? 1 : 0;
      if (aReachable !== bReachable) return bReachable - aReachable;
      return (a.distanceKm || 0) - (b.distanceKm || 0);
    });
  }, [processedStations, filterType]);

  // Initialize and synchronize Leaflet interactive map
  useEffect(() => {
    if (!coords || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [coords.lat, coords.lon],
        zoom: 12,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      mapInstanceRef.current = map;
    } else {
    }

    // Clear old markers
    markersRef.current.forEach((m) => m.marker.remove());
    markersRef.current = [];

    // Add user EV location pin
    const userIcon = L.divIcon({
      className: 'custom-user-pin',
      html: `<div style="width:34px;height:34px;border-radius:50%;background:#0284c7;color:#ffffff;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,0.35);border:3px solid #ffffff;font-size:18px;">▲</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });

    const userMarker = L.marker([coords.lat, coords.lon], { icon: userIcon })
      .bindPopup(`<div style="font-family:sans-serif;font-size:12px;font-weight:600;padding:2px;">Your EV Location</div>`)
      .addTo(mapInstanceRef.current);

    markersRef.current.push({ id: 'user', marker: userMarker });

    // Add station markers
    filteredStations.forEach((station) => {
      if (!Number.isFinite(Number(station.latitude)) || !Number.isFinite(Number(station.longitude))) return;

      const bg = station.reachStatus === 'safe' ? '#16a34a' : station.reachStatus === 'tight' ? '#d97706' : '#dc2626';
      const isSelected = selectedStationId === station.id;

      const stationIcon = L.divIcon({
        className: 'custom-station-pin',
        html: `<div style="width:${isSelected ? '36px' : '28px'};height:${isSelected ? '36px' : '28px'};border-radius:50%;background:${bg};color:#ffffff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid #ffffff;font-weight:bold;font-size:12px;">⚡</div>`,
        iconSize: isSelected ? [36, 36] : [28, 28],
        iconAnchor: isSelected ? [18, 18] : [14, 14],
      });

      const popupHtml = `
        <div style="font-family:sans-serif;min-width:190px;padding:4px;">
          <div style="font-weight:700;font-size:13px;color:#1c1e21;margin-bottom:2px;">${station.name}</div>
          <div style="font-size:11px;color:#6b7280;margin-bottom:6px;">${station.address || 'Address on file'}</div>
          <div style="display:flex;gap:4px;margin-bottom:8px;font-size:11px;">
            <span style="background:#e0f2fe;color:#0369a1;padding:2px 6px;border-radius:4px;font-weight:600;">${station.distanceKm} km</span>
            ${station.maxPowerKW ? `<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-weight:600;">${station.maxPowerKW} kW</span>` : ''}
          </div>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#0284c7;color:#ffffff;padding:5px 12px;border-radius:6px;text-decoration:none;font-size:11px;font-weight:600;">
            Get Directions
          </a>
        </div>
      `;

      const marker = L.marker([station.latitude, station.longitude], { icon: stationIcon })
        .bindPopup(popupHtml)
        .addTo(mapInstanceRef.current);

      marker.on('click', () => {
        setSelectedStationId(station.id);
      });

      markersRef.current.push({ id: station.id, marker });
    });

    // Keep the selected station's popup open after markers are rebuilt
    const selectedObj = markersRef.current.find((m) => m.id === selectedStationId);
    if (selectedObj) selectedObj.marker.openPopup();

    // Fit the map so EVERY returned marker (plus the user's position) is visible.
    // Only re-fit when the location or the visible station set changes, not on selection.
    const fitSig = `${coords.lat},${coords.lon}|${filteredStations.map((st) => st.id).join(',')}`;
    if (fitSig !== lastFitSigRef.current) {
      lastFitSigRef.current = fitSig;
      const pts = [[coords.lat, coords.lon]];
      filteredStations.forEach((st) => {
        if (Number.isFinite(Number(st.latitude)) && Number.isFinite(Number(st.longitude))) {
          pts.push([Number(st.latitude), Number(st.longitude)]);
        }
      });
      mapInstanceRef.current.invalidateSize();
      if (pts.length > 1) mapInstanceRef.current.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
    }
  }, [coords, filteredStations, selectedStationId]);

  // Clean up map instance on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const handleSelectStation = (station) => {
    setSelectedStationId(station.id);
    if (mapInstanceRef.current && station.latitude && station.longitude) {
      mapInstanceRef.current.flyTo([station.latitude, station.longitude], 14, { duration: 1.0 });
      const targetMarkerObj = markersRef.current.find((m) => m.id === station.id);
      if (targetMarkerObj) {
        targetMarkerObj.marker.openPopup();
      }
    }
  };

  return (
    <div className="flex flex-col w-full pb-space-4xl gap-space-lg">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
        <div className="flex flex-col gap-space-2xs">
          <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">
            <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse"></span>
            <span>EV Charging Intelligence</span>
            <span className="text-outline">/</span>
            <span className="text-primary font-semibold">Range & Station Matcher</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
            Charging Station Finder
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
            Type your current battery percentage and location to discover matching nearby public charging hubs.
          </p>
        </div>

        {/* Dynamic Battery & Range Badge */}
        <div className="flex items-center gap-space-sm self-start md:self-auto bg-surface-container-low px-space-md py-space-sm rounded-xl shadow-sm border border-surface-container-highest/60">
          <div className="flex flex-col text-right">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
              Estimated Range ({batteryPercent}%, set manually)
            </span>
            <span className="font-telemetry-sm text-telemetry-sm text-on-surface font-semibold font-mono">
              ~{usableRangeKm} km ({capacityKWh} kWh pack)
            </span>
          </div>
          <div className="h-7 w-px bg-surface-container-highest"></div>
          <span className={`material-symbols-outlined text-[24px] ${isLowBattery ? 'text-error animate-bounce' : 'text-primary'}`}>
            {isLowBattery ? 'battery_alert' : 'battery_charging_full'}
          </span>
        </div>
      </div>

      {/* Manual Input Controls Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md bg-surface-container-lowest p-space-lg rounded-2xl shadow-sm border border-surface-container-highest/60">
        {/* Battery Percentage Manual Input */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-space-xs border-b lg:border-b-0 lg:border-r border-surface-container-highest/60 pb-space-md lg:pb-0 lg:pr-space-md">
          <div className="flex items-center justify-between">
            <label htmlFor="battery-input" className="font-label-sm text-label-sm text-on-surface font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <span className="material-symbols-outlined text-primary text-[18px]">battery_saver</span>
              Your Current Battery %
            </label>
            <span className={`font-mono text-base font-bold ${isLowBattery ? 'text-error' : 'text-primary'}`}>
              {batteryPercent}%
            </span>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="battery-input"
              type="number"
              min="1"
              max="100"
              value={batteryPercent}
              onChange={(e) => { socTouchedRef.current = true; setBatteryPercent(Math.max(1, Math.min(100, Number(e.target.value) || 1))); }}
              className="w-20 h-10 px-3 bg-surface-container-low text-on-surface font-mono font-bold rounded-lg border border-surface-container-highest/80 focus:ring-1 focus:ring-primary focus:outline-none text-center"
            />
            <input
              type="range"
              min="1"
              max="100"
              value={batteryPercent}
              onChange={(e) => { socTouchedRef.current = true; setBatteryPercent(Number(e.target.value)); }}
              className="flex-1 accent-primary cursor-pointer h-2"
            />
          </div>

          {/* Quick presets */}
          <div className="flex items-center gap-1.5 pt-1">
            <span className="text-[11px] text-on-surface-variant font-medium mr-1">Quick:</span>
            {[10, 20, 50, 80, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setBatteryPercent(pct)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-colors cursor-pointer ${
                  batteryPercent === pct
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-low hover:bg-surface-container text-on-surface-variant'
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        {/* Live Location / Manual Typing Input */}
        <div className="lg:col-span-7 flex flex-col justify-between gap-space-xs">
          <label className="font-label-sm text-label-sm text-on-surface font-semibold uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-primary text-[18px]">my_location</span>
              Live Location or City
            </span>
            <span className="text-[11px] font-normal text-on-surface-variant truncate max-w-[240px]">
              Active: <strong className="text-on-surface">{locationName}</strong>
            </span>
          </label>

          <form onSubmit={handleLocationSubmit} className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
                location_on
              </span>
              <input
                type="text"
                value={inputLocation}
                onChange={(e) => setInputLocation(e.target.value)}
                placeholder="Type city, address, or lat,lon (e.g. San Jose, Seattle)..."
                className="w-full h-10 pl-9 pr-3 bg-surface-container-low text-on-surface text-body-sm rounded-lg border border-surface-container-highest/80 focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={isLocating || !inputLocation.trim()}
              className="h-10 px-4 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md text-label-md font-semibold transition-colors flex items-center gap-1 disabled:opacity-50 cursor-pointer"
            >
              <span>Search</span>
            </button>
            <button
              type="button"
              onClick={locateMe}
              disabled={isLocating}
              className="h-10 px-3 rounded-lg bg-primary text-on-primary font-label-md text-label-md font-semibold hover:bg-primary/90 transition-colors flex items-center gap-1.5 shadow-sm whitespace-nowrap cursor-pointer"
              title="Detect live GPS coordinates from your device"
            >
              <span className={`material-symbols-outlined text-[18px] ${isLocating ? 'animate-spin' : ''}`}>
                near_me
              </span>
              <span>Live GPS</span>
            </button>
          </form>

          <p className="text-[11px] text-on-surface-variant truncate">
            {locationStatus}
          </p>
        </div>
      </div>

      {/* SOC-Aware Guidance Banners */}
      {isLowBattery && (
        <div className="p-space-md rounded-xl bg-error-container/30 border border-error-container text-on-error-container flex items-center gap-3 animate-in fade-in">
          <span className="material-symbols-outlined text-[24px] text-error">warning</span>
          <div className="flex-1">
            <h4 className="font-semibold text-sm text-error">Low Battery Advisory ({batteryPercent}%{realSoc !== null && !socTouchedRef.current ? ' · from your latest upload' : ' · entered manually'})</h4>
            <p className="text-xs text-on-surface-variant">
              Estimated remaining range is ~{usableRangeKm} km. Prioritize the closest suggested DC fast charger below to prevent battery depletion.
            </p>
          </div>
        </div>
      )}

      {isHighBattery && (
        <div className="p-space-md rounded-xl bg-primary-container/20 border border-primary/40 text-on-surface flex items-center gap-3 animate-in fade-in">
          <span className="material-symbols-outlined text-[24px] text-primary">battery_full</span>
          <div className="flex-1">
            <h4 className="font-semibold text-sm text-primary">High State of Charge ({batteryPercent}%{realSoc !== null && !socTouchedRef.current ? ' · from your latest upload' : ' · entered manually'})</h4>
            <p className="text-xs text-on-surface-variant">
              Your battery is currently fully charged with substantial energy reserve (~{usableRangeKm} km). Charging may not be needed now unless planning an extended highway trip.
            </p>
          </div>
        </div>
      )}

      {/* Main Grid: Synchronized Leaflet Map (7 cols) + Recommended Stations (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl">
        {/* Map Column */}
        <div className="lg:col-span-7 flex flex-col gap-space-md">
          {!coords ? (
            <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-surface-container-highest/60 p-space-xl flex flex-col items-center justify-center text-center h-[460px] gap-space-md">
              <div className="w-16 h-16 rounded-full bg-primary-container/20 text-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-[32px]">location_searching</span>
              </div>
              <div className="max-w-md">
                <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Location Required</h3>
                <p className="text-body-sm text-on-surface-variant mt-1">
                  Please enable GPS or type your city/address above. VoltSense queries real OpenStreetMap charging stations and will not fall back to simulated locations.
                </p>
              </div>
              <button
                type="button"
                onClick={locateMe}
                disabled={isLocating}
                className="h-10 px-space-lg bg-primary text-on-primary rounded-lg font-label-md font-semibold flex items-center gap-2 hover:bg-primary/90 transition-colors cursor-pointer"
              >
                <span className={`material-symbols-outlined text-[18px] ${isLocating ? 'animate-spin' : ''}`}>
                  near_me
                </span>
                <span>Enable Live GPS</span>
              </button>
            </div>
          ) : (
            <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-surface-container-highest/60 overflow-hidden h-[460px] relative">
              <div ref={mapContainerRef} className="w-full h-full z-0" />
              <div className="absolute top-3 left-3 z-[400] bg-surface-container-lowest/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-surface-container-highest/80 shadow-sm text-xs flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span>
                <span className="font-mono text-on-surface font-semibold">
                  {coords.lat.toFixed(4)}° N, {coords.lon.toFixed(4)}° W
                </span>
                <span className="text-outline">|</span>
                <span className="text-[11px] text-on-surface-variant">
                  {filteredStations.length} pins plotted
                </span>
              </div>
            </div>
          )}

          {/* Search Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-container-lowest p-space-sm rounded-xl border border-surface-container-highest/40">
            <div className="flex items-center gap-2">
              <label htmlFor="radius-select" className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">Search radius:</label>
              <select
                id="radius-select"
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                disabled={!coords}
                className="h-8 px-2 bg-surface-container-low rounded-lg text-body-sm text-on-surface border border-surface-container-highest/60 font-semibold cursor-pointer disabled:opacity-50"
              >
                {[10, 25, 50, 100].map((km) => (
                  <option key={km} value={km}>{km} km</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={searchStations}
                disabled={isLoading || !coords}
                className="h-8 px-3 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-[16px] ${isLoading ? 'animate-spin' : ''}`}>
                  refresh
                </span>
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Suggested Stations Column */}
        <div className="lg:col-span-5 flex flex-col gap-space-md">
          <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-surface-container-highest/60 p-space-lg flex flex-col gap-space-md max-h-[530px] overflow-y-auto">
            {/* Header & Filter Tabs */}
            <div className="flex flex-col gap-2 border-b border-surface-container-highest/60 pb-space-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary text-[22px]">ev_station</span>
                  Available Stations
                </h3>
                <span className="text-xs text-on-surface-variant font-mono">
                  {filteredStations.length} found
                </span>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 mt-1">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'reachable', label: 'Reachable Only' },
                  { id: 'fast', label: 'Fast (>=100 kW)' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterType(tab.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      filterType === tab.id
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {isLoading && (
              <div className="py-8 text-center flex flex-col items-center justify-center gap-2">
                <span className="material-symbols-outlined text-primary text-3xl animate-spin">progress_activity</span>
                <span className="text-xs text-on-surface-variant">Searching OpenStreetMap charging network…</span>
              </div>
            )}

            {fetchError && (
              <div className="p-3 rounded-xl bg-error-container/20 border border-error/30 text-error text-xs">
                {fetchError}
              </div>
            )}

            {coords && !isLoading && !fetchError && stations.length === 0 && (
              <div className="py-8 px-4 text-center text-on-surface-variant text-body-sm">
                No public charging stations found within {radiusKm} km of this location. Try increasing the search radius above.
              </div>
            )}

            {/* Top Suggested Card (Pinned) */}
            {topSuggestedStation && !isLoading && (
              <div className={`p-space-md rounded-xl border-2 shadow-sm flex flex-col gap-1.5 ${
                noneReachableWarning
                  ? 'bg-error-container/10 border-error/50'
                  : 'bg-gradient-to-r from-secondary-container/20 to-primary-container/10 border-primary'
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-1 font-label-sm text-[11px] uppercase tracking-wider font-bold ${
                    noneReachableWarning ? 'text-error' : 'text-primary'
                  }`}>
                    <span className="material-symbols-outlined text-[16px]">stars</span>
                    {noneReachableWarning ? 'Closest Station (Out of Range)' : 'Top Suggested Match'}
                  </span>
                  <span className="font-mono text-sm font-bold text-primary">
                    {topSuggestedStation.distanceKm} km (straight-line)
                  </span>
                </div>
                <div className="font-semibold text-on-surface text-base">
                  {topSuggestedStation.name}
                </div>
                <p className="text-xs text-on-surface-variant">
                  {topSuggestedStation.address}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <span className="px-2 py-0.5 rounded bg-primary text-on-primary font-mono text-[11px] font-semibold">
                    {topSuggestedStation.maxPowerKW ? `${topSuggestedStation.maxPowerKW} kW` : 'Power not listed'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface text-[11px] font-medium">
                    {topSuggestedStation.numberOfPoints ? `${topSuggestedStation.numberOfPoints} points` : 'Points not listed'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-surface-container-low text-on-surface-variant text-[11px]">
                    {topSuggestedStation.reachLabel}
                  </span>
                </div>

                {topSuggestedStation.latitude && topSuggestedStation.longitude && (
                  <div className="pt-2 mt-1 border-t border-primary/20 flex justify-end">
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${topSuggestedStation.latitude},${topSuggestedStation.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-colors shadow-sm"
                    >
                      <span className="material-symbols-outlined text-[15px]">directions</span>
                      <span>Navigate on Google Maps</span>
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Rest of Stations List */}
            <div className="flex flex-col gap-space-sm">
              {filteredStations.map((station) => {
                const isSelected = selectedStationId === station.id;
                const isTop = topSuggestedStation?.id === station.id;
                return (
                  <div
                    key={station.id}
                    onClick={() => handleSelectStation(station)}
                    className={`p-space-md rounded-xl border transition-all flex flex-col gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-primary-container/20 border-primary ring-2 ring-primary/30'
                        : isTop
                        ? 'bg-surface-container-low/40 border-primary/40'
                        : 'bg-surface-container-low border-surface-container-highest/60 hover:border-surface-container-highest'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-label-md text-label-md font-semibold text-on-surface">
                        {station.name}
                      </span>
                      {station.distanceKm !== null && (
                        <span className="font-mono text-xs font-bold text-primary whitespace-nowrap">
                          {station.distanceKm} km
                        </span>
                      )}
                    </div>

                    {station.address && (
                      <span className="text-[11px] text-on-surface-variant line-clamp-1">
                        {station.address}
                      </span>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {/* Power */}
                      {station.maxPowerKW && (
                        <span className="px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container font-label-sm text-[10px] font-bold">
                          {station.maxPowerKW} kW
                        </span>
                      )}

                      {/* Reachability tag */}
                      <span className={`px-2 py-0.5 rounded font-label-sm text-[10px] font-semibold ${
                        station.reachStatus === 'safe'
                          ? 'bg-primary-container/20 text-primary'
                          : station.reachStatus === 'tight'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-error-container/40 text-error'
                      }`}>
                        {station.reachLabel}
                      </span>

                      {/* Plugs */}
                      {station.numberOfPoints && (
                        <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">
                          {station.numberOfPoints} points
                        </span>
                      )}

                      {/* Network */}
                      {station.operatorName && (
                        <span className="text-[10px] text-on-surface-variant italic ml-auto">
                          {station.operatorName}
                        </span>
                      )}
                    </div>

                    {/* Google Maps Directions Action */}
                    {station.latitude && station.longitude && (
                      <div className="pt-1.5 border-t border-surface-container-highest/40 flex justify-end">
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[14px]">directions</span>
                          <span>Get Directions</span>
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
