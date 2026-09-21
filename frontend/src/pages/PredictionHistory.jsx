import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatDateIST } from '../utils/mappers';

export default function PredictionHistory() {
  const { predictions, selectVehicleForReport, searchQuery } = useApp();
  const [modelFilter, setModelFilter] = useState('all');
  const [selectedRun, setSelectedRun] = useState(null);

  const filteredPredictions = predictions.filter((p) => {
    const matchesSearch = searchQuery
      ? p.vehicleName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.vin.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.modelVersion.toLowerCase().includes(searchQuery.toLowerCase())
      : true;

    if (modelFilter === 'all') return matchesSearch;
    return matchesSearch && p.status.toLowerCase() === modelFilter.toLowerCase();
  });

  const sohValues = predictions.map((p) => Number(p.measuredSoh)).filter((n) => !isNaN(n));
  const meanSoh = sohValues.length > 0
    ? (sohValues.reduce((a, b) => a + b, 0) / sohValues.length).toFixed(1)
    : '—';

  // Chronological (oldest first) slice for the trend chart.
  const chartData = useMemo(() => {
    return [...predictions]
      .sort((a, b) => new Date(a.timestampRaw) - new Date(b.timestampRaw))
      .slice(-10);
  }, [predictions]);

  const chart = useMemo(() => {
    if (chartData.length === 0) return null;

    const values = chartData.map((p) => p.measuredSoh);
    const minSoh = Math.max(0, Math.min(...values) - 2.0);
    const maxSoh = Math.min(105, Math.max(...values) + 2.0);
    const range = maxSoh - minSoh || 1;

    const left = 50;
    const right = 860;
    const top = 20;
    const bottom = 120;

    const xFor = (i) => (chartData.length === 1 ? (left + right) / 2 : left + (i * (right - left)) / (chartData.length - 1));
    const yFor = (soh) => top + ((maxSoh - soh) / range) * (bottom - top);

    const points = chartData.map((p, i) => ({
      x: xFor(i),
      y: yFor(p.measuredSoh),
      date: formatDateIST(p.timestampRaw),
      data: p,
      index: i,
    }));

    const linePoints = points.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');

    return { points, linePoints, minSoh, maxSoh };
  }, [chartData]);

  return (
    <div className="flex flex-col w-full pb-space-4xl">
      {/* Page Header & Statistical Highlights Banner */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-lg mb-space-xl">
        <div className="flex flex-col gap-space-xs max-w-3xl">
          <div className="flex items-center gap-space-xs">
            <span className="font-label-sm text-label-sm text-primary uppercase font-semibold tracking-wider">
              Telemetry Audit Trail
            </span>
            <span className="text-on-surface-variant font-label-sm text-label-sm">/</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">Battery Diagnostics</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
            Performance History
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Track how your battery's State of Health and remaining useful life trajectories evolve across uploaded runs.
          </p>
        </div>

        {/* Telemetry Snapshot Cards */}
        <div className="flex items-center gap-space-md flex-wrap lg:flex-nowrap">
          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex items-center gap-space-md min-w-[180px] border border-surface-container-highest/40">
            <div className="w-10 h-10 rounded-lg bg-secondary-container/40 flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[20px]">batch_prediction</span>
            </div>
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">Logged Runs</span>
              <span className="font-telemetry-md text-telemetry-md text-on-surface font-semibold font-mono">
                {predictions.length}
              </span>
            </div>
          </div>

          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex items-center gap-space-md min-w-[180px] border border-surface-container-highest/40">
            <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[20px]">battery_charging_full</span>
            </div>
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">Average SOH</span>
              <span className="font-telemetry-md text-telemetry-md text-on-surface font-semibold font-mono">
                {meanSoh}<span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant font-normal">%</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Longitudinal SOH Trajectory Ribbon */}
      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm mb-space-xl border border-surface-container-highest/40">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-space-md pb-space-md">
          <div className="flex flex-col gap-space-2xs">
            <div className="flex items-center gap-space-xs">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                Observed SOH Trajectory Across Analysis Passes
              </h2>
              <span className="font-label-sm text-label-sm bg-surface-container px-space-xs py-space-2xs rounded text-on-surface-variant font-mono">
                Last {chartData.length} Runs
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Click any point on the trajectory curve to inspect diagnostic details for that analysis run.
            </p>
          </div>

          <div className="flex items-center gap-space-md flex-wrap text-[12px] font-mono">
            <div className="flex items-center gap-space-xs">
              <span className="inline-block w-3 h-0.5 bg-primary"></span>
              <span className="text-on-surface-variant">Measured State of Health (SOH)</span>
            </div>
          </div>
        </div>

        {/* SVG Longitudinal Graph */}
        <div className="w-full bg-surface-container-low/40 rounded-xl p-3 border border-surface-container-highest/40 overflow-x-auto">
          {!chart ? (
            <div className="h-40 flex items-center justify-center text-body-sm text-on-surface-variant">
              No predictions logged yet. Upload a dataset to start building your history.
            </div>
          ) : (
            <svg viewBox="0 0 900 160" className="w-full h-40 select-none">
              {/* Grid Lines */}
              <line x1="40" y1="20" x2="860" y2="20" stroke="#e2e2e6" strokeDasharray="3 3" />
              <text x="30" y="24" fill="#6d7a71" fontSize="10" textAnchor="end" fontFamily="JetBrains Mono">{chart.maxSoh.toFixed(1)}%</text>

              <line x1="40" y1="70" x2="860" y2="70" stroke="#e2e2e6" strokeDasharray="3 3" />
              <text x="30" y="74" fill="#6d7a71" fontSize="10" textAnchor="end" fontFamily="JetBrains Mono">
                {((chart.maxSoh + chart.minSoh) / 2).toFixed(1)}%
              </text>

              <line x1="40" y1="120" x2="860" y2="120" stroke="#e2e2e6" strokeDasharray="3 3" />
              <text x="30" y="124" fill="#6d7a71" fontSize="10" textAnchor="end" fontFamily="JetBrains Mono">{chart.minSoh.toFixed(1)}%</text>

              {/* Trajectory line */}
              <polyline points={chart.linePoints} fill="none" stroke="#006c48" strokeWidth="2.5" />

              {/* Clickable Points */}
              {chart.points.map((pt, i) => {
                const isSelected = selectedRun?.id === pt.data.id;
                return (
                  <g 
                    key={i} 
                    onClick={() => setSelectedRun(pt.data)} 
                    className="cursor-pointer group"
                  >
                    <circle 
                      cx={pt.x} 
                      cy={pt.y} 
                      r={isSelected ? "7" : "5"} 
                      fill={isSelected ? "#006c48" : "#ffffff"} 
                      stroke="#006c48" 
                      strokeWidth={isSelected ? "3" : "2.5"} 
                      className="transition-all hover:scale-125"
                    />
                    <text x={pt.x} y="145" fill="#6d7a71" fontSize="10" textAnchor="middle" fontFamily="JetBrains Mono">
                      {pt.date}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Interactive Selected Data Point Popover */}
        {selectedRun && (
          <div className="mt-space-md p-space-md rounded-xl bg-surface-container-low border border-primary/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-md animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary text-on-primary flex items-center justify-center font-mono font-bold text-sm">
                #{selectedRun.currentCycle}
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-on-surface text-sm">{selectedRun.vehicleName}</span>
                  <span className="px-2 py-0.5 rounded bg-primary-container text-on-primary-container font-mono text-xs font-bold">
                    SOH: {selectedRun.measuredSoh}%
                  </span>
                  <span className="text-xs text-on-surface-variant font-mono">
                    RUL: {selectedRun.rulCycles}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Logged at {selectedRun.timestamp}. SOH was derived from model inference using the configured training pipeline and verified against discharge capacity.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => selectVehicleForReport(selectedRun.vehicleId)}
                className="text-primary hover:text-primary-container font-label-sm text-xs font-semibold inline-flex items-center gap-1"
              >
                Inspect Report →
              </button>
              <button
                type="button"
                onClick={() => setSelectedRun(null)}
                className="text-on-surface-variant hover:text-on-surface p-1 text-xs"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Prediction History Table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-surface-container-highest/40 overflow-hidden">
        <div className="p-space-lg flex flex-col sm:flex-row sm:items-center justify-between gap-space-md border-b border-surface-container-highest">
          <div>
            <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
              Logged Diagnostic Records
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Chronological ledger of telemetry analyses, evaluated cycles, and projected life
            </p>
          </div>
          <div className="flex items-center gap-space-xs">
            <button 
              onClick={() => setModelFilter('all')}
              className={`px-3 py-1 rounded font-label-sm text-label-sm font-semibold transition-all cursor-pointer ${
                modelFilter === 'all' ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant'
              }`}
            >
              All Runs
            </button>
            <button 
              onClick={() => setModelFilter('healthy')}
              className={`px-3 py-1 rounded font-label-sm text-label-sm font-semibold transition-all cursor-pointer ${
                modelFilter === 'healthy' ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant'
              }`}
            >
              Healthy
            </button>
            <button 
              onClick={() => setModelFilter('attention')}
              className={`px-3 py-1 rounded font-label-sm text-label-sm font-semibold transition-all cursor-pointer ${
                modelFilter === 'attention' ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant'
              }`}
            >
              Attention
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-surface-container-highest font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                <th className="py-3 px-4 font-semibold">Timestamp (IST)</th>
                <th className="py-3 px-4 font-semibold">Vehicle</th>
                <th className="py-3 px-4 font-semibold">Model Engine</th>
                <th className="py-3 px-4 font-semibold">Observed SOH</th>
                <th className="py-3 px-4 font-semibold">Cycle Count</th>
                <th className="py-3 px-4 font-semibold">Projected RUL</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-highest/40 font-body-sm text-body-sm">
              {filteredPredictions.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 px-4 text-center text-on-surface-variant">
                    No diagnostic runs logged yet. Upload telemetry data to begin.
                  </td>
                </tr>
              )}
              {filteredPredictions.map((row) => (
                <tr key={row.id} className="hover:bg-surface-container-low/60 transition-colors">
                  <td className="py-3 px-4 font-mono text-[12px] text-on-surface">
                    {row.timestamp}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-on-surface">{row.vehicleName}</span>
                      <span className="font-mono text-[11px] text-on-surface-variant">{row.vin}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-[12px] text-on-surface-variant">
                    {row.modelVersion}
                  </td>
                  <td className="py-3 px-4 font-mono">
                    <span className="font-bold text-primary">{row.measuredSoh}%</span>
                  </td>
                  <td className="py-3 px-4 font-mono text-[12px] text-on-surface">
                    {row.currentCycle} cyc
                  </td>
                  <td className="py-3 px-4 font-mono text-[12px] text-on-surface">
                    {row.rulCycles}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold font-mono ${
                      row.status === 'Healthy'
                        ? 'bg-secondary-container text-on-secondary-container'
                        : 'bg-error-container text-on-error-container'
                    }`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button 
                      onClick={() => selectVehicleForReport(row.vehicleId)}
                      className="text-primary hover:text-primary-container font-label-sm text-label-sm font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      Inspect
                      <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
