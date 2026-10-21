import React from 'react';
import { useApp } from '../../context/AppContext';
import VoltSenseLogo from '../common/VoltSenseLogo';

export default function Sidebar({ mobileOpen, setMobileOpen }) {
  const { currentTab, setCurrentTab, activeVehicle } = useApp();

  const navItems = [
    { id: 'dashboard', label: 'Command Center', icon: 'speed', desc: 'Fleet & battery overview' },
    { id: 'anomalies', label: 'Battery Anomalies', icon: 'warning', desc: 'Voltage & thermal limits' },
    { id: 'analysis', label: 'SOH & RUL', icon: 'battery_charging_full', desc: 'Degradation & 3D pack' },
    { id: 'charging', label: 'Charging & Telemetry', icon: 'ev_station', desc: 'Sessions & public map' },
    { id: 'ingestion', label: 'Dataset Ingestion', icon: 'upload_file', desc: 'CSV telemetry upload' },
    { id: 'insights', label: 'Insight', icon: 'insights', desc: 'Multi-cycle analytics' },
  ];

  const configItems = [
    { id: 'vehicle', label: 'Vehicle Profile', icon: 'directions_car' },
    { id: 'settings', label: 'Settings', icon: 'tune' },
    { id: 'help', label: 'Documentation & FAQ', icon: 'contact_support' },
  ];

  const handleNav = (tabId) => {
    setCurrentTab(tabId);
    if (setMobileOpen) setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`fixed left-0 top-0 h-full w-64 bg-surface-container-lowest border-r border-surface-container-highest/80 shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-50 flex flex-col justify-between transition-transform duration-300 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        <div className="flex flex-col">
          {/* Logo Brand Header */}
          <div className="h-16 flex items-center justify-between px-space-lg border-b border-surface-container-highest/60 bg-surface-container-lowest">
            <button 
              onClick={() => handleNav('dashboard')}
              className="text-left flex items-center gap-space-sm focus:outline-none cursor-pointer"
            >
              <VoltSenseLogo className="h-8 w-auto" />
            </button>
            <button 
              onClick={() => setMobileOpen(false)}
              className="md:hidden text-on-surface-variant hover:text-on-surface p-1 rounded-lg hover:bg-surface-container"
              aria-label="Close sidebar"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* Navigation Links */}
          <div className="px-space-md py-space-md">
            <div className="font-label-sm text-[11px] text-on-surface-variant uppercase px-space-md mb-2 tracking-wider font-semibold">
              Telemetry & Analytics
            </div>
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => {
                const isActive = currentTab === item.id || (item.id === 'ingestion' && currentTab === 'upload');
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNav(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center gap-3 px-3 py-2.5 transition-all rounded-lg text-left cursor-pointer group ${
                      isActive
                        ? 'bg-primary-container/15 text-primary font-semibold border-l-2 border-primary shadow-xs'
                        : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-[20px] transition-colors ${isActive ? 'text-primary' : 'text-on-surface-variant group-hover:text-on-surface'}`}>
                      {item.icon}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-body-md leading-tight">{item.label}</span>
                    </div>
                  </button>
                );
              })}
            </nav>

            <div className="my-space-md mx-space-sm h-px bg-surface-container-highest/60"></div>

            <div className="font-label-sm text-[11px] text-on-surface-variant uppercase px-space-md mb-2 tracking-wider font-semibold">
              Platform
            </div>
            <nav className="flex flex-col gap-1">
              {configItems.map((item) => {
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNav(item.id)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-left cursor-pointer group ${
                      isActive
                        ? 'bg-surface-container text-on-surface font-semibold border-l-2 border-primary'
                        : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[19px] text-on-surface-variant group-hover:text-on-surface">
                      {item.icon}
                    </span>
                    <span className="text-body-sm">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Sidebar Footer: Engine Status Pill */}
        <div className="p-space-md border-t border-surface-container-highest/60 bg-surface-container-low/40">
          <div className="p-2.5 rounded-lg bg-surface-container-lowest border border-surface-container-highest/80 shadow-xs flex flex-col gap-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-on-surface flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Pipeline Engine
              </span>
              <span className="font-mono text-[10px] text-primary font-medium">v2.4-active</span>
            </div>
            <p className="text-[10px] text-on-surface-variant leading-tight">
              EV Telemetry & Health Analytics
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
