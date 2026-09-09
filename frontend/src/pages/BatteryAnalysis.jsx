import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function BatteryAnalysis() {
  const { vehicles, selectedVehicleId, setSelectedVehicleId, setCurrentTab } = useApp();

  const [activeRange, setActiveRange] = useState('all');

  const vehicle = vehicles.find(v => v.id === selectedVehicleId) || vehicles[0];
  const isAttention = vehicle.status === 'Attention';

  // Export PDF simulation
  const handleExportPdf = () => {
    window.print();
  };

  // Generate SVG degradation trajectory points
  // X: 0 to 1000 cycles -> SVG x: 50 to 750
  // Y: 70% to 100% SOH -> SVG y: 220 to 30
  const cyclesCurrent = vehicle.cycles;
  const sohCurrent = vehicle.soh;

  const currentX = 50 + (cyclesCurrent / 1200) * 700;
  const currentY = 30 + ((100 - sohCurrent) / 30) * 190;

  // Mock cell balance voltages for 16 cell groups
  const baseVoltage = isAttention ? 4.09 : 4.12;
  const cellVoltages = Array.from({ length: 16 }, (_, i) => {
    let delta = ((Math.sin(i * 1.5) * 0.003) + (Math.cos(i * 0.8) * 0.002)).toFixed(3);
    if (isAttention && (i === 13 || i === 14)) {
      delta = (parseFloat(delta) - 0.014).toFixed(3); // 14mV drop in bank 14
    }
    return {
      cellNum: `B${i + 1}`,
      voltage: (baseVoltage + parseFloat(delta)).toFixed(3),
      isOutlier: isAttention && (i === 13 || i === 14)
    };
  });

  return (
    <div className="flex flex-col w-full pb-space-4xl">
      {/* Breadcrumb & Top Context Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md mb-space-xl">
        <div className="flex flex-col">
          <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider mb-space-xs">
            <button 
              onClick={() => setCurrentTab('vehicles')}
              className="hover:text-primary transition-colors cursor-pointer"
            >
              My Vehicles
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
          {/* Switch Vehicle Selector */}
          <div className="relative">
            <select 
              value={selectedVehicleId}
              onChange={e => setSelectedVehicleId(e.target.value)}
              className="h-9 pl-3 pr-8 bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-medium rounded-lg appearance-none cursor-pointer focus:outline-none border border-surface-container-highest/60"
            >
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant text-[16px] pointer-events-none">
              expand_more
            </span>
          </div>

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
            <span>Dataset: <span className="font-mono text-on-surface font-medium">bms_telemetry.csv</span> <span className="text-[11px] font-mono">({vehicle.recordsCount.toLocaleString()} records)</span></span>
          </div>
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-[16px] text-primary">memory</span>
            <span>Inference Engine: <strong className="text-on-surface font-mono font-medium">VoltSense Bayesian v1.0</strong></span>
          </div>
        </div>
      </div>

      {/* Key Diagnostic Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md mb-space-xl">
        {/* SOH */}
        <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm border border-surface-container-highest/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold">State of Health (SOH)</span>
            <span className={`material-symbols-outlined text-[20px] ${isAttention ? 'text-error' : 'text-primary'}`}>
              battery_charging_full
            </span>
          </div>
          <div className="mt-space-md flex items-baseline gap-space-xs">
            <span className={`font-telemetry-hero text-telemetry-hero font-mono font-medium ${isAttention ? 'text-error' : 'text-on-surface'}`}>
              {vehicle.soh}
            </span>
            <span className="font-telemetry-sm text-telemetry-sm font-mono text-on-surface-variant">%</span>
          </div>
          <div className="mt-space-sm pt-space-sm border-t border-surface-container-highest/40 text-[12px] text-on-surface-variant flex justify-between">
            <span>EOL Threshold: <strong className="font-mono text-on-surface">70.0%</strong></span>
            <span className="font-mono text-primary font-medium">EOL in {vehicle.rul} cyc</span>
          </div>
        </div>

        {/* Degradation Rate */}
        <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm border border-surface-container-highest/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold">Degradation Rate</span>
            <span className="material-symbols-outlined text-[20px] text-primary">trending_down</span>
          </div>
          <div className="mt-space-md flex items-baseline gap-space-xs">
            <span className="font-telemetry-hero text-telemetry-hero font-mono font-medium text-on-surface">
              {vehicle.degradationRate.split(' ')[0]}
            </span>
            <span className="font-telemetry-sm text-telemetry-sm font-mono text-on-surface-variant">/ month</span>
          </div>
          <div className="mt-space-sm pt-space-sm border-t border-surface-container-highest/40 text-[12px] text-on-surface-variant flex justify-between">
            <span>Fleet benchmark</span>
            <span className="font-mono text-on-surface font-semibold">-0.14% / mo</span>
          </div>
        </div>

        {/* Internal Resistance */}
        <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm border border-surface-container-highest/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold">Internal Resistance</span>
            <span className="material-symbols-outlined text-[20px] text-secondary">tune</span>
          </div>
          <div className="mt-space-md flex items-baseline gap-space-xs">
            <span className="font-telemetry-hero text-telemetry-hero font-mono font-medium text-on-surface">
              {vehicle.internalResistance.split(' ')[0]}
            </span>
            <span className="font-telemetry-sm text-telemetry-sm font-mono text-on-surface-variant">mΩ</span>
          </div>
          <div className="mt-space-sm pt-space-sm border-t border-surface-container-highest/40 text-[12px] text-on-surface-variant flex justify-between">
            <span>Factory baseline</span>
            <span className="font-mono text-on-surface">1.6 mΩ (Nominal)</span>
          </div>
        </div>

        {/* Max Cell Imbalance */}
        <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm border border-surface-container-highest/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold">Max Cell Imbalance</span>
            <span className={`material-symbols-outlined text-[20px] ${isAttention ? 'text-error' : 'text-primary'}`}>
              balance
            </span>
          </div>
          <div className="mt-space-md flex items-baseline gap-space-xs">
            <span className={`font-telemetry-hero text-telemetry-hero font-mono font-medium ${isAttention ? 'text-error' : 'text-on-surface'}`}>
              {vehicle.cellImbalance.split(' ')[0]}
            </span>
            <span className="font-telemetry-sm text-telemetry-sm font-mono text-on-surface-variant">mV</span>
          </div>
          <div className="mt-space-sm pt-space-sm border-t border-surface-container-highest/40 text-[12px] flex justify-between">
            <span className="text-on-surface-variant">Max Allowed</span>
            <span className={`font-mono font-semibold ${isAttention ? 'text-error' : 'text-primary'}`}>
              {isAttention ? 'Alert (>10mV)' : 'Nominal (<10mV)'}
            </span>
          </div>
        </div>
      </div>

      {/* Primary Degradation Chart & Loss Mechanism Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl mb-space-xl">
        {/* Left: Degradation Trajectory Curve (8 cols) */}
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
                Longitudinal Bayesian trajectory with 95% Credible Interval and EOL projection
              </p>
            </div>

            <div className="flex items-center gap-space-sm text-label-sm text-on-surface-variant font-mono">
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-primary inline-block"></span> Model Fit
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-2 bg-primary/20 rounded inline-block"></span> 95% Credible Band
              </span>
            </div>
          </div>

          {/* Interactive SVG Chart */}
          <div className="w-full bg-surface-container-low/40 rounded-xl p-2 border border-surface-container-highest/40 overflow-x-auto">
            <svg viewBox="0 0 800 280" className="w-full h-64 select-none">
              <defs>
                <linearGradient id="credibleBand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#006c48" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#006c48" stopOpacity="0.05" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="50" y1="30" x2="750" y2="30" stroke="#e2e2e6" strokeDasharray="3 3" />
              <text x="40" y="34" fill="#6d7a71" fontSize="10" textAnchor="end" fontFamily="JetBrains Mono">100%</text>

              <line x1="50" y1="95" x2="750" y2="95" stroke="#e2e2e6" strokeDasharray="3 3" />
              <text x="40" y="99" fill="#6d7a71" fontSize="10" textAnchor="end" fontFamily="JetBrains Mono">90%</text>

              <line x1="50" y1="160" x2="750" y2="160" stroke="#e2e2e6" strokeDasharray="3 3" />
              <text x="40" y="164" fill="#6d7a71" fontSize="10" textAnchor="end" fontFamily="JetBrains Mono">80%</text>

              {/* 70% EOL Red Threshold Line */}
              <line x1="50" y1="220" x2="750" y2="220" stroke="#ba1a1a" strokeWidth="1.5" strokeDasharray="4 4" />
              <text x="40" y="224" fill="#ba1a1a" fontSize="10" textAnchor="end" fontFamily="JetBrains Mono" fontWeight="bold">70% EOL</text>

              {/* X Axis Labels */}
              <text x="50" y="250" fill="#6d7a71" fontSize="10" fontFamily="JetBrains Mono">0 Cyc</text>
              <text x="225" y="250" fill="#6d7a71" fontSize="10" fontFamily="JetBrains Mono">300 Cyc</text>
              <text x="400" y="250" fill="#6d7a71" fontSize="10" fontFamily="JetBrains Mono">600 Cyc</text>
              <text x="575" y="250" fill="#6d7a71" fontSize="10" fontFamily="JetBrains Mono">900 Cyc</text>
              <text x="750" y="250" fill="#6d7a71" fontSize="10" textAnchor="end" fontFamily="JetBrains Mono">1200 Cyc</text>

              {/* 95% Credible Band polygon */}
              <polygon
                points="
                  50,30 
                  200,55 
                  380,85 
                  550,135 
                  750,230 
                  750,210 
                  550,115 
                  380,70 
                  200,45 
                  50,30
                "
                fill="url(#credibleBand)"
              />

              {/* Mean Bayesian Trajectory Line */}
              <path
                d="M 50 30 Q 250 65, 450 110 T 750 220"
                fill="none"
                stroke="#006c48"
                strokeWidth="2.5"
              />

              {/* Current Measured Position Point */}
              <circle cx={currentX} cy={currentY} r="7" fill="#006c48" stroke="#ffffff" strokeWidth="2.5" />
              <circle cx={currentX} cy={currentY} r="12" fill="#006c48" fillOpacity="0.2" className="animate-ping" />

              {/* Tooltip callout above current point */}
              <rect x={currentX - 55} y={currentY - 40} width="110" height="24" rx="4" fill="#1a1c1f" />
              <text x={currentX} y={currentY - 24} fill="#ffffff" fontSize="11" textAnchor="middle" fontFamily="JetBrains Mono" fontWeight="bold">
                {sohCurrent}% @ {cyclesCurrent} cyc
              </text>
            </svg>
          </div>

          <div className="flex flex-wrap items-center justify-between text-body-sm text-on-surface-variant font-mono text-[12px] pt-1">
            <span>Degradation Model: Empirical Plett-Dahn Non-Linear SOH</span>
            <span>R² Goodness of Fit: 0.994</span>
          </div>
        </div>

        {/* Right: Degradation Mechanism Breakdown (4 cols) */}
        <div className="lg:col-span-4 bg-surface-container-lowest rounded-xl p-space-xl shadow-sm border border-surface-container-highest/40 flex flex-col justify-between gap-space-md">
          <div className="flex flex-col gap-space-sm">
            <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
              Degradation Drivers
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Electrochemical decomposition from dQ/dV and differential thermal impedance fitting.
            </p>

            <div className="flex flex-col gap-space-md mt-space-sm">
              {/* LLI */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-body-sm">
                  <span className="font-medium text-on-surface">Loss of Lithium Inventory (LLI)</span>
                  <span className="font-mono font-bold text-primary">{vehicle.lossBreakdown.lli}%</span>
                </div>
                <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${vehicle.lossBreakdown.lli * 10}%` }}></div>
                </div>
                <span className="text-[11px] text-on-surface-variant">SEI layer growth & passive lithium consumption</span>
              </div>

              {/* LAM */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-body-sm">
                  <span className="font-medium text-on-surface">Loss of Active Material (LAM)</span>
                  <span className="font-mono font-bold text-secondary">{vehicle.lossBreakdown.lam}%</span>
                </div>
                <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
                  <div className="h-full bg-secondary rounded-full" style={{ width: `${vehicle.lossBreakdown.lam * 15}%` }}></div>
                </div>
                <span className="text-[11px] text-on-surface-variant">Cathode micro-cracking & active site isolation</span>
              </div>

              {/* Ohmic */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-body-sm">
                  <span className="font-medium text-on-surface">Ohmic Resistance Growth</span>
                  <span className="font-mono font-bold text-tertiary">+{vehicle.lossBreakdown.ohmic}%</span>
                </div>
                <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
                  <div className="h-full bg-tertiary rounded-full" style={{ width: `${vehicle.lossBreakdown.ohmic * 12}%` }}></div>
                </div>
                <span className="text-[11px] text-on-surface-variant">Collector foil corrosion & electrolyte dry-out</span>
              </div>
            </div>
          </div>

          <div className="p-space-md rounded-lg bg-surface-container-low border border-surface-container-highest/60 text-[12px] text-on-surface-variant">
            <span className="font-semibold text-on-surface block mb-1">Diagnostic Classification</span>
            {isAttention 
              ? "Elevated LLI and bank-localized impedance indicating early-stage electrolyte polarization."
              : "Standard nominal aging profile. SEI passivation proceeding at baseline trajectory."}
          </div>
        </div>
      </div>

      {/* Cell Voltage Distribution & Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl">
        {/* Cell Voltage Spread Bar Chart (7 cols) */}
        <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl p-space-xl shadow-sm border border-surface-container-highest/40 flex flex-col gap-space-md">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                Cell Bank Voltage Spread (16-Bank Matrix)
              </h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Measured at 50% SOC rest stabilization (Tolerance: ±5 mV)
              </p>
            </div>
            <span className={`font-mono font-bold text-label-md px-2 py-1 rounded ${
              isAttention ? 'bg-error-container text-on-error-container' : 'bg-secondary-container text-on-secondary-container'
            }`}>
              Δ {vehicle.cellImbalance}
            </span>
          </div>

          {/* Bar chart */}
          <div className="grid grid-cols-16 gap-1 h-36 items-end pt-6 pb-2 px-2 bg-surface-container-low/40 rounded-xl border border-surface-container-highest/40">
            {cellVoltages.map((cell, idx) => {
              const heightPct = Math.max(20, Math.min(100, (parseFloat(cell.voltage) - 4.05) * 1200));
              return (
                <div key={idx} className="flex flex-col items-center gap-1 group relative">
                  <div 
                    className={`w-full rounded-t transition-all ${
                      cell.isOutlier ? 'bg-error' : 'bg-primary-container group-hover:bg-primary'
                    }`}
                    style={{ height: `${heightPct}%` }}
                  ></div>
                  <span className="text-[9px] font-mono text-on-surface-variant">{cell.cellNum}</span>

                  {/* Hover Tooltip */}
                  <div className="absolute -top-8 bg-inverse-surface text-inverse-on-surface text-[10px] font-mono px-1.5 py-0.5 rounded shadow opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-10">
                    {cell.voltage} V
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between items-center text-[12px] text-on-surface-variant font-mono">
            <span>Min Cell: {isAttention ? '4.088 V (B14)' : '4.118 V (B7)'}</span>
            <span>Mean: {isAttention ? '4.098 V' : '4.122 V'}</span>
            <span>Max Cell: {isAttention ? '4.102 V (B2)' : '4.124 V (B1)'}</span>
          </div>
        </div>

        {/* Engineering Recommendations & Action Plan (5 cols) */}
        <div className="lg:col-span-5 bg-surface-container-lowest rounded-xl p-space-xl shadow-sm border border-surface-container-highest/40 flex flex-col justify-between gap-space-md">
          <div className="flex flex-col gap-space-sm">
            <div className="flex items-center gap-space-xs text-primary">
              <span className="material-symbols-outlined text-[20px]">smart_toy</span>
              <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                Engineering Action Directives
              </h3>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Automated advisory generated by VoltSense Bayesian Health Classifier.
            </p>

            <ul className="flex flex-col gap-space-sm mt-space-xs">
              {vehicle.recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-space-sm text-body-sm text-on-surface p-space-sm rounded-lg bg-surface-container-low border border-surface-container-highest/40">
                  <span className={`material-symbols-outlined text-[18px] mt-0.5 ${
                    isAttention && idx === 1 ? 'text-error' : 'text-primary'
                  }`}>
                    {isAttention && idx === 1 ? 'warning' : 'check_circle'}
                  </span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-space-sm pt-space-sm border-t border-surface-container-highest/40">
            <button 
              onClick={() => setCurrentTab('predictions')}
              className="flex-1 h-9 bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md font-semibold rounded-lg flex items-center justify-center gap-1 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">history</span>
              View Prediction History
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
