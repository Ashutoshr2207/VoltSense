import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function PredictionHistory() {
  const { predictions, selectVehicleForReport, searchQuery } = useApp();
  const [modelFilter, setModelFilter] = useState('all');

  const filteredPredictions = predictions.filter(p => {
    const matchesSearch = searchQuery
      ? p.vehicleName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.vin.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.modelVersion.toLowerCase().includes(searchQuery.toLowerCase())
      : true;

    if (modelFilter === 'all') return matchesSearch;
    return matchesSearch && p.status.toLowerCase() === modelFilter.toLowerCase();
  });

  return (
    <div className="flex flex-col w-full pb-space-4xl">
      {/* Page Header & Statistical Highlights Banner */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-lg mb-space-xl">
        <div className="flex flex-col gap-space-xs max-w-3xl">
          <div className="flex items-center gap-space-xs">
            <span className="font-label-sm text-label-sm text-primary uppercase font-semibold tracking-wider">
              Inference Audit Trail
            </span>
            <span className="text-on-surface-variant font-label-sm text-label-sm">/</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">Fleet Bayesian Model Telemetry</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
            Prediction History
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Track how Bayesian electrochemical model inferences and SOH degradation forecasts evolve over time across your fleet.
          </p>
        </div>

        {/* Telemetry Snapshot Cards */}
        <div className="flex items-center gap-space-md flex-wrap lg:flex-nowrap">
          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex items-center gap-space-md min-w-[180px] border border-surface-container-highest/40">
            <div className="w-10 h-10 rounded-lg bg-secondary-container/40 flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[20px]">batch_prediction</span>
            </div>
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">Logged Inferences</span>
              <span className="font-telemetry-md text-telemetry-md text-on-surface font-semibold font-mono">
                1,428 <span className="text-primary text-[11px] font-mono font-normal">↑ 12.4%</span>
              </span>
            </div>
          </div>

          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex items-center gap-space-md min-w-[180px] border border-surface-container-highest/40">
            <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[20px]">speed</span>
            </div>
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">Mean Inference</span>
              <span className="font-telemetry-md text-telemetry-md text-on-surface font-semibold font-mono">
                41.8<span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant font-normal">ms</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Longitudinal Stability & Bayesian Uncertainty Ribbon */}
      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm mb-space-xl border border-surface-container-highest/40">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-space-md pb-space-md">
          <div className="flex flex-col gap-space-2xs">
            <div className="flex items-center gap-space-xs">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                Longitudinal SOH Convergence & 95% Credible Interval
              </h2>
              <span className="font-label-sm text-label-sm bg-surface-container px-space-xs py-space-2xs rounded text-on-surface-variant font-mono">
                Last 6 Active Runs
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Model drift stability index across consecutive parameter extractions for monitored fleet assets.
            </p>
          </div>

          <div className="flex items-center gap-space-md flex-wrap text-[12px] font-mono">
            <div className="flex items-center gap-space-xs">
              <span className="inline-block w-3 h-0.5 bg-primary"></span>
              <span className="text-on-surface-variant">Measured SOH</span>
            </div>
            <div className="flex items-center gap-space-xs">
              <span className="inline-block w-3 h-2 bg-primary/20 rounded-sm"></span>
              <span className="text-on-surface-variant">Bayesian Credible Band (±0.45%)</span>
            </div>
          </div>
        </div>

        {/* SVG Longitudinal Graph */}
        <div className="w-full bg-surface-container-low/40 rounded-xl p-3 border border-surface-container-highest/40 overflow-x-auto">
          <svg viewBox="0 0 900 160" className="w-full h-40 select-none">
            {/* Grid */}
            <line x1="40" y1="20" x2="860" y2="20" stroke="#e2e2e6" strokeDasharray="3 3" />
            <text x="30" y="24" fill="#6d7a71" fontSize="10" textAnchor="end" fontFamily="JetBrains Mono">96%</text>

            <line x1="40" y1="70" x2="860" y2="70" stroke="#e2e2e6" strokeDasharray="3 3" />
            <text x="30" y="74" fill="#6d7a71" fontSize="10" textAnchor="end" fontFamily="JetBrains Mono">92%</text>

            <line x1="40" y1="120" x2="860" y2="120" stroke="#e2e2e6" strokeDasharray="3 3" />
            <text x="30" y="124" fill="#6d7a71" fontSize="10" textAnchor="end" fontFamily="JetBrains Mono">88%</text>

            {/* Credible Interval Band */}
            <polygon
              points="
                50,42 200,45 350,48 500,52 650,55 800,58
                800,72 650,69 500,66 350,62 200,59 50,56
              "
              fill="#19a974"
              fillOpacity="0.18"
            />

            {/* Trajectory line */}
            <polyline
              points="50,49 200,52 350,55 500,59 650,62 800,65"
              fill="none"
              stroke="#006c48"
              strokeWidth="2.5"
            />

            {/* Points */}
            {[
              { x: 50, y: 49, date: 'Aug 24' },
              { x: 200, y: 52, date: 'Aug 27' },
              { x: 350, y: 55, date: 'Aug 30' },
              { x: 500, y: 59, date: 'Sep 02' },
              { x: 650, y: 62, date: 'Sep 05' },
              { x: 800, y: 65, date: 'Sep 07' },
            ].map((pt, i) => (
              <g key={i}>
                <circle cx={pt.x} cy={pt.y} r="5" fill="#006c48" stroke="#ffffff" strokeWidth="2" />
                <text x={pt.x} y="145" fill="#6d7a71" fontSize="10" textAnchor="middle" fontFamily="JetBrains Mono">
                  {pt.date}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* Prediction History Table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-surface-container-highest/40 overflow-hidden">
        <div className="p-space-lg flex flex-col sm:flex-row sm:items-center justify-between gap-space-md border-b border-surface-container-highest">
          <div>
            <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
              Logged Inference Records
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Full electrochemical model runs with execution latency and residual bounds
            </p>
          </div>
          <div className="flex items-center gap-space-xs">
            <button 
              onClick={() => setModelFilter('all')}
              className={`px-3 py-1 rounded font-label-sm text-label-sm font-semibold transition-all ${
                modelFilter === 'all' ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant'
              }`}
            >
              All Runs
            </button>
            <button 
              onClick={() => setModelFilter('nominal')}
              className={`px-3 py-1 rounded font-label-sm text-label-sm font-semibold transition-all ${
                modelFilter === 'nominal' ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant'
              }`}
            >
              Nominal
            </button>
            <button 
              onClick={() => setModelFilter('drift flag')}
              className={`px-3 py-1 rounded font-label-sm text-label-sm font-semibold transition-all ${
                modelFilter === 'drift flag' ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant'
              }`}
            >
              Drift Flags
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-surface-container-highest font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                <th className="py-3 px-4 font-semibold">Timestamp (UTC)</th>
                <th className="py-3 px-4 font-semibold">Target Vehicle</th>
                <th className="py-3 px-4 font-semibold">Model Version</th>
                <th className="py-3 px-4 font-semibold">Measured / Pred SOH</th>
                <th className="py-3 px-4 font-semibold">Δ Residual</th>
                <th className="py-3 px-4 font-semibold">95% Credible Band</th>
                <th className="py-3 px-4 font-semibold">Latency</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-highest/40 font-body-sm text-body-sm">
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
                    <span className="font-bold text-on-surface">{row.measuredSoh}%</span> / <span className="text-on-surface-variant">{row.predictedSoh}%</span>
                  </td>
                  <td className="py-3 px-4 font-mono font-medium text-primary">
                    {row.delta}
                  </td>
                  <td className="py-3 px-4 font-mono text-[12px] text-on-surface-variant">
                    [{row.credibleInterval}]
                  </td>
                  <td className="py-3 px-4 font-mono text-[12px] text-on-surface">
                    {row.latency}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold font-mono ${
                      row.status === 'Nominal'
                        ? 'bg-secondary-container text-on-secondary-container'
                        : 'bg-error-container text-on-error-container'
                    }`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button 
                      onClick={() => selectVehicleForReport(row.vehicleId)}
                      className="text-primary hover:text-primary-container font-label-sm text-label-sm font-semibold inline-flex items-center gap-1"
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
