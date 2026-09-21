import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

// Helper math functions for hand-rolled inline SVG geometry
function polarToCartesian(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180.0;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeDonutSlice(cx, cy, r, innerR, startAngle, endAngle) {
  const sweep = endAngle - startAngle;
  if (sweep >= 359.99) {
    return (
      'M ' + cx + ' ' + (cy - r) +
      ' A ' + r + ' ' + r + ' 0 1 1 ' + cx + ' ' + (cy + r) +
      ' A ' + r + ' ' + r + ' 0 1 1 ' + cx + ' ' + (cy - r) +
      ' M ' + cx + ' ' + (cy - innerR) +
      ' A ' + innerR + ' ' + innerR + ' 0 1 0 ' + cx + ' ' + (cy + innerR) +
      ' A ' + innerR + ' ' + innerR + ' 0 1 0 ' + cx + ' ' + (cy - innerR) +
      ' Z'
    );
  }
  if (sweep <= 0.1) return '';
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const innerStart = polarToCartesian(cx, cy, innerR, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerR, startAngle);
  const largeArc = sweep > 180 ? 1 : 0;
  return [
    'M ' + start.x.toFixed(2) + ' ' + start.y.toFixed(2),
    'A ' + r + ' ' + r + ' 0 ' + largeArc + ' 0 ' + end.x.toFixed(2) + ' ' + end.y.toFixed(2),
    'L ' + innerEnd.x.toFixed(2) + ' ' + innerEnd.y.toFixed(2),
    'A ' + innerR + ' ' + innerR + ' 0 ' + largeArc + ' 1 ' + innerStart.x.toFixed(2) + ' ' + innerStart.y.toFixed(2),
    'Z',
  ].join(' ');
}

function describePieSlice(cx, cy, r, startAngle, endAngle) {
  const sweep = endAngle - startAngle;
  if (sweep >= 359.99) {
    return (
      'M ' + cx + ' ' + (cy - r) +
      ' A ' + r + ' ' + r + ' 0 1 1 ' + cx + ' ' + (cy + r) +
      ' A ' + r + ' ' + r + ' 0 1 1 ' + cx + ' ' + (cy - r) +
      ' Z'
    );
  }
  if (sweep <= 0.1) return '';
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = sweep > 180 ? 1 : 0;
  return [
    'M ' + cx + ' ' + cy,
    'L ' + end.x.toFixed(2) + ' ' + end.y.toFixed(2),
    'A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + start.x.toFixed(2) + ' ' + start.y.toFixed(2),
    'Z',
  ].join(' ');
}

export default function BatteryAnalysis() {
  const { vehicles, setCurrentTab, loadVehicleDetail, setIsAddVehicleModalOpen, switchBattery, switchingBattery } = useApp();

  const [selectedTimeShareSlice, setSelectedTimeShareSlice] = useState('discharge');
  const [selectedCycleIdx, setSelectedCycleIdx] = useState(0);
  const [selectedFadeSlice, setSelectedFadeSlice] = useState('first');
  const [selectedPoint, setSelectedPoint] = useState(null);

  const vehicle = vehicles[0];

  useEffect(() => {
    if (vehicle?.id) {
      loadVehicleDetail(vehicle.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle?.id]);

  if (!vehicle) {
    return (
      <div className="p-12 text-center bg-surface-container-lowest rounded-xl border border-surface-container-highest/60 flex flex-col items-center max-w-lg mx-auto my-12">
        <div className="w-16 h-16 rounded-xl bg-primary-container/20 text-primary flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-[36px]">directions_car</span>
        </div>
        <p className="font-headline-sm text-headline-sm text-on-surface font-semibold">No EV set up yet</p>
        <p className="text-body-sm text-on-surface-variant mt-2 text-center max-w-md">
          Set up your EV details to view diagnostic health reports, impedance profiles, and degradation trends.
        </p>
        <button
          onClick={() => setIsAddVehicleModalOpen(true)}
          className="mt-6 h-11 px-6 rounded-lg bg-primary text-on-primary font-label-md text-label-md font-bold hover:bg-primary/90 transition-colors shadow flex items-center gap-2 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Set Up My EV
        </button>
      </div>
    );
  }

  if (!vehicle.hasAnalysis) {
    return (
      <div className="p-12 text-center bg-surface-container-lowest rounded-xl border border-surface-container-highest/60 flex flex-col items-center max-w-xl mx-auto my-12">
        <div className="w-16 h-16 rounded-xl bg-primary-container/20 text-primary flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-[36px]">analytics</span>
        </div>
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
          No Battery Analysis for {vehicle.name} Yet
        </h2>
        <p className="text-body-sm text-on-surface-variant mt-2 max-w-md">
          Upload telemetry data for this vehicle to compute State of Health, cycle discharge timelines, and degradation forecasts.
        </p>
        <button
          onClick={() => setCurrentTab('upload')}
          className="mt-6 h-11 px-6 rounded-lg bg-primary text-on-primary font-label-md text-label-md font-semibold hover:bg-primary/90 transition-colors shadow flex items-center gap-2 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">file_upload</span>
          Upload Battery Telemetry
        </button>
      </div>
    );
  }

  const isAttention = vehicle.status === 'Attention';

  // Export PDF simulation
  const handleExportPdf = () => {
    window.print();
  };

  // --- Real Historical & Linear Trend Trajectory Curve ---
  const historical =
    vehicle.degradation?.historical && vehicle.degradation.historical.length > 0
      ? vehicle.degradation.historical
      : [{ cycle: 0, soh: 100 }, { cycle: vehicle.cycles || 1, soh: vehicle.soh }];

  const predicted =
    vehicle.degradation?.predicted && vehicle.degradation.predicted.length > 0
      ? vehicle.degradation.predicted
      : [];

  const cyclesCurrent = vehicle.cycles ?? (historical.length > 0 ? historical[historical.length - 1].cycle : 0);
  const sohCurrent = vehicle.soh ?? 100;

  const allCycles = [...historical.map((h) => h.cycle), ...predicted.map((p) => p.cycle)];
  const maxCycleRaw = Math.max(...allCycles, cyclesCurrent, 10);
  const maxCycle = Math.max(20, Math.ceil(maxCycleRaw / 20) * 20);
  const minCycle = Math.max(0, Math.min(...allCycles, 0));

  const minSoh = 65;
  const maxSoh = 105;

  const getX = (c) => 60 + ((c - minCycle) / (maxCycle - minCycle || 1)) * 680;
  const getY = (s) => 30 + ((maxSoh - s) / (maxSoh - minSoh)) * 190;

  const historicalPath = historical
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${getX(pt.cycle).toFixed(1)} ${getY(pt.soh).toFixed(1)}`)
    .join(' ');

  const lastHist = historical[historical.length - 1];
  const predictedPath =
    predicted.length > 0
      ? [lastHist, ...predicted]
          .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${getX(pt.cycle).toFixed(1)} ${getY(pt.soh).toFixed(1)}`)
          .join(' ')
      : '';

  const currentX = getX(cyclesCurrent);
  const currentY = getY(sohCurrent);
  const eolThresholdVal = vehicle.eolThreshold || 70.0;
  const eolY = getY(eolThresholdVal);

  // --- Telemetry Data for the 3 SVG Charts ---
  const timeShare = vehicle.timeShare || {
    chargePercent: 0,
    dischargePercent: 100,
    restPercent: 0,
    chargeCount: 0,
    dischargeCount: vehicle.recordsCount || 0,
    restCount: 0,
  };

  const cycleTable = vehicle.cycleTable && vehicle.cycleTable.length > 0 ? vehicle.cycleTable : [];
  const activeCycle = cycleTable[selectedCycleIdx] || cycleTable[cycleTable.length - 1] || null;
  const telemetryStats = vehicle.telemetryStats || null;
  const cycleStart = cycleTable[0]?.cycle ?? null;
  const cycleEnd = cycleTable[cycleTable.length - 1]?.cycle ?? null;

  const fadeShare = vehicle.fadeShare || {
    firstHalfPct: 50,
    secondHalfPct: 50,
  };

  // Donut slices geometry
  const dischargeDeg = (timeShare.dischargePercent / 100) * 360;
  const chargeDeg = (timeShare.chargePercent / 100) * 360;

  const dischargePath = describeDonutSlice(100, 100, 75, 48, 0, dischargeDeg);
  const chargePath = describeDonutSlice(100, 100, 75, 48, dischargeDeg, dischargeDeg + chargeDeg);
  const restPath = describeDonutSlice(100, 100, 75, 48, dischargeDeg + chargeDeg, 360);

  // Pie slices geometry
  const fade1Deg = (fadeShare.firstHalfPct / 100) * 360;
  const pieSlice1 = describePieSlice(100, 100, 72, 0, fade1Deg);
  const pieSlice2 = describePieSlice(100, 100, 72, fade1Deg, 360);

  // Bar chart geometry
  const maxDischargeDuration = cycleTable.length > 0
    ? Math.max(...cycleTable.map((c) => c.dischargeDuration), 60)
    : 3600;

  return (
    <div className="flex flex-col w-full pb-space-4xl">
      {/* Breadcrumb & Top Context Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md mb-space-xl">
        <div className="flex flex-col">
          <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider mb-space-xs">
            <button 
              onClick={() => setCurrentTab('dashboard')}
              className="hover:text-primary transition-colors cursor-pointer"
            >
              Dashboard
            </button>
            <span>/</span>
            <span className="text-on-surface font-medium">{vehicle.name}</span>
            <span>/</span>
            <span className="text-on-surface font-semibold font-mono">Report #{vehicle.reportId}</span>
          </div>
          
          <div className="flex flex-wrap items-baseline gap-space-sm">
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
              Pack Telemetry & SOH Diagnostic
            </h1>
            <div className={`inline-flex items-center gap-space-xs px-space-sm py-space-2xs rounded-full ${
              isAttention ? 'bg-error-container/40' : 'bg-secondary-container/40'
            }`}>
              <span className={`w-2 h-2 rounded-full ${isAttention ? 'bg-error' : 'bg-secondary'}`}></span>
              <span className={`font-label-sm text-label-sm font-semibold uppercase tracking-wide ${
                isAttention ? 'text-on-error-container' : 'text-on-secondary-container'
              }`}>
                {isAttention ? 'Attention Required' : 'Nominal Diagnostic'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-space-md gap-y-space-xs mt-space-xs font-telemetry-sm text-telemetry-sm text-on-surface-variant">
            <span>{vehicle.year} • {vehicle.trim}</span>
            <span className="text-surface-container-highest">•</span>
            <span className="font-mono">{vehicle.chemistry}</span>
            <span className="text-surface-container-highest">•</span>
            <span className="font-mono">VIN: {vehicle.vin}</span>
          </div>
        </div>

        {/* Actions Toolbar */}
        <div className="flex items-center flex-wrap gap-space-sm">
          <button 
            onClick={() => setCurrentTab('upload')}
            className="flex items-center gap-space-xs px-space-md h-9 bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-medium rounded-lg transition-colors shadow-sm border border-surface-container-highest/60"
          >
            <span className="material-symbols-outlined text-[18px]">file_upload</span>
            Upload Telemetry
          </button>
          <button 
            onClick={handleExportPdf}
            className="flex items-center gap-space-xs px-space-md h-9 bg-primary text-on-primary hover:bg-primary-container font-body-sm text-body-sm font-semibold rounded-lg transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
            Export Diagnostic PDF
          </button>
        </div>
      </div>

      {/* Telemetry Metadata Strip */}
      <div className="bg-surface-container-low p-space-md rounded-xl mb-space-xl flex flex-wrap items-center justify-between gap-space-md border border-surface-container-highest/40">
        <div className="flex flex-wrap items-center gap-x-space-xl gap-y-space-xs font-body-sm text-body-sm text-on-surface-variant">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-[16px] text-primary">event_available</span>
            <span>Analysis Completed: <strong className="text-on-surface font-mono font-medium">{vehicle.lastReportDate}</strong></span>
          </div>
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-[16px] text-primary">analytics</span>
            <span>
              Dataset: <span className="font-mono text-on-surface font-medium">{vehicle.datasetFileName || 'No dataset yet'}</span>
              <span className="ml-1.5 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-primary-container/30 text-primary font-mono">
                {vehicle.datasetSourceLabel || (vehicle.isSynthetic ? 'Synthetic Test Data' : 'NASA Battery Experimental Data')}
              </span>
              <span className="text-[11px] font-mono ml-1">({vehicle.recordsCount.toLocaleString()} records)</span>
            </span>
          </div>
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-[16px] text-primary">memory</span>
            <span>Inference: <strong className="text-on-surface font-mono font-medium">SOH: {vehicle.modelVersion?.includes('Empirical') ? 'Empirical capacity ratio' : (vehicle.modelVersion || 'RandomForest')} | RUL: Linear degradation extrapolation</strong></span>
          </div>
        </div>

        {vehicle.availableBatteries && vehicle.availableBatteries.length > 1 && (
          <div className="flex items-center gap-space-xs bg-surface-container-lowest px-3 py-1.5 rounded-lg border border-primary/30 shadow-xs">
            <span className="material-symbols-outlined text-[16px] text-primary">battery_charging_full</span>
            <label htmlFor="battery-cell-select" className="text-[12px] font-semibold text-on-surface">Cell ID:</label>
            <select
              id="battery-cell-select"
              value={vehicle.selectedBatteryId || vehicle.availableBatteries[0]}
              disabled={switchingBattery}
              onChange={(e) => switchBattery && switchBattery(e.target.value)}
              className="bg-transparent text-[12px] font-mono font-bold text-primary focus:outline-none cursor-pointer"
            >
              {vehicle.availableBatteries.map((bId) => (
                <option key={bId} value={bId} className="bg-surface-container-lowest text-on-surface">
                  {bId}
                </option>
              ))}
            </select>
            {switchingBattery && <span className="text-[10px] text-primary animate-pulse font-mono">analyzing...</span>}
          </div>
        )}
      </div>

      {/* Key Diagnostic Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md mb-space-xl">
        {/* SOH */}
        <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm border border-surface-container-highest/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold">
              State of Health (SOH)
            </span>
            <span className={`material-symbols-outlined text-[20px] ${isAttention ? 'text-error' : 'text-primary'}`}>
              battery_charging_full
            </span>
          </div>
          <div className="mt-space-md flex flex-col">
            <div className="flex items-baseline gap-space-xs">
              <span
                className={`font-telemetry-hero text-telemetry-hero font-mono font-medium ${
                  isAttention ? 'text-error' : 'text-on-surface'
                }`}
              >
                {vehicle.soh}
              </span>
              <span className="font-telemetry-sm text-telemetry-sm font-mono text-on-surface-variant">%</span>
            </div>
            {vehicle.modelSoh != null && vehicle.modelSoh !== vehicle.soh && (
              <span className="text-[11px] font-mono text-on-surface-variant mt-0.5">
                Empirical: {vehicle.empiricalSoh ?? vehicle.soh}% • Model: {vehicle.modelSoh}%
              </span>
            )}
          </div>
          <div className="mt-space-sm pt-space-sm border-t border-surface-container-highest/40 text-[12px] text-on-surface-variant flex flex-col gap-1">
            <div className="flex justify-between">
              <span>
                EOL Threshold: <strong className="font-mono text-on-surface">{eolThresholdVal}%</strong>
              </span>
              <span className="font-mono text-primary font-medium">
                {typeof vehicle.rul === 'number' ? `EOL in ${vehicle.rul} cyc` : 'RUL: Insufficient data'}
              </span>
            </div>
            {typeof vehicle.rul === 'number' && typeof vehicle.cycles === 'number' && (
              <div className="text-[10.5px] font-mono text-on-surface-variant pt-1 border-t border-surface-container-highest/30 flex flex-col gap-0.5">
                <div>Current cycle: {vehicle.cycles}</div>
                <div>Predicted EOL cycle: {vehicle.estimatedEOLCycle ?? (vehicle.cycles + vehicle.rul)}</div>
                <div>EOL threshold: {eolThresholdVal}%</div>
                <div>Estimated RUL: {vehicle.rul} cycles</div>
              </div>
            )}
          </div>
        </div>

        {/* Degradation Rate */}
        <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm border border-surface-container-highest/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold">
              Degradation Rate
            </span>
            <span className="material-symbols-outlined text-[20px] text-primary">trending_down</span>
          </div>
          <div className="mt-space-md flex items-baseline gap-space-xs">
            <span className="font-telemetry-hero text-telemetry-hero font-mono font-medium text-on-surface">
              {vehicle.degradationRate}
            </span>
          </div>
          <div className="mt-space-sm pt-space-sm border-t border-surface-container-highest/40 text-[12px] text-on-surface-variant flex justify-between">
            <span>Linear fit (R² {vehicle.degradation?.r2 != null ? vehicle.degradation.r2.toFixed(3) : '—'})</span>
            <span className="font-mono text-on-surface font-semibold">
              {historical.length} cycles measured
            </span>
          </div>
        </div>

        {/* Internal Resistance - Honest Data Availability */}
        <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm border border-dashed border-surface-container-highest/60 flex flex-col justify-between opacity-80">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold text-on-surface-variant/80">
              Estimated Internal Resistance
            </span>
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant/60">tune</span>
          </div>
          <div className="mt-space-md flex flex-col">
            <span className={`font-mono font-medium text-on-surface ${vehicle.internalResistance !== null && vehicle.internalResistance !== undefined && vehicle.internalResistance !== '—' ? 'font-telemetry-hero text-telemetry-hero' : 'text-body-md py-1 text-on-surface-variant'}`}>
              {vehicle.internalResistance !== null && vehicle.internalResistance !== undefined && vehicle.internalResistance !== '—' ? `${vehicle.internalResistance} mΩ` : 'Internal resistance unavailable'}
            </span>
            <span className="text-[11px] text-on-surface-variant mt-1">
              {vehicle.internalResistance !== null && vehicle.internalResistance !== undefined && vehicle.internalResistance !== '—' ? 'Derived from observed load-voltage telemetry' : 'No load-voltage resistance estimate in this run'}
            </span>
          </div>
          <div className="mt-space-sm pt-space-sm border-t border-surface-container-highest/40 text-[12px] text-on-surface-variant flex justify-between">
            <span>Load-step estimate</span>
            <span className="font-mono text-on-surface-variant">{vehicle.internalResistance !== null && vehicle.internalResistance !== undefined && vehicle.internalResistance !== '—' ? 'Observed' : 'Unavailable'}</span>
          </div>
        </div>

        {/* Max Cell Imbalance - Honest Data Availability */}
        <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm border border-dashed border-surface-container-highest/60 flex flex-col justify-between opacity-80">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold text-on-surface-variant/80">
              Voltage Range
            </span>
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant/60">balance</span>
          </div>
          <div className="mt-space-md flex flex-col">
            <span className="font-telemetry-hero text-telemetry-hero font-mono font-medium text-on-surface">
              {telemetryStats?.voltage ? `${telemetryStats.voltage.min}–${telemetryStats.voltage.max} V` : 'Unavailable'}
            </span>
            <span className="text-[11px] text-on-surface-variant mt-1">
              {telemetryStats?.voltage ? `${telemetryStats.voltage.range} V observed span` : 'Voltage statistics were not returned for this run'}
            </span>
          </div>
          <div className="mt-space-sm pt-space-sm border-t border-surface-container-highest/40 text-[12px] text-on-surface-variant flex justify-between">
            <span>Required voltage telemetry</span>
            <span className="font-mono text-on-surface-variant">{telemetryStats?.voltage ? 'Observed' : 'Unavailable'}</span>
          </div>
        </div>
      </div>

      {/* Primary Degradation Chart & Loss Mechanism Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl mb-space-xl">
        {/* Left: Real Degradation Trajectory Curve (8 cols) */}
        <div className="lg:col-span-8 bg-surface-container-lowest rounded-xl p-space-xl shadow-sm border border-surface-container-highest/40 flex flex-col gap-space-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-space-xs">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                  Electrochemical SOH Degradation Curve
                </h3>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Observed per-cycle historical degradation curve with linear regression extrapolation to {eolThresholdVal}% EOL
              </p>
            </div>

            <div className="flex items-center flex-wrap gap-space-sm text-label-sm text-on-surface-variant font-mono text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-0.5 bg-primary inline-block"></span> Observed Historical SOH
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-0.5 border-b-2 border-dashed border-primary inline-block"></span> Projected (linear trend)
              </span>
              <span className="flex items-center gap-1.5 text-error font-semibold">
                <span className="w-3.5 h-0.5 border-b-2 border-dashed border-error inline-block"></span> {eolThresholdVal}% EOL Threshold
              </span>
            </div>
          </div>

          {/* Interactive SVG Chart */}
          <div className="w-full bg-surface-container-low/40 rounded-xl p-2 border border-surface-container-highest/40 overflow-x-auto">
            <svg viewBox="0 0 800 280" className="w-full h-64 select-none">
              {/* Grid Lines */}
              <line x1="60" y1="30" x2="760" y2="30" stroke="#e2e2e6" strokeDasharray="3 3" />
              <text x="52" y="34" fill="#6d7a71" fontSize="10" textAnchor="end" fontFamily="JetBrains Mono">
                105%
              </text>

              <line x1="60" y1={getY(100)} x2="760" y2={getY(100)} stroke="#e2e2e6" strokeDasharray="3 3" />
              <text x="52" y={getY(100) + 4} fill="#6d7a71" fontSize="10" textAnchor="end" fontFamily="JetBrains Mono">
                100%
              </text>

              <line x1="60" y1={getY(90)} x2="760" y2={getY(90)} stroke="#e2e2e6" strokeDasharray="3 3" />
              <text x="52" y={getY(90) + 4} fill="#6d7a71" fontSize="10" textAnchor="end" fontFamily="JetBrains Mono">
                90%
              </text>

              <line x1="60" y1={getY(80)} x2="760" y2={getY(80)} stroke="#e2e2e6" strokeDasharray="3 3" />
              <text x="52" y={getY(80) + 4} fill="#6d7a71" fontSize="10" textAnchor="end" fontFamily="JetBrains Mono">
                80%
              </text>

              {/* EOL Threshold Line */}
              <line x1="60" y1={eolY} x2="760" y2={eolY} stroke="#ba1a1a" strokeWidth="1.5" strokeDasharray="4 4" />
              <text x="52" y={eolY + 4} fill="#ba1a1a" fontSize="10" textAnchor="end" fontFamily="JetBrains Mono" fontWeight="bold">
                {eolThresholdVal}% EOL
              </text>

              {/* X Axis Labels */}
              <text x="60" y="255" fill="#6d7a71" fontSize="10" fontFamily="JetBrains Mono">
                {minCycle} Cyc
              </text>
              <text x={getX(minCycle + (maxCycle - minCycle) * 0.33)} y="255" fill="#6d7a71" fontSize="10" textAnchor="middle" fontFamily="JetBrains Mono">
                {Math.round(minCycle + (maxCycle - minCycle) * 0.33)} Cyc
              </text>
              <text x={getX(minCycle + (maxCycle - minCycle) * 0.66)} y="255" fill="#6d7a71" fontSize="10" textAnchor="middle" fontFamily="JetBrains Mono">
                {Math.round(minCycle + (maxCycle - minCycle) * 0.66)} Cyc
              </text>
              <text x="760" y="255" fill="#6d7a71" fontSize="10" textAnchor="end" fontFamily="JetBrains Mono">
                {maxCycle} Cyc
              </text>

              {/* Real Observed Historical Trajectory Polyline */}
              {historicalPath && (
                <path
                  d={historicalPath}
                  fill="none"
                  stroke="#006c48"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Real Observed Historical Points */}
              {historical.map((pt, i) => {
                const isPtSelected = selectedPoint?.type === 'historical' && selectedPoint?.cycle === pt.cycle;
                return (
                  <circle
                    key={i}
                    cx={getX(pt.cycle)}
                    cy={getY(pt.soh)}
                    r={isPtSelected ? 5 : 3}
                    fill="#006c48"
                    stroke="#ffffff"
                    strokeWidth={isPtSelected ? 2 : 1}
                    className="cursor-pointer hover:opacity-80"
                    onClick={() =>
                      setSelectedPoint({
                        cycle: pt.cycle,
                        soh: pt.soh,
                        type: 'historical',
                        x: getX(pt.cycle),
                        y: getY(pt.soh)
                      })
                    }
                  />
                );
              })}

              {/* Projected Linear Trend (dashed extrapolation) */}
              {predictedPath && (
                <path
                  d={predictedPath}
                  fill="none"
                  stroke="#006c48"
                  strokeWidth="2"
                  strokeDasharray="5 5"
                  strokeLinecap="round"
                />
              )}

              {/* Predicted Target Points */}
              {predicted.map((pt, i) => {
                const isPtSelected = selectedPoint?.type === 'predicted' && selectedPoint?.cycle === pt.cycle;
                return (
                  <circle
                    key={'p-' + i}
                    cx={getX(pt.cycle)}
                    cy={getY(pt.soh)}
                    r={isPtSelected ? 5 : 3}
                    fill="#ffffff"
                    stroke="#006c48"
                    strokeWidth={isPtSelected ? 2.5 : 1.5}
                    className="cursor-pointer hover:opacity-80"
                    onClick={() =>
                      setSelectedPoint({
                        cycle: pt.cycle,
                        soh: pt.soh,
                        type: 'predicted',
                        x: getX(pt.cycle),
                        y: getY(pt.soh)
                      })
                    }
                  />
                );
              })}

              {/* Selected Point Popover in SVG */}
              {selectedPoint && (
                <g>
                  <rect
                    x={Math.max(60, Math.min(640, selectedPoint.x - 70))}
                    y={Math.max(8, selectedPoint.y - 38)}
                    width="140"
                    height="28"
                    rx="5"
                    fill="#0f172a"
                    stroke="#38bdf8"
                    strokeWidth="1"
                  />
                  <text
                    x={Math.max(60, Math.min(640, selectedPoint.x - 70)) + 70}
                    y={Math.max(8, selectedPoint.y - 38) + 13}
                    fill="#ffffff"
                    fontSize="9.5"
                    textAnchor="middle"
                    fontFamily="JetBrains Mono"
                    fontWeight="bold"
                  >
                    Cycle #{selectedPoint.cycle}: SOH {selectedPoint.soh}%
                  </text>
                  <text
                    x={Math.max(60, Math.min(640, selectedPoint.x - 70)) + 70}
                    y={Math.max(8, selectedPoint.y - 38) + 23}
                    fill="#94a3b8"
                    fontSize="8"
                    textAnchor="middle"
                    fontFamily="JetBrains Mono"
                  >
                    {selectedPoint.type === 'historical' ? 'Observed Telemetry' : 'Projected Model Trend'}
                  </text>
                </g>
              )}

              {/* Current Measured Position Point & Tooltip */}
              <circle cx={currentX} cy={currentY} r="6" fill="#006c48" stroke="#ffffff" strokeWidth="2.5" />
              <circle cx={currentX} cy={currentY} r="11" fill="#006c48" fillOpacity="0.2" className="animate-ping" />

              <rect
                x={Math.max(60, Math.min(650, currentX - 60))}
                y={Math.max(8, currentY - 36)}
                width="120"
                height="24"
                rx="4"
                fill="#1a1c1f"
              />
              <text
                x={Math.max(60, Math.min(650, currentX - 60)) + 60}
                y={Math.max(8, currentY - 36) + 16}
                fill="#ffffff"
                fontSize="10.5"
                textAnchor="middle"
                fontFamily="JetBrains Mono"
                fontWeight="bold"
              >
                {sohCurrent}% @ {cyclesCurrent} cyc
              </text>
            </svg>
          </div>

          {selectedPoint && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low border border-primary/40 text-body-sm font-mono text-[12px]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[18px]">info</span>
                <span>
                  Cycle <strong>#{selectedPoint.cycle}</strong>: {selectedPoint.type === 'historical' ? 'Observed SOH' : 'Projected SOH'} is <strong className="text-primary font-bold">{selectedPoint.soh}%</strong> ({selectedPoint.type === 'historical' ? 'Calculated directly from measured discharge capacity' : `Extrapolated based on degradation slope toward ${eolThresholdVal}% EOL`}).
                </span>
              </div>
              <button 
                onClick={() => setSelectedPoint(null)} 
                className="text-on-surface-variant hover:text-on-surface text-[11px] underline cursor-pointer"
              >
                Clear
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between text-body-sm text-on-surface-variant font-mono text-[12px] pt-1">
            <span>
              {typeof vehicle.rul === 'number' && typeof vehicle.cycles === 'number'
                ? `SOH model: ${vehicle.modelVersion?.includes('Empirical') ? 'Empirical capacity ratio' : 'RandomForest'} | RUL method: Linear degradation extrapolation`
                : `Degradation Method: Linear degradation extrapolation`}
            </span>
            <span className="text-[11px] text-on-surface-variant/80 italic">
              Dashed line: Projected linear trend to {eolThresholdVal}% SOH
            </span>
          </div>
        </div>

        {/* Right: Degradation Drivers - Honest Status (4 cols) */}
        <div className="lg:col-span-4 bg-surface-container-lowest rounded-xl p-space-xl shadow-sm border border-surface-container-highest/40 flex flex-col justify-between gap-space-md">
          <div className="flex flex-col gap-space-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                Degradation Drivers
              </h3>
              <span className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded bg-surface-container-highest/60 text-on-surface-variant font-mono">
                Model scope
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Measured inputs from the uploaded telemetry used alongside the current SOH and RUL inference.
            </p>

            <div className="flex flex-col gap-space-sm mt-space-xs">
              <div className="flex justify-between items-center text-[12px]">
                <span className="text-on-surface-variant">Latest SOH estimate</span>
                <span className="font-mono text-on-surface font-semibold">{vehicle.soh}%</span>
              </div>
              <div className="h-1.5 w-full bg-primary-container rounded-full"></div>

              <div className="flex justify-between items-center text-[12px]">
                <span className="text-on-surface-variant">Observed cycle range</span>
                <span className="font-mono text-on-surface">{cycleStart !== null && cycleEnd !== null ? `${cycleStart}–${cycleEnd}` : 'Unavailable'}</span>
              </div>
              <div className="h-1.5 w-full bg-primary-container rounded-full"></div>

              <div className="flex justify-between items-center text-[12px]">
                <span className="text-on-surface-variant">Temperature range</span>
                <span className="font-mono text-on-surface">{telemetryStats?.temperature ? `${telemetryStats.temperature.min}–${telemetryStats.temperature.max} °C` : 'Unavailable'}</span>
              </div>
              <div className="h-1.5 w-full bg-primary-container rounded-full"></div>

              <div className="flex justify-between items-center text-[12px]">
                <span className="text-on-surface-variant">Voltage range</span>
                <span className="font-mono text-on-surface">{telemetryStats?.voltage ? `${telemetryStats.voltage.min}–${telemetryStats.voltage.max} V` : 'Unavailable'}</span>
              </div>
              <div className="h-1.5 w-full bg-primary-container rounded-full"></div>
            </div>
          </div>

          <div className="p-space-md rounded-lg bg-surface-container-low border border-surface-container-highest/60 text-[12px] text-on-surface-variant">
            <span className="font-semibold text-on-surface block mb-1">Latest result</span>
            {typeof vehicle.rul === 'number' && typeof vehicle.cycles === 'number' ? (
              <div className="flex flex-col gap-2">
                <p className="text-on-surface">
                  SOH is <strong className="font-mono font-medium">{vehicle.soh}%</strong>. The degradation model estimates approximately <strong className="font-mono font-medium">{vehicle.rul} cycles</strong> until the {eolThresholdVal}% EOL threshold.
                </p>
                <div className="p-2 rounded bg-surface-container-lowest border border-surface-container-highest/60 font-mono text-[11px] text-on-surface flex flex-col gap-0.5">
                  <div>Current cycle: {vehicle.cycles}</div>
                  <div>Predicted EOL cycle: {vehicle.estimatedEOLCycle ?? (vehicle.cycles + vehicle.rul)}</div>
                  <div>EOL threshold: {eolThresholdVal}%</div>
                  <div>Estimated RUL: {vehicle.rul} cycles</div>
                </div>
              </div>
            ) : (
              `SOH is ${vehicle.soh}%. RUL is unavailable because this upload does not establish a usable degradation trend.`
            )}
          </div>
        </div>
      </div>

      {/* THREE REAL HAND-ROLLED INLINE SVG CHARTS WITH CLICK-TO-EXPLAIN FACTUAL PANELS */}
      <div className="mb-space-xl">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-space-md">
          <div>
            <div className="flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-[20px] text-primary">equalizer</span>
              <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                Empirical Telemetry Insights
              </h2>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Interactive factual diagnostics derived directly from the uploaded telemetry
            </p>
          </div>
          <span className="text-[11px] font-mono uppercase bg-primary-container/30 text-primary px-2.5 py-1 rounded-full font-semibold self-start">
            Click elements to inspect
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-md">
          {/* Chart 1: Charge / Discharge / Rest Time-Share Donut */}
          <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm border border-surface-container-highest/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-label-md text-label-md uppercase tracking-wider font-semibold text-on-surface">
                  Operational Phase Share
                </h3>
                <span className="material-symbols-outlined text-[18px] text-primary">donut_large</span>
              </div>
              <p className="text-[12px] text-on-surface-variant mt-0.5">
                {timeShare?.method === 'observation_count'
                  ? 'Proportion of telemetry observations classified as charge, discharge, or rest'
                  : 'Time spent in charge vs discharge vs rest based on Current_measured and telemetry timestamps'}
              </p>

              {/* Hand-rolled SVG Donut */}
              <div className="flex items-center justify-center my-4">
                <svg viewBox="0 0 200 200" className="w-44 h-44 select-none">
                  {/* Discharge Slice */}
                  {dischargePath && (
                    <path
                      d={dischargePath}
                      fill="#ea580c"
                      className="cursor-pointer transition-all duration-200 hover:opacity-90"
                      opacity={selectedTimeShareSlice === 'discharge' ? 1 : 0.65}
                      stroke={selectedTimeShareSlice === 'discharge' ? '#ffffff' : 'none'}
                      strokeWidth={selectedTimeShareSlice === 'discharge' ? 2 : 0}
                      onClick={() => setSelectedTimeShareSlice('discharge')}
                    />
                  )}

                  {/* Charge Slice */}
                  {chargePath && (
                    <path
                      d={chargePath}
                      fill="#006c48"
                      className="cursor-pointer transition-all duration-200 hover:opacity-90"
                      opacity={selectedTimeShareSlice === 'charge' ? 1 : 0.65}
                      stroke={selectedTimeShareSlice === 'charge' ? '#ffffff' : 'none'}
                      strokeWidth={selectedTimeShareSlice === 'charge' ? 2 : 0}
                      onClick={() => setSelectedTimeShareSlice('charge')}
                    />
                  )}

                  {/* Rest Slice */}
                  {restPath && (
                    <path
                      d={restPath}
                      fill="#64748b"
                      className="cursor-pointer transition-all duration-200 hover:opacity-90"
                      opacity={selectedTimeShareSlice === 'rest' ? 1 : 0.65}
                      stroke={selectedTimeShareSlice === 'rest' ? '#ffffff' : 'none'}
                      strokeWidth={selectedTimeShareSlice === 'rest' ? 2 : 0}
                      onClick={() => setSelectedTimeShareSlice('rest')}
                    />
                  )}

                  {/* Donut Center Callout */}
                  <circle cx="100" cy="100" r="44" fill="#ffffff" />
                  <text
                    x="100"
                    y="95"
                    fill="#1a1c1f"
                    fontSize="16"
                    textAnchor="middle"
                    fontFamily="JetBrains Mono"
                    fontWeight="bold"
                  >
                    {selectedTimeShareSlice === 'discharge'
                      ? `${timeShare.dischargePercent}%`
                      : selectedTimeShareSlice === 'charge'
                      ? `${timeShare.chargePercent}%`
                      : `${timeShare.restPercent}%`}
                  </text>
                  <text
                    x="100"
                    y="112"
                    fill="#6d7a71"
                    fontSize="10"
                    textAnchor="middle"
                    fontFamily="JetBrains Mono"
                    fontWeight="bold"
                    className="uppercase"
                  >
                    {selectedTimeShareSlice}
                  </text>
                </svg>
              </div>

              {/* Legend Pills */}
              <div className="flex items-center justify-center gap-1 text-[11px] font-mono">
                <button
                  type="button"
                  onClick={() => setSelectedTimeShareSlice('discharge')}
                  className={`px-2 py-1 rounded transition-colors cursor-pointer flex items-center gap-1 ${
                    selectedTimeShareSlice === 'discharge' ? 'bg-orange-100 text-orange-800 font-bold' : 'text-on-surface-variant'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-orange-600"></span>
                  Discharge ({timeShare.dischargePercent}%)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTimeShareSlice('charge')}
                  className={`px-2 py-1 rounded transition-colors cursor-pointer flex items-center gap-1 ${
                    selectedTimeShareSlice === 'charge' ? 'bg-emerald-100 text-emerald-800 font-bold' : 'text-on-surface-variant'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                  Charge ({timeShare.chargePercent}%)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTimeShareSlice('rest')}
                  className={`px-2 py-1 rounded transition-colors cursor-pointer flex items-center gap-1 ${
                    selectedTimeShareSlice === 'rest' ? 'bg-slate-100 text-slate-800 font-bold' : 'text-on-surface-variant'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                  Rest ({timeShare.restPercent}%)
                </button>
              </div>
            </div>

            {/* Click-to-explain Factual Panel */}
            <div className="mt-4 p-space-sm rounded-lg bg-surface-container-low border border-surface-container-highest/60 text-[12px]">
              <div className="flex items-center gap-1.5 font-medium text-on-surface mb-1">
                <span className="material-symbols-outlined text-[16px] text-primary">info</span>
                <span>
                  {selectedTimeShareSlice === 'discharge'
                    ? 'Discharge Telemetry (Current < -0.05 A)'
                    : selectedTimeShareSlice === 'charge'
                    ? 'Charge Telemetry (Current > +0.05 A)'
                    : 'Rest Equilibrium (|Current| ≤ 0.05 A)'}
                </span>
              </div>
              <p className="text-on-surface-variant text-[11px] leading-relaxed">
                {selectedTimeShareSlice === 'discharge' &&
                  'Active discharge constitutes the primary operational workload where electrical energy is extracted from cells under load. Continuous discharge heat accelerates electrolyte side-reactions.'}
                {selectedTimeShareSlice === 'charge' &&
                  'Charging cycles replenish cell energy. Coulombic retention and thermal distribution during this phase govern the stability of the passivation layer on the electrodes.'}
                {selectedTimeShareSlice === 'rest' &&
                  'Zero-current rest intervals allow diffusion concentrations and internal thermal gradients to stabilize toward open-circuit thermodynamic equilibrium.'}
              </p>
            </div>
          </div>

          {/* Chart 2: Per-Cycle Discharge Duration Bar Chart */}
          <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm border border-surface-container-highest/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-label-md text-label-md uppercase tracking-wider font-semibold text-on-surface">
                  Per-Cycle Discharge Duration
                </h3>
                <span className="material-symbols-outlined text-[18px] text-primary">bar_chart</span>
              </div>
              <p className="text-[12px] text-on-surface-variant mt-0.5">
                Elapsed runtime per cycle until low-voltage cutoff is reached
              </p>

              {/* Hand-rolled SVG Bar Chart */}
              {cycleTable.length === 0 ? (
                <div className="h-44 flex items-center justify-center text-center p-4 text-on-surface-variant text-[12px]">
                  Cycle table data not available. Upload telemetry containing Cycle and Time columns.
                </div>
              ) : (
                <div className="my-4 w-full">
                  <svg viewBox="0 0 420 170" className="w-full h-44 select-none">
                    {/* Grid lines */}
                    <line x1="38" y1="15" x2="410" y2="15" stroke="#f1f5f9" strokeDasharray="2 2" />
                    <text x="34" y="19" fill="#6d7a71" fontSize="9" textAnchor="end" fontFamily="JetBrains Mono">
                      {Math.round(maxDischargeDuration / 60)}m
                    </text>

                    <line x1="38" y1="75" x2="410" y2="75" stroke="#f1f5f9" strokeDasharray="2 2" />
                    <text x="34" y="79" fill="#6d7a71" fontSize="9" textAnchor="end" fontFamily="JetBrains Mono">
                      {Math.round(maxDischargeDuration / 120)}m
                    </text>

                    <line x1="38" y1="135" x2="410" y2="135" stroke="#e2e8f0" />
                    <text x="34" y="139" fill="#6d7a71" fontSize="9" textAnchor="end" fontFamily="JetBrains Mono">
                      0m
                    </text>

                    {/* Bars */}
                    {cycleTable.map((c, i) => {
                      const slotW = (410 - 42) / cycleTable.length;
                      const barW = Math.max(3, Math.min(18, slotW * 0.72));
                      const barH = (c.dischargeDuration / (maxDischargeDuration || 1)) * 120;
                      const barX = 42 + i * slotW + (slotW - barW) / 2;
                      const barY = 135 - barH;
                      const isSelected = i === selectedCycleIdx;

                      return (
                        <g key={i} className="cursor-pointer" onClick={() => setSelectedCycleIdx(i)}>
                          <rect
                            x={barX}
                            y={barY}
                            width={barW}
                            height={Math.max(2, barH)}
                            rx="2"
                            fill={isSelected ? '#006c48' : '#94a3b8'}
                            opacity={isSelected ? 1 : 0.6}
                            className="transition-all duration-150 hover:opacity-100"
                          />
                          {isSelected && (
                            <circle cx={barX + barW / 2} cy={barY - 4} r="2.5" fill="#006c48" />
                          )}
                        </g>
                      );
                    })}

                    {/* Bottom cycle indicators */}
                    <text x="42" y="152" fill="#6d7a71" fontSize="9" fontFamily="JetBrains Mono">
                      Cyc {cycleTable[0]?.cycle ?? 1}
                    </text>
                    {cycleTable.length > 2 && (
                      <text
                        x={42 + ((410 - 42) / 2)}
                        y="152"
                        fill="#6d7a71"
                        fontSize="9"
                        textAnchor="middle"
                        fontFamily="JetBrains Mono"
                      >
                        Cyc {cycleTable[Math.floor(cycleTable.length / 2)]?.cycle}
                      </text>
                    )}
                    <text x="410" y="152" fill="#6d7a71" fontSize="9" textAnchor="end" fontFamily="JetBrains Mono">
                      Cyc {cycleTable[cycleTable.length - 1]?.cycle}
                    </text>
                  </svg>
                </div>
              )}
            </div>

            {/* Click-to-explain Factual Panel */}
            <div className="mt-4 p-space-sm rounded-lg bg-surface-container-low border border-surface-container-highest/60 text-[12px]">
              <div className="flex items-center justify-between font-medium text-on-surface mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary">timer</span>
                  <span>{activeCycle ? `Cycle #${activeCycle.cycle} Detail` : 'Cycle Detail'}</span>
                </div>
                {activeCycle && (
                  <span className="font-mono text-primary font-bold">
                    {Math.floor(activeCycle.dischargeDuration / 60)}m {activeCycle.dischargeDuration % 60}s
                  </span>
                )}
              </div>
              <p className="text-on-surface-variant text-[11px] leading-relaxed">
                {activeCycle
                  ? `Delivered ${activeCycle.capacity} Ah at mean ${activeCycle.meanVoltage} V (mean temp: ${activeCycle.meanTemperature}°C, peak: ${activeCycle.maxTemperature}°C). Under constant-current draw, discharge duration directly mirrors real usable capacity.`
                  : 'Click any bar to inspect discharge duration and delivered amp-hours for that test cycle.'}
              </p>
            </div>
          </div>

          {/* Chart 3: Capacity Fade Share Pie */}
          <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm border border-surface-container-highest/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-label-md text-label-md uppercase tracking-wider font-semibold text-on-surface">
                  Capacity Fade Share
                </h3>
                <span className="material-symbols-outlined text-[18px] text-primary">pie_chart</span>
              </div>
              <p className="text-[12px] text-on-surface-variant mt-0.5">
                Proportion of total observed capacity loss incurred in 1st half vs 2nd half of cycles
              </p>

              {/* Hand-rolled SVG Pie */}
              <div className="flex items-center justify-center my-4">
                <svg viewBox="0 0 200 200" className="w-44 h-44 select-none">
                  {/* First Half Slice */}
                  {pieSlice1 && (
                    <path
                      d={pieSlice1}
                      fill="#0284c7"
                      className="cursor-pointer transition-all duration-200 hover:opacity-90"
                      opacity={selectedFadeSlice === 'first' ? 1 : 0.65}
                      stroke={selectedFadeSlice === 'first' ? '#ffffff' : 'none'}
                      strokeWidth={selectedFadeSlice === 'first' ? 2 : 0}
                      onClick={() => setSelectedFadeSlice('first')}
                    />
                  )}

                  {/* Second Half Slice */}
                  {pieSlice2 && (
                    <path
                      d={pieSlice2}
                      fill="#7c3aed"
                      className="cursor-pointer transition-all duration-200 hover:opacity-90"
                      opacity={selectedFadeSlice === 'second' ? 1 : 0.65}
                      stroke={selectedFadeSlice === 'second' ? '#ffffff' : 'none'}
                      strokeWidth={selectedFadeSlice === 'second' ? 2 : 0}
                      onClick={() => setSelectedFadeSlice('second')}
                    />
                  )}

                  {/* Overlay callout dot */}
                  <circle cx="100" cy="100" r="8" fill="#ffffff" />
                </svg>
              </div>

              {/* Legend Pills */}
              <div className="flex items-center justify-center gap-2 text-[11px] font-mono">
                <button
                  type="button"
                  onClick={() => setSelectedFadeSlice('first')}
                  className={`px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1 ${
                    selectedFadeSlice === 'first' ? 'bg-sky-100 text-sky-800 font-bold' : 'text-on-surface-variant'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-sky-600"></span>
                  1st Half ({fadeShare.firstHalfPct}%)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFadeSlice('second')}
                  className={`px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1 ${
                    selectedFadeSlice === 'second' ? 'bg-purple-100 text-purple-800 font-bold' : 'text-on-surface-variant'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                  2nd Half ({fadeShare.secondHalfPct}%)
                </button>
              </div>
            </div>

            {/* Click-to-explain Factual Panel */}
            <div className="mt-4 p-space-sm rounded-lg bg-surface-container-low border border-surface-container-highest/60 text-[12px]">
              <div className="flex items-center gap-1.5 font-medium text-on-surface mb-1">
                <span className="material-symbols-outlined text-[16px] text-primary">analytics</span>
                <span>
                  {selectedFadeSlice === 'first' ? 'Early Degradation Dynamics' : 'Late Degradation Dynamics'}
                </span>
              </div>
              <p className="text-on-surface-variant text-[11px] leading-relaxed">
                {selectedFadeSlice === 'first' &&
                  `First half accounts for ${fadeShare.firstHalfPct}% of total capacity loss. In Li-ion cells, initial cycles typically feature primary SEI film passivation and surface conditioning.`}
                {selectedFadeSlice === 'second' &&
                  `Second half accounts for ${fadeShare.secondHalfPct}% of total capacity loss. A steady slope indicates linear aging, whereas an accelerated late fade signals electrode micro-cracking or lithium plating.`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Engineering Recommendations & Explainable AI */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl">
        {/* Engineering Recommendations & Action Plan (7 cols) */}
        <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl p-space-xl shadow-sm border border-surface-container-highest/40 flex flex-col justify-between gap-space-md">
          <div className="flex flex-col gap-space-sm">
            <div className="flex items-center gap-space-xs text-primary">
              <span className="material-symbols-outlined text-[20px]">smart_toy</span>
              <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                Engineering Action Directives
              </h3>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Run-specific advisory generated from the latest trained-model inference and observed telemetry.
            </p>

            <ul className="flex flex-col gap-space-sm mt-space-xs">
              {vehicle.recommendations.length === 0 && (
                <li className="text-body-sm text-on-surface-variant p-space-sm rounded-lg bg-surface-container-low border border-surface-container-highest/40">
                  No recommendations yet. Upload telemetry to generate a diagnostic report for this vehicle.
                </li>
              )}
              {vehicle.recommendations.map((rec, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-space-sm text-body-sm text-on-surface p-space-sm rounded-lg bg-surface-container-low border border-surface-container-highest/40"
                >
                  <span
                    className={`material-symbols-outlined text-[18px] mt-0.5 ${
                      isAttention && idx === 0 ? 'text-error' : 'text-primary'
                    }`}
                  >
                    {isAttention && idx === 0 ? 'warning' : 'check_circle'}
                  </span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-space-sm pt-space-sm border-t border-surface-container-highest/40">
            <button
              onClick={() => setCurrentTab('predictions')}
              className="flex-1 h-9 bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md font-semibold rounded-lg flex items-center justify-center gap-1 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">history</span>
              View Prediction History
            </button>
          </div>
        </div>

        {/* Explainable Predictions: why did the number change? (5 cols) */}
        <div className="lg:col-span-5 bg-surface-container-lowest rounded-xl p-space-xl shadow-sm border border-surface-container-highest/40 flex flex-col justify-between gap-space-md">
          <div className="flex flex-col gap-space-sm">
            <div className="flex items-center gap-space-xs text-primary">
              <span className="material-symbols-outlined text-[20px]">insights</span>
              <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                Why did this change?
              </h3>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Transparent rule-based factor attribution driving the latest SOH reading.
            </p>

            {(!vehicle.explanation || vehicle.explanation.length === 0) ? (
              <div className="text-body-sm text-on-surface-variant p-space-sm rounded-lg bg-surface-container-low border border-surface-container-highest/40">
                No explanation available yet. Run another analysis to see factor-level attribution.
              </div>
            ) : (
              <div className="flex flex-col gap-space-sm mt-space-xs">
                {vehicle.explanation.map((factor, idx) => (
                  <div
                    key={idx}
                    className="p-space-sm rounded-lg bg-surface-container-low border border-surface-container-highest/40 flex flex-col gap-space-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-label-sm text-label-sm font-semibold text-on-surface uppercase tracking-wide">
                        {factor.factor}
                      </span>
                      <span
                        className={`font-mono text-body-sm font-bold ${
                          factor.impactPct >= 0 ? 'text-primary' : 'text-on-surface-variant'
                        }`}
                      >
                        {typeof factor.impactPct === 'number' ? `${factor.impactPct}%` : 'Observed'}
                      </span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant">{factor.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-space-sm rounded-lg bg-surface-container-low border border-surface-container-highest/60 text-[11px] text-on-surface-variant">
            <span className="font-semibold text-on-surface block mb-0.5">Explainable AI Policy</span>
            The report shows observed inputs and the trained-model result. It does not assign percentage credit to features or untrained electrochemical mechanisms.
          </div>
        </div>
      </div>
    </div>
  );
}
