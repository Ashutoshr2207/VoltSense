import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import VoltSenseLogo from '../common/VoltSenseLogo';

export default function Navbar({ onOpenMobileMenu }) {
  const { searchQuery, setSearchQuery, currentUser, logout, setCurrentTab } = useApp();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header className="fixed top-0 left-0 md:left-64 right-0 h-16 bg-surface-container-lowest/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-40 flex items-center justify-between px-space-md md:px-space-xl border-b border-surface-container-highest/30">
      <div className="flex items-center gap-space-md flex-1 max-w-xl">
        {/* Mobile menu trigger */}
        <button 
          onClick={onOpenMobileMenu}
          className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors"
          aria-label="Open navigation menu"
        >
          <span className="material-symbols-outlined text-[20px]">menu</span>
        </button>

        {/* Mobile Logo */}
        <div className="md:hidden">
          <VoltSenseLogo className="h-6 w-auto" showText={false} />
        </div>

        {/* Search input */}
        <div className="relative w-full max-w-md">
          <span className="material-symbols-outlined absolute left-space-sm top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
            search
          </span>
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search VIN, pack ID, predictions..."
            className="w-full h-9 pl-9 pr-space-md bg-surface-container-low text-on-surface rounded-lg font-body-sm text-body-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant transition-all border border-transparent focus:border-primary/20"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-space-md relative">
        {/* Notification Bell */}
        <div className="relative">
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors flex items-center justify-center"
            title="Notifications"
          >
            <span className="material-symbols-outlined text-[22px]">notifications</span>
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-error ring-2 ring-surface-container-lowest"></span>
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-surface-container-lowest border border-surface-container-highest rounded-xl shadow-lg p-space-md z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between pb-space-xs border-b border-surface-container-highest">
                <span className="font-label-md text-label-md font-semibold text-on-surface">Telemetry Alerts</span>
                <span className="font-label-sm text-label-sm text-primary font-medium">1 Active</span>
              </div>
              <div className="flex flex-col gap-space-sm mt-space-sm">
                <div 
                  onClick={() => {
                    setCurrentTab('vehicles');
                    setShowNotifications(false);
                  }}
                  className="p-space-sm rounded-lg bg-error-container/20 border border-error-container/40 flex items-start gap-space-sm cursor-pointer hover:bg-error-container/30 transition-colors"
                >
                  <span className="material-symbols-outlined text-error text-[18px] mt-0.5">warning</span>
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm font-semibold text-error">BYD Atto 3 Cell Imbalance</span>
                    <span className="text-[11px] text-on-surface-variant">Bank 3 differential Δ14mV exceeds 10mV limit.</span>
                    <span className="text-[10px] text-on-surface-variant mt-1">42 minutes ago</span>
                  </div>
                </div>
                <div className="p-space-sm rounded-lg bg-surface-container-low flex items-start gap-space-sm">
                  <span className="material-symbols-outlined text-primary text-[18px] mt-0.5">check_circle</span>
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm font-semibold text-on-surface">Tesla M3 Calibration</span>
                    <span className="text-[11px] text-on-surface-variant">Bayesian inference cycle 412 completed nominal.</span>
                    <span className="text-[10px] text-on-surface-variant mt-1">2 hours ago</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="h-6 w-px bg-surface-container-highest"></div>

        {/* User Profile */}
        <div className="relative">
          <button 
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-space-sm pl-space-xs text-left focus:outline-none group"
          >
            <div className="flex flex-col text-right hidden sm:flex">
              <span className="font-body-sm text-body-sm font-semibold text-on-surface group-hover:text-primary transition-colors">
                {currentUser.name}
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                {currentUser.title}
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary font-semibold text-xs shadow-sm ring-2 ring-primary/20">
              {currentUser.avatar}
            </div>
            <span className="material-symbols-outlined text-on-surface-variant text-[16px] hidden sm:block">
              expand_more
            </span>
          </button>

          {/* User Menu Dropdown */}
          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-surface-container-lowest border border-surface-container-highest rounded-xl shadow-lg p-space-sm z-50">
              <div className="px-space-sm py-space-xs border-b border-surface-container-highest mb-1">
                <p className="font-label-sm text-label-sm font-semibold text-on-surface">{currentUser.name}</p>
                <p className="text-[11px] text-on-surface-variant truncate font-mono">{currentUser.email}</p>
              </div>
              <button 
                onClick={() => {
                  setCurrentTab('settings');
                  setShowUserMenu(false);
                }}
                className="w-full flex items-center gap-space-sm px-space-sm py-2 rounded-lg text-left text-body-sm text-on-surface hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">settings</span>
                Operator Preferences
              </button>
              <button 
                onClick={() => {
                  setCurrentTab('signin');
                  setShowUserMenu(false);
                }}
                className="w-full flex items-center gap-space-sm px-space-sm py-2 rounded-lg text-left text-body-sm text-on-surface hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">swap_horiz</span>
                Switch Operator
              </button>
              <div className="my-1 border-t border-surface-container-highest"></div>
              <button 
                onClick={() => {
                  setShowUserMenu(false);
                  logout();
                }}
                className="w-full flex items-center gap-space-sm px-space-sm py-2 rounded-lg text-left text-body-sm text-error hover:bg-error-container/20 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
