import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function Dashboard() {
  const { 
    vehicles, 
    setCurrentTab, 
    selectVehicleForReport, 
    setIsAddVehicleModalOpen, 
    searchQuery,
    currentUser 
  } = useApp();

  const [statusFilter, setStatusFilter] = useState('all');

  // Filter vehicles by search and status
  const filteredVehicles = vehicles.filter(v => {
    const matchesSearch = searchQuery 
      ? v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.vin.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.chemistry.toLowerCase().includes(searchQuery.toLowerCase())
      : true;

    if (statusFilter === 'all') return matchesSearch;
    return matchesSearch && v.status.toLowerCase() === statusFilter.toLowerCase();
  });

  // Calculate fleet stats
  const totalVehicles = vehicles.length;
  const healthyCount = vehicles.filter(v => v.status === 'Healthy').length;
  const attentionCount = vehicles.filter(v => v.status === 'Attention').length;
  const avgSoh = totalVehicles > 0 
    ? (vehicles.reduce((acc, v) => acc + v.soh, 0) / totalVehicles).toFixed(1) 
    : 0;

  return (
    <div className="flex flex-col gap-space-xl pb-space-4xl">
      {/* Top Greeting & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-lg">
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-center gap-space-sm">
            <span className="font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant font-semibold">
              Diagnostics Suite • Fleet Telemetry
            </span>
            <span className="inline-flex items-center gap-1.5 px-space-xs py-space-2xs rounded bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-container animate-pulse"></span>
              Sync Nominal
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
            Good morning, {currentUser.name.split(' ')[0]}. Here's how your vehicles are doing.
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {totalVehicles} active battery packs monitored across 12 analytical degradation passes.
          </p>
        </div>

        <div className="flex items-center gap-space-sm flex-shrink-0">
          <button 
            onClick={() => setCurrentTab('upload')}
            className="h-10 px-space-md rounded bg-surface-container-lowest text-on-surface font-label-md text-label-md hover:bg-surface-container transition-colors flex items-center gap-space-xs shadow-sm border border-surface-container-highest/60"
          >
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">upload_file</span>
            Quick Upload
          </button>
          <button 
            onClick={() => setIsAddVehicleModalOpen(true)}
            className="h-10 px-space-md rounded bg-primary-container text-on-primary-container font-label-md text-label-md font-semibold hover:bg-primary transition-colors flex items-center gap-space-xs shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            + Add Vehicle
          </button>
        </div>
      </div>

      {/* KPI Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
        {/* Total Vehicles */}
        <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between border border-surface-container-highest/40 hover:border-surface-container-highest transition-colors">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold">Total Vehicles</span>
            <span className="material-symbols-outlined text-[20px]">directions_car</span>
          </div>
          <div className="mt-space-md flex items-baseline gap-space-xs">
            <span className="font-telemetry-hero text-telemetry-hero text-on-surface font-mono font-medium">{totalVehicles}</span>
            <span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant font-mono">Active units</span>
          </div>
          <div className="mt-space-sm pt-space-sm flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm border-t border-surface-container-highest/40">
            <span>Fleet coverage</span>
            <span className="text-primary font-semibold">100% telemetry</span>
          </div>
        </div>

        {/* Fleet Avg SOH */}
        <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between border border-surface-container-highest/40 hover:border-surface-container-highest transition-colors">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold">Fleet Avg SOH</span>
            <span className="material-symbols-outlined text-[20px] text-primary">battery_charging_full</span>
          </div>
          <div className="mt-space-md flex items-baseline gap-space-xs">
            <span className="font-telemetry-hero text-telemetry-hero text-on-surface font-mono font-medium">{avgSoh}</span>
            <span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant font-mono">%</span>
          </div>
          <div className="mt-space-sm pt-space-sm flex items-center justify-between font-label-sm text-label-sm border-t border-surface-container-highest/40">
            <span className="text-on-surface-variant">Weighted degradation</span>
            <span className="text-primary font-semibold font-mono">-0.14% / mo</span>
          </div>
        </div>

        {/* Attention Required */}
        <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between border border-surface-container-highest/40 hover:border-surface-container-highest transition-colors">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold">Attention Required</span>
            <span className="material-symbols-outlined text-[20px] text-error">warning</span>
          </div>
          <div className="mt-space-md flex items-baseline gap-space-xs">
            <span className={`font-telemetry-hero text-telemetry-hero font-mono font-medium ${attentionCount > 0 ? 'text-error' : 'text-on-surface'}`}>
              {attentionCount}
            </span>
            <span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant font-mono">
              {attentionCount === 1 ? 'Unit flagged' : 'Units flagged'}
            </span>
          </div>
          <div className="mt-space-sm pt-space-sm flex items-center justify-between font-label-sm text-label-sm border-t border-surface-container-highest/40">
            <span className="text-on-surface-variant">BYD Atto 3 Pack</span>
            <span className="text-error font-semibold font-mono">Imbalance Δ14mV</span>
          </div>
        </div>

        {/* Datasets Analyzed */}
        <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between border border-surface-container-highest/40 hover:border-surface-container-highest transition-colors">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold">Datasets Analyzed</span>
            <span className="material-symbols-outlined text-[20px] text-tertiary">query_stats</span>
          </div>
          <div className="mt-space-md flex items-baseline gap-space-xs">
            <span className="font-telemetry-hero text-telemetry-hero text-on-surface font-mono font-medium">12</span>
            <span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant font-mono">Models fit</span>
          </div>
          <div className="mt-space-sm pt-space-sm flex items-center justify-between font-label-sm text-label-sm border-t border-surface-container-highest/40">
            <span className="text-on-surface-variant">Last batch</span>
            <span className="text-on-surface font-semibold">2 hours ago</span>
          </div>
        </div>
      </div>

      {/* Monitored Packs & Telemetry List */}
      <div className="flex flex-col gap-space-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
          <div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
              Monitored Packs & Telemetry
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Detailed electrochemical status and remaining useful lifetime projection
            </p>
          </div>
          <div className="flex items-center gap-space-xs bg-surface-container p-1 rounded-lg">
            <button 
              onClick={() => setStatusFilter('all')}
              className={`px-space-sm py-1 rounded font-label-sm text-label-sm font-semibold transition-all ${
                statusFilter === 'all' 
                  ? 'bg-surface-container-lowest text-on-surface shadow-sm' 
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              All ({totalVehicles})
            </button>
            <button 
              onClick={() => setStatusFilter('healthy')}
              className={`px-space-sm py-1 rounded font-label-sm text-label-sm font-semibold transition-all ${
                statusFilter === 'healthy' 
                  ? 'bg-surface-container-lowest text-on-surface shadow-sm' 
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Healthy ({healthyCount})
            </button>
            <button 
              onClick={() => setStatusFilter('attention')}
              className={`px-space-sm py-1 rounded font-label-sm text-label-sm font-semibold transition-all ${
                statusFilter === 'attention' 
                  ? 'bg-surface-container-lowest text-on-surface shadow-sm' 
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Attention ({attentionCount})
            </button>
          </div>
        </div>

        {/* Vehicles List Cards */}
        <div className="flex flex-col gap-space-md">
          {filteredVehicles.map(vehicle => {
            const isAttention = vehicle.status === 'Attention';
            return (
              <div 
                key={vehicle.id}
                className="p-space-xl rounded-xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-all flex flex-col gap-space-lg border border-surface-container-highest/40"
              >
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
                        <span>{vehicle.trim}</span>
                        <span>•</span>
                        <span className="font-telemetry-sm text-telemetry-sm font-mono">{vehicle.chemistry}</span>
                        <span>•</span>
                        <span className="text-on-surface font-mono">VIN: {vehicle.vin}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-space-xl flex-shrink-0">
                    <div className="flex flex-col text-right">
                      <span className="font-label-sm text-label-sm uppercase text-on-surface-variant font-semibold">
                        State of Health
                      </span>
                      <span className={`font-telemetry-hero text-telemetry-hero font-mono font-medium ${
                        isAttention ? 'text-error' : 'text-on-surface'
                      }`}>
                        {vehicle.soh}
                        <span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant">%</span>
                      </span>
                    </div>
                    <div className="h-10 w-px bg-surface-container-highest"></div>
                    <button 
                      onClick={() => selectVehicleForReport(vehicle.id)}
                      className="h-10 px-space-md rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md font-semibold flex items-center gap-space-xs transition-colors"
                    >
                      View Analysis →
                    </button>
                  </div>
                </div>

                {/* SOH Health Gauge Bar & Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-space-md pt-space-xs">
                  <div className="md:col-span-8 flex flex-col justify-center">
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
                    {/* Progress Track */}
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
                  </div>

                  <div className="md:col-span-4 flex items-center justify-around bg-surface-container-low p-space-md rounded-lg">
                    <div className="flex flex-col">
                      <span className="font-label-sm text-label-sm uppercase text-on-surface-variant font-semibold">
                        Cycles Logged
                      </span>
                      <span className="font-telemetry-md text-telemetry-md text-on-surface font-mono font-medium">
                        {vehicle.cycles} <span className="font-label-sm text-label-sm text-on-surface-variant font-sans">cyc</span>
                      </span>
                    </div>
                    <div className="h-8 w-px bg-surface-container-highest"></div>
                    <div className="flex flex-col">
                      <span className="font-label-sm text-label-sm uppercase text-on-surface-variant font-semibold">
                        Projected RUL
                      </span>
                      <span className={`font-telemetry-md text-telemetry-md font-mono font-medium ${
                        isAttention ? 'text-error' : 'text-on-surface'
                      }`}>
                        {vehicle.rul} <span className="font-label-sm text-label-sm text-on-surface-variant font-sans">cyc rem</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredVehicles.length === 0 && (
            <div className="p-12 text-center bg-surface-container-lowest rounded-xl border border-surface-container-highest/60 flex flex-col items-center">
              <span className="material-symbols-outlined text-[40px] text-on-surface-variant mb-2">directions_car</span>
              <p className="font-headline-sm text-headline-sm text-on-surface">No vehicles found</p>
              <p className="text-body-sm text-on-surface-variant mt-1">Try adjusting your search query or filter criteria.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
