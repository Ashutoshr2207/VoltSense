import React from 'react';
import { useApp } from '../../context/AppContext';
import VoltSenseLogo from '../common/VoltSenseLogo';

export default function Sidebar({ mobileOpen, setMobileOpen }) {
  const { currentTab, setCurrentTab } = useApp();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'speed' },
    { id: 'vehicles', label: 'My Vehicles', icon: 'directions_car' },
    { id: 'upload', label: 'Upload Data', icon: 'upload_file' },
    { id: 'predictions', label: 'Predictions History', icon: 'query_stats' },
  ];

  const configItems = [
    { id: 'settings', label: 'Settings', icon: 'tune' },
    { id: 'help', label: 'Help & FAQ', icon: 'contact_support' },
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
          className="fixed inset-0 bg-black/40 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`fixed left-0 top-0 h-full w-64 bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-50 flex flex-col justify-between transition-transform duration-300 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        <div className="flex flex-col">
          {/* Logo Brand Header */}
          <div className="h-16 flex items-center justify-between px-space-xl border-b border-surface-container-highest/40">
            <button 
              onClick={() => handleNav('dashboard')}
              className="text-left flex items-center gap-space-sm focus:outline-none"
            >
              <VoltSenseLogo className="h-8 w-auto" />
            </button>
            <button 
              onClick={() => setMobileOpen(false)}
              className="md:hidden text-on-surface-variant hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* Navigation Links */}
          <div className="px-space-md py-space-sm">
            <div className="font-label-sm text-label-sm text-on-surface-variant uppercase px-space-md mb-space-xs tracking-wider font-semibold">
              Telemetry Feed
            </div>
            <nav className="flex flex-col gap-space-2xs">
              {navItems.map((item) => {
                const isActive = currentTab === item.id || (item.id === 'vehicles' && currentTab === 'analysis');
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNav(item.id)}
                    className={`flex items-center gap-space-md px-space-md py-space-sm transition-all rounded-lg font-body-md text-body-md text-left ${
                      isActive
                        ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                        : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="my-space-md mx-space-md h-px bg-surface-container-highest"></div>

            <div className="font-label-sm text-label-sm text-on-surface-variant uppercase px-space-md mb-space-xs tracking-wider font-semibold">
              System Config
            </div>
            <nav className="flex flex-col gap-space-2xs">
              {configItems.map((item) => {
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNav(item.id)}
                    className={`flex items-center gap-space-md px-space-md py-space-sm rounded-lg transition-all font-body-md text-body-md text-left ${
                      isActive
                        ? 'bg-primary-container text-on-primary-container font-semibold'
                        : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* ECU Telemetry Status Ribbon at Bottom */}
        <div className="p-space-md bg-surface-container-low m-space-md rounded-xl flex items-center justify-between border border-surface-container-highest/60">
          <div className="flex items-center gap-space-sm">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
            </span>
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-on-surface font-semibold">
                ECU Telemetry
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                Stream: Active
              </span>
            </div>
          </div>
          <span className="font-label-sm text-label-sm px-space-xs py-space-2xs bg-secondary-container text-on-secondary-container rounded font-mono font-medium">
            120ms
          </span>
        </div>
      </aside>
    </>
  );
}
