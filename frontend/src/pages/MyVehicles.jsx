import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function MyVehicles() {
  const { 
    vehicles, 
    setCurrentTab, 
    selectVehicleForReport, 
    setSelectedVehicleId, 
    setIsAddVehicleModalOpen, 
    searchQuery 
  } = useApp();

  const [activeFilter, setActiveFilter] = useState('all');

  const filteredVehicles = vehicles.filter(v => {
    const matchesSearch = searchQuery 
      ? v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.vin.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.chemistry.toLowerCase().includes(searchQuery.toLowerCase())
      : true;

    if (activeFilter === 'all') return matchesSearch;
    if (activeFilter === 'healthy') return matchesSearch && v.status === 'Healthy';
    if (activeFilter === 'attention') return matchesSearch && v.status === 'Attention';
    return matchesSearch;
  });

  const exportFleetLog = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(vehicles, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `voltsense_fleet_log_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="flex flex-col gap-space-xl pb-space-4xl">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <div className="flex flex-col">
          <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider mb-space-2xs">
            <span>Fleet Diagnostics</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="text-primary font-semibold">Registered Assets</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
            My Vehicles
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-space-2xs">
            Manage and inspect the electric vehicles tracked by VoltSense electrochemical telemetry.
          </p>
        </div>

        <div className="flex items-center gap-space-sm self-start md:self-auto">
          <button 
            onClick={() => setIsAddVehicleModalOpen(true)}
            className="h-10 px-space-md bg-primary-container hover:bg-primary text-on-primary-container hover:text-on-primary font-body-md text-body-md font-medium rounded-lg flex items-center gap-space-xs shadow-sm transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            <span>+ Add Vehicle</span>
          </button>
          <button 
            onClick={exportFleetLog}
            className="h-10 px-space-md bg-surface-container-lowest hover:bg-surface-container text-on-surface font-body-md text-body-md rounded-lg flex items-center gap-space-xs shadow-sm transition-colors border border-surface-container-highest/60"
          >
            <span className="material-symbols-outlined text-[18px]">file_download</span>
            <span className="hidden sm:inline">Export Fleet Log</span>
          </button>
        </div>
      </div>

      {/* Telemetry Diagnostic Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-space-md">
        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between border border-surface-container-highest/40">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">Active Fleet</span>
            <span className="material-symbols-outlined text-primary text-[18px]">directions_car</span>
          </div>
          <div className="mt-space-sm flex items-baseline gap-space-xs">
            <span className="font-telemetry-hero text-telemetry-hero text-on-surface font-mono font-medium">{vehicles.length}</span>
            <span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant font-mono">Units Online</span>
          </div>
          <div className="mt-space-xs text-secondary font-label-sm text-label-sm flex items-center gap-space-2xs">
            <span className="material-symbols-outlined text-[14px]">check_circle</span>
            <span>All streams syncing</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between border border-surface-container-highest/40">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">Attention Required</span>
            <span className="w-2 h-2 rounded-full bg-error animate-pulse"></span>
          </div>
          <div className="mt-space-sm flex items-baseline gap-space-xs">
            <span className="font-telemetry-hero text-telemetry-hero text-error font-mono font-medium">
              {vehicles.filter(v => v.status === 'Attention').length}
            </span>
            <span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant font-mono">Pack Alert</span>
          </div>
          <div className="mt-space-xs text-error font-label-sm text-label-sm flex items-center gap-space-2xs">
            <span className="material-symbols-outlined text-[14px]">warning</span>
            <span>Cell imbalance detected</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between border border-surface-container-highest/40">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">Avg Fleet SoH</span>
            <span className="material-symbols-outlined text-tertiary text-[18px]">battery_charging_full</span>
          </div>
          <div className="mt-space-sm flex items-baseline gap-space-xs">
            <span className="font-telemetry-hero text-telemetry-hero text-on-surface font-mono font-medium">91.7</span>
            <span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant font-mono">%</span>
          </div>
          <div className="mt-space-xs text-on-surface-variant font-label-sm text-label-sm">
            <span>-0.14% / mo weighted drift</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between border border-surface-container-highest/40">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">Latency / Rate</span>
            <span className="material-symbols-outlined text-secondary text-[18px]">hub</span>
          </div>
          <div className="mt-space-sm flex items-baseline gap-space-xs">
            <span className="font-telemetry-hero text-telemetry-hero text-on-surface font-mono font-medium">120</span>
            <span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant font-mono">ms ping</span>
          </div>
          <div className="mt-space-xs text-secondary font-label-sm text-label-sm flex items-center gap-space-2xs">
            <span className="material-symbols-outlined text-[14px]">bolt</span>
            <span>CAN bus burst nominal</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-space-md border-b border-surface-container-highest pb-space-sm">
        <div className="flex items-center gap-space-xs">
          <button 
            onClick={() => setActiveFilter('all')}
            className={`px-space-md py-1.5 rounded-lg font-label-md text-label-md transition-all ${
              activeFilter === 'all' 
                ? 'bg-primary text-on-primary font-semibold' 
                : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            All Packs ({vehicles.length})
          </button>
          <button 
            onClick={() => setActiveFilter('healthy')}
            className={`px-space-md py-1.5 rounded-lg font-label-md text-label-md transition-all ${
              activeFilter === 'healthy' 
                ? 'bg-primary text-on-primary font-semibold' 
                : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            Nominal ({vehicles.filter(v => v.status === 'Healthy').length})
          </button>
          <button 
            onClick={() => setActiveFilter('attention')}
            className={`px-space-md py-1.5 rounded-lg font-label-md text-label-md transition-all ${
              activeFilter === 'attention' 
                ? 'bg-primary text-on-primary font-semibold' 
                : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            Attention Flagged ({vehicles.filter(v => v.status === 'Attention').length})
          </button>
        </div>
      </div>

      {/* Vehicle Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-lg">
        {filteredVehicles.map(vehicle => {
          const isAttention = vehicle.status === 'Attention';
          return (
            <div 
              key={vehicle.id}
              className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm border border-surface-container-highest/40 hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2 pb-space-md border-b border-surface-container-highest/40">
                  <div className="flex items-center gap-space-sm">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      isAttention ? 'bg-error-container/20 text-error' : 'bg-surface-container-low text-primary'
                    }`}>
                      <span className="material-symbols-outlined text-[24px]">electric_car</span>
                    </div>
                    <div className="flex flex-col">
                      <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold leading-snug">
                        {vehicle.name}
                      </h3>
                      <span className="text-[12px] text-on-surface-variant font-mono">
                        {vehicle.year} • {vehicle.trim}
                      </span>
                    </div>
                  </div>
                  <span className={`px-space-xs py-0.5 rounded font-label-sm text-label-sm font-semibold flex-shrink-0 ${
                    isAttention 
                      ? 'bg-error-container text-on-error-container' 
                      : 'bg-secondary-container text-on-secondary-container'
                  }`}>
                    {vehicle.status}
                  </span>
                </div>

                {/* Pack Specs Ribbon */}
                <div className="py-space-md flex flex-col gap-space-xs">
                  <div className="flex items-center justify-between text-body-sm">
                    <span className="text-on-surface-variant">Chemistry & Capacity</span>
                    <span className="font-semibold text-on-surface font-mono">{vehicle.chemistry}</span>
                  </div>
                  <div className="flex items-center justify-between text-body-sm">
                    <span className="text-on-surface-variant">VIN</span>
                    <span className="font-mono text-[12px] text-on-surface-variant">{vehicle.vin}</span>
                  </div>
                  <div className="flex items-center justify-between text-body-sm">
                    <span className="text-on-surface-variant">Max Cell Imbalance</span>
                    <span className={`font-mono font-semibold ${isAttention ? 'text-error' : 'text-primary'}`}>
                      {vehicle.cellImbalance}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-body-sm">
                    <span className="text-on-surface-variant">Avg Pack Temp</span>
                    <span className="font-mono text-on-surface font-medium">{vehicle.tempAvg}</span>
                  </div>
                </div>

                {/* SOH Health Meter */}
                <div className="bg-surface-container-low p-space-md rounded-xl flex flex-col gap-space-xs my-space-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-label-sm text-label-sm uppercase text-on-surface-variant font-semibold">
                      State of Health (SOH)
                    </span>
                    <span className={`font-telemetry-md text-telemetry-md font-mono font-bold ${
                      isAttention ? 'text-error' : 'text-primary'
                    }`}>
                      {vehicle.soh}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${isAttention ? 'bg-error' : 'bg-primary-container'}`}
                      style={{ width: `${Math.min(100, vehicle.soh)}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-[11px] text-on-surface-variant font-mono">
                    <span>Cycles: {vehicle.cycles}</span>
                    <span>RUL: {vehicle.rul} cyc rem</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-space-md flex items-center gap-space-sm border-t border-surface-container-highest/40 mt-space-md">
                <button 
                  onClick={() => selectVehicleForReport(vehicle.id)}
                  className="flex-1 h-9 px-space-sm bg-primary text-on-primary hover:bg-primary-container rounded-lg font-label-md text-label-md font-semibold flex items-center justify-center gap-1 transition-colors shadow-sm"
                >
                  <span className="material-symbols-outlined text-[16px]">analytics</span>
                  Diagnostic Report
                </button>
                <button 
                  onClick={() => {
                    setSelectedVehicleId(vehicle.id);
                    setCurrentTab('upload');
                  }}
                  className="h-9 px-space-sm bg-surface-container-low hover:bg-surface-container text-on-surface rounded-lg font-label-md text-label-md font-medium flex items-center justify-center transition-colors border border-surface-container-highest/60"
                  title="Upload New Telemetry"
                >
                  <span className="material-symbols-outlined text-[18px]">upload_file</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
