import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { findNearbyChargingStations } from '../api/chargingApi';

const REFERENCE_WH_PER_KM = 160;
const SAFETY_RESERVE = 0.10; // 10% safety reserve buffer

export default function ChargingMap() {
  const { vehicles } = useApp();
  const vehicle = vehicles[0] || null;

  // Manual battery percentage state (defaults to vehicle's current SOH / charge or 25%)
  const [batteryPercent, setBatteryPercent] = useState(25);

  // Location state: Starts at null so we never silently fall back to San Francisco
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

  // Calculate pack capacity and usable range based on manually typed battery percent with safety reserve
  const capacityKWh = vehicle?.capacityKWh || 75;
  const rawRangeKm = (capacityKWh * (batteryPercent / 100) * 1000) / REFERENCE_WH_PER_KM;
  const usableRangeKm = Math.round(rawRangeKm * (1 - SAFETY_RESERVE));
  const isLowBattery = batteryPercent <= 20;

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
          lon: Number(position.coords.longitude.toFixed(5))
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

  // Try locating on first mount; if denied, remains null awaiting user input
  useEffect(() => {
    locateMe();
  }, [locateMe]);

  // Geocode user-typed location (support lat,lon or city/address names)
  const handleLocationSubmit = async (e) => {
    if (e) e.preventDefault();
    const query = inputLocation.trim();
    if (!query) return;

    // Check if query is comma-separated lat, lon numbers
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
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`, {
        headers: { 'User-Agent': 'VoltSense-EV-Diagnostics/1.0' }
      });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const place = data[0];
        const newCoords = {
          lat: Number(parseFloat(place.lat).toFixed(5)),
          lon: Number(parseFloat(place.lon).toFixed(5))
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

  // Fetch nearby charging stations strictly when valid coordinates exist
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

  // Evaluate reachability of each station according to battery percent.
  // Note: station.distanceKm is invariant geographic distance and NEVER changes with battery %.
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
        reachLabel
      };
    });
  }, [stations, usableRangeKm]);

  // Battery-aware station recommendation
  const { topSuggestedStation, noneReachableWarning } = useMemo(() => {
    if (!processedStations.length) return { topSuggestedStation: null, noneReachableWarning: false };
    const reachable = processedStations.filter(s => s.reachStatus !== 'out_of_range');

    if (reachable.length) {
      // Battery-aware ranking:
      // Low battery (<= 20%): strongly prioritize closest safely reachable station
      if (batteryPercent <= 20) {
        const sorted = reachable.slice().sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
        return { topSuggestedStation: sorted[0], noneReachableWarning: false };
      }
      // Medium battery (21-60%): reachable first, then shortest distance, prioritizing fast chargers when close
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
      // High battery (> 60%): nearest reachable station first
      const sorted = reachable.slice().sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
      return { topSuggestedStation: sorted[0], noneReachableWarning: false };
    }

    // If NO stations are reachable within estimated safe range:
    // Suggest the closest real station but flag explicit warning
    const closestAbsolute = processedStations.slice().sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0))[0];
    return { topSuggestedStation: closestAbsolute, noneReachableWarning: true };
  }, [processedStations, batteryPercent]);

  // Filtered stations for display
  const filteredStations = useMemo(() => {
    let list = processedStations;
    if (filterType === 'reachable') {
      list = processedStations.filter(s => s.reachStatus !== 'out_of_range');
    } else if (filterType === 'fast') {
      list = processedStations.filter(s => (s.maxPowerKW || 0) >= 100);
    }

    // Apply battery-aware sorting to list
    return list.slice().sort((a, b) => {
      const aReachable = a.reachStatus !== 'out_of_range' ? 1 : 0;
      const bReachable = b.reachStatus !== 'out_of_range' ? 1 : 0;
      if (aReachable !== bReachable) return bReachable - aReachable;
      return (a.distanceKm || 0) - (b.distanceKm || 0);
    });
  }, [processedStations, filterType]);

  const mapSrc = coords
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${coords.lon - 0.12}%2C${coords.lat - 0.09}%2C${coords.lon + 0.12}%2C${coords.lat + 0.09}&layer=mapnik&marker=${coords.lat}%2C${coords.lon}`
    : '';

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
              Estimated Range ({batteryPercent}%)
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
        {/* Battery Percentage Manual Input (5 cols) */}
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
              onChange={(e) => setBatteryPercent(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              className="w-20 h-10 px-3 bg-surface-container-low text-on-surface font-mono font-bold rounded-lg border border-surface-container-highest/80 focus:ring-1 focus:ring-primary focus:outline-none text-center"
            />
            <input 
              type="range"
              min="1"
              max="100"
              value={batteryPercent}
              onChange={(e) => setBatteryPercent(Number(e.target.value))}
              className="flex-1 accent-primary cursor-pointer h-2"
            />
          </div>

          {/* Quick presets */}
          <div className="flex items-center gap-1.5 pt-1">
            <span className="text-[11px] text-on-surface-variant font-medium mr-1">Quick:</span>
            {[10, 20, 35, 50, 80].map((pct) => (
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

        {/* Live Location / Manual Typing Input (7 cols) */}
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

      {/* Low Battery Warning Banner */}
      {isLowBattery && (
        <div className="p-space-md rounded-xl bg-error-container/30 border border-error-container text-on-error-container flex items-center gap-3 animate-in fade-in">
          <span className="material-symbols-outlined text-[24px] text-error">warning</span>
          <div className="flex-1">
            <h4 className="font-semibold text-sm text-error">Low Battery Advisory ({batteryPercent}%)</h4>
            <p className="text-xs text-on-surface-variant">
              Estimated remaining range is ~{usableRangeKm} km. Prioritize the closest suggested DC fast charger below to prevent battery depletion.
            </p>
          </div>
        </div>
      )}

      {/* Main Grid: Map (7 cols) + Recommended Stations (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl">
        {/* Map Column */}
        <div className="lg:col-span-7 flex flex-col gap-space-md">
          {!coords ? (
            <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-surface-container-highest/60 p-space-xl flex flex-col items-center justify-center text-center h-[450px] gap-space-md">
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
            <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-surface-container-highest/60 overflow-hidden h-[450px] relative">
              <iframe
                title="Charging Map"
                src={mapSrc}
                className="w-full h-full border-0"
                loading="lazy"
              />
              <div className="absolute top-3 left-3 bg-surface-container-lowest/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-surface-container-highest/80 shadow-sm text-xs flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span>
                <span className="font-mono text-on-surface font-semibold">{coords.lat.toFixed(4)}° N, {coords.lon.toFixed(4)}° W</span>
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
          <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-surface-container-highest/60 p-space-lg flex flex-col gap-space-md max-h-[520px] overflow-y-auto">
            {/* Header & Filter Tabs */}
            <div className="flex flex-col gap-2 border-b border-surface-container-highest/60 pb-space-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface flex items-center gap-1.5">
                  <span>Suggested Stations</span>
                  <span className="text-xs font-mono text-on-surface-variant font-normal">
                    ({filteredStations.length})
                  </span>
                </h3>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFilterType('all')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    filterType === 'all'
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  All ({processedStations.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('reachable')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    filterType === 'reachable'
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Reachable Only
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('fast')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    filterType === 'fast'
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Fast DC (100kW+)
                </button>
              </div>
            </div>

            {isLoading && (
              <p className="text-body-sm text-on-surface-variant flex items-center gap-2 py-4">
                <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                Finding best matched stations for your {batteryPercent}% battery level…
              </p>
            )}

            {fetchError && (
              <div className="px-space-md py-space-sm rounded-lg bg-error-container/30 border border-error-container text-error font-body-sm text-body-sm">
                {fetchError}
              </div>
            )}

            {noneReachableWarning && (
              <div className="p-space-sm rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-900 flex items-center gap-2 text-xs">
                <span className="material-symbols-outlined text-[18px] text-amber-700">warning</span>
                <span>No charging station is currently within the estimated safe range.</span>
              </div>
            )}

            {!coords && !isLoading && (
              <div className="py-8 px-4 text-center text-on-surface-variant text-body-sm">
                Enter your location or click "Live GPS" to view nearby charging stations.
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
                    {topSuggestedStation.maxPowerKW} kW Fast DC
                  </span>
                  <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface text-[11px] font-medium">
                    {topSuggestedStation.numberOfPoints || 8} stalls
                  </span>
                  <span className="px-2 py-0.5 rounded bg-surface-container-low text-on-surface-variant text-[11px]">
                    {topSuggestedStation.reachLabel}
                  </span>
                </div>
              </div>
            )}

            {/* Rest of Stations List */}
            <div className="flex flex-col gap-space-sm">
              {filteredStations.map((station) => {
                const isTop = topSuggestedStation?.id === station.id;
                return (
                  <div 
                    key={station.id} 
                    className={`p-space-md rounded-xl border transition-all flex flex-col gap-1.5 ${
                      isTop 
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
