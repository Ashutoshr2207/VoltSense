import React from 'react';
import { useApp } from '../context/AppContext';
import { formatRelativeTime } from '../utils/mappers';

export default function Dashboard() {
  const {
    vehicles,
    predictions,
    notifications,
    setCurrentTab,
    selectVehicleForReport,
    setIsAddVehicleModalOpen,
    currentUser
  } = useApp();

  const vehicle = vehicles[0] || null;
  const isAttention = vehicle?.status === 'Attention';
  const mostRecentPrediction = predictions[0];
  const actionableAlerts = notifications.filter((n) => n.type === 'battery_health_change' || n.type === 'data_quality_warning' || n.type === 'alert' || n.type === 'warning');
  const alertCount = actionableAlerts.length;

  // No EV set up yet — show a focused setup call to action for the user's personal EV.
  if (!vehicle) {
    return (
      <div className="flex flex-col gap-space-xl pb-space-4xl">
        <div className="flex flex-col gap-space-xs">
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
            Welcome, {currentUser?.name?.split(' ')[0] || 'there'}.
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Set up your EV to start tracking its battery health, remaining useful life, and range.
          </p>
        </div>

        <div className="p-space-4xl text-center bg-surface-container-lowest rounded-xl border border-dashed border-surface-container-highest flex flex-col items-center gap-space-md">
          <div className="w-16 h-16 rounded-xl bg-primary-container/20 text-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]">electric_car</span>
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-headline-sm text-headline-sm text-on-surface font-semibold">No EV set up yet</p>
            <p className="text-body-sm text-on-surface-variant max-w-md">
              Add your vehicle's basic details, then upload a battery telemetry CSV to get your first State of Health and Remaining Useful Life analysis.
            </p>
          </div>
          <button
            onClick={() => setIsAddVehicleModalOpen(true)}
            className="h-11 px-space-xl rounded-lg bg-primary text-on-primary font-label-md text-label-md font-bold hover:bg-primary/90 transition-colors shadow flex items-center gap-space-xs"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Set Up My EV
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-space-xl pb-space-4xl">
      {/* Top Greeting & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-lg">
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-center gap-space-sm">
            <span className="font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant font-semibold">
              Diagnostics Suite • Personal EV
            </span>
            <span className="inline-flex items-center gap-1.5 px-space-xs py-space-2xs rounded bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-container animate-pulse"></span>
              Sync Nominal
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
            Good morning, {currentUser?.name ? currentUser.name.split(' ')[0] : 'there'}. Here's how {vehicle.name} is doing.
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {vehicle.hasAnalysis
              ? `${predictions.length} analytical degradation ${predictions.length === 1 ? 'pass' : 'passes'} logged so far.`
              : `Ready for initial battery telemetry upload.`}
          </p>
        </div>

        <div className="flex items-center gap-space-sm flex-shrink-0">
          <button 
            onClick={() => setCurrentTab('upload')}
            className="h-10 px-space-md rounded bg-surface-container-lowest text-on-surface font-label-md text-label-md hover:bg-surface-container transition-colors flex items-center gap-space-xs shadow-sm border border-surface-container-highest/60"
          >
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">upload_file</span>
            Upload Data
          </button>
          <button 
            onClick={() => setCurrentTab('charging')}
            className="h-10 px-space-md rounded bg-primary-container text-on-primary-container font-label-md text-label-md font-semibold hover:bg-primary transition-colors flex items-center gap-space-xs shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">ev_station</span>
            Find Charging
          </button>
        </div>
      </div>

      {/* KPI Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
        {/* State of Health */}
        <div 
          title="Current estimated battery health as a percentage of original capacity (measured via benchmark discharge telemetry)"
          className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between border border-surface-container-highest/40 hover:border-surface-container-highest transition-colors cursor-help"
        >
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold">State of Health</span>
            <span className="material-symbols-outlined text-[20px] text-primary">battery_charging_full</span>
          </div>
          <div className="mt-space-md flex items-baseline gap-space-xs">
            <span className={`font-telemetry-hero text-telemetry-hero font-mono font-medium ${isAttention ? 'text-error' : 'text-on-surface'}`}>
              {vehicle.hasAnalysis ? vehicle.soh : (vehicle.soh > 0 ? vehicle.soh : '—')}
            </span>
            <span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant font-mono">%</span>
          </div>
          <div className="mt-space-sm pt-space-sm flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm border-t border-surface-container-highest/40">
            <span>Status</span>
            <span className={`font-semibold ${isAttention ? 'text-error' : 'text-primary'}`}>
              {vehicle.hasAnalysis ? vehicle.status : 'Awaiting Data'}
            </span>
          </div>
        </div>

        {/* Cycles Logged */}
        <div 
          title="Total equivalent full charge-discharge cycles recorded in uploaded battery telemetry"
          className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between border border-surface-container-highest/40 hover:border-surface-container-highest transition-colors cursor-help"
        >
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold">Cycles Logged</span>
            <span className="material-symbols-outlined text-[20px]">cyclone</span>
          </div>
          <div className="mt-space-md flex items-baseline gap-space-xs">
            <span className="font-telemetry-hero text-telemetry-hero text-on-surface font-mono font-medium">
              {vehicle.cycles > 0 ? vehicle.cycles : (vehicle.hasAnalysis ? '0' : '—')}
            </span>
            <span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant font-mono">cyc</span>
          </div>
          <div className="mt-space-sm pt-space-sm flex items-center justify-between font-label-sm text-label-sm border-t border-surface-container-highest/40">
            <span className="text-on-surface-variant">Degradation rate</span>
            <span className="text-primary font-semibold font-mono">
              {vehicle.hasAnalysis ? vehicle.degradationRate : '—'}
            </span>
          </div>
        </div>

        {/* Remaining Useful Life */}
        <div 
          title="Estimated remaining discharge cycles before capacity degrades to the 70% End-of-Life (EOL) threshold"
          className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between border border-surface-container-highest/40 hover:border-surface-container-highest transition-colors cursor-help"
        >
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold">Projected RUL</span>
            <span className={`material-symbols-outlined text-[20px] ${isAttention ? 'text-error' : 'text-on-surface-variant'}`}>
              {isAttention ? 'warning' : 'schedule'}
            </span>
          </div>
          <div className="mt-space-md flex items-baseline gap-space-xs">
            <span className={`font-telemetry-hero text-telemetry-hero font-mono font-medium ${isAttention ? 'text-error' : 'text-on-surface'}`}>
              {vehicle.hasAnalysis ? vehicle.rul : '—'}
            </span>
            <span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant font-mono">
              {vehicle.hasAnalysis ? 'cyc to 70% EOL' : 'cycles'}
            </span>
          </div>
          <div className="mt-space-sm pt-space-sm flex items-center justify-between font-label-sm text-label-sm border-t border-surface-container-highest/40">
            <span className="text-on-surface-variant">Last analysis</span>
            <span className="text-on-surface font-semibold">
              {mostRecentPrediction ? formatRelativeTime(mostRecentPrediction.timestampRaw) : (vehicle.hasAnalysis ? vehicle.lastBatch : 'Not run yet')}
            </span>
          </div>
        </div>

        {/* Notifications */}
        <div 
          title="Critical warnings and telemetry anomaly alerts for your vehicle"
          className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between border border-surface-container-highest/40 hover:border-surface-container-highest transition-colors cursor-help"
        >
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold">Alerts</span>
            <span className="material-symbols-outlined text-[20px]">notifications</span>
          </div>
          <div className="mt-space-md flex items-baseline gap-space-xs">
            <span className="font-telemetry-hero text-telemetry-hero text-on-surface font-mono font-medium">{alertCount}</span>
            <span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant font-mono">active</span>
          </div>
          <div className="mt-space-sm pt-space-sm flex items-center justify-between font-label-sm text-label-sm border-t border-surface-container-highest/40">
            <span className="text-on-surface-variant">
              {alertCount > 0
  ? (actionableAlerts[0]?.title || 'Attention required')
  : (predictions.length > 0
    ? `No telemetry alerts across ${predictions.length} analysis ${predictions.length === 1 ? 'run' : 'runs'}`
    : 'Awaiting telemetry analysis')}
            </span>
          </div>
        </div>
      </div>

      {/* Vehicle Summary Card */}
      <div className="p-space-xl rounded-xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-all flex flex-col gap-space-lg border border-surface-container-highest/40">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
          <div className="flex items-start gap-space-md">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
              isAttention ? 'bg-error-container/20 text-error' : 'bg-surface-container-low text-primary'
            }`}>
              <span className="material-symbols-outlined text-[28px]">electric_car</span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-space-sm">
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  {vehicle.name}
                </h3>
                <span className={`px-space-xs py-0.5 rounded font-label-sm text-label-sm font-semibold ${
                  isAttention 
                    ? 'bg-error-container text-on-error-container' 
                    : 'bg-secondary-container text-on-secondary-container'
                }`}>
                  {vehicle.status}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-space-sm font-label-sm text-label-sm text-on-surface-variant mt-space-2xs">
                <span>{vehicle.year}</span>
                <span>•</span>
                <span className="font-telemetry-sm text-telemetry-sm font-mono">{vehicle.chemistry}</span>
                <span>•</span>
                <span className="text-on-surface font-mono">VIN: {vehicle.vin}</span>
              </div>
            </div>
          </div>

          <button 
            onClick={() => selectVehicleForReport(vehicle.id)}
            className="h-10 px-space-md rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md font-semibold flex items-center gap-space-xs transition-colors self-start lg:self-auto"
          >
            View Full Analysis →
          </button>
        </div>

        {/* SOH Health Gauge Bar */}
        <div className="pt-space-xs">
          {!vehicle.hasAnalysis ? (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-surface-container-low border border-dashed border-primary/40">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-[28px]">upload_file</span>
                <div>
                  <p className="font-body-sm font-semibold text-on-surface">Initial diagnostic analysis awaiting data</p>
                  <p className="text-xs text-on-surface-variant">Upload battery telemetry to calculate SOH, degradation trajectory, and remaining useful life.</p>
                </div>
              </div>
              <button
                onClick={() => setCurrentTab('upload')}
                className="h-9 px-4 rounded-lg bg-primary text-on-primary font-label-md text-label-md font-semibold hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <span>Upload Telemetry</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-space-xs">
                <span className="font-label-sm text-label-sm text-on-surface-variant">
                  {isAttention ? 'Accelerated Fade Profile Detected' : 'SOH Health Gauge'}
                </span>
                <div className="flex gap-space-md font-label-sm text-label-sm text-on-surface-variant">
                  <span>EOL Threshold: <span className="font-mono text-on-surface font-semibold">70.0%</span></span>
                  <span>Current: <span className={`font-mono font-semibold ${isAttention ? 'text-error' : 'text-primary'}`}>
                    {vehicle.soh}%
                  </span></span>
                </div>
              </div>
              <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden flex relative">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    isAttention ? 'bg-error' : 'bg-primary-container'
                  }`}
                  style={{ width: `${Math.min(100, vehicle.soh)}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center mt-1 font-label-sm text-label-sm text-on-surface-variant font-mono">
                <span>0%</span>
                <span className="relative -left-8">70% EOL</span>
                <span>80% Warning</span>
                <span>100% Fresh</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-md">
        <button
          onClick={() => selectVehicleForReport(vehicle.id)}
          className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm border border-surface-container-highest/40 hover:border-primary/40 transition-colors flex items-center gap-space-md text-left"
        >
          <span className="material-symbols-outlined text-[24px] text-primary">monitor_heart</span>
          <div className="flex flex-col">
            <span className="font-body-md text-body-md font-semibold text-on-surface">Battery Analysis</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">Full diagnostic report, loss breakdown, and recommendations</span>
          </div>
        </button>
        <button
          onClick={() => setCurrentTab('charging')}
          className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm border border-surface-container-highest/40 hover:border-primary/40 transition-colors flex items-center gap-space-md text-left"
        >
          <span className="material-symbols-outlined text-[24px] text-primary">ev_station</span>
          <div className="flex flex-col">
            <span className="font-body-md text-body-md font-semibold text-on-surface">Find Charging Nearby</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">Matched against your current predicted range</span>
          </div>
        </button>
        <button
          onClick={() => setCurrentTab('predictions')}
          className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm border border-surface-container-highest/40 hover:border-primary/40 transition-colors flex items-center gap-space-md text-left"
        >
          <span className="material-symbols-outlined text-[24px] text-primary">query_stats</span>
          <div className="flex flex-col">
            <span className="font-body-md text-body-md font-semibold text-on-surface">Performance History</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">Charted SOH trend across every past analysis</span>
          </div>
        </button>
      </div>
    </div>
  );
}
