import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import VoltSenseLogo from '../common/VoltSenseLogo';

export default function Navbar({ onOpenMobileMenu }) {
  const {
    vehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    currentUser,
    logout,
    setCurrentTab,
    notifications,
    unreadCount,
    markNotificationRead,
    selectVehicleForReport,
    setIsAddVehicleModalOpen,
  } = useApp();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const notifRef = useRef(null);
  const userMenuRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="fixed top-0 left-0 md:left-64 right-0 h-16 bg-surface-container-lowest/95 backdrop-blur-md z-40 flex items-center justify-between px-space-md md:px-space-xl border-b border-surface-container-highest/80 shadow-xs">
      <div className="flex items-center gap-space-md flex-1 max-w-xl">
        {/* Mobile menu trigger */}
        <button 
          onClick={onOpenMobileMenu}
          className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
          aria-label="Open navigation menu"
        >
          <span className="material-symbols-outlined text-[20px]">menu</span>
        </button>

        {/* Mobile Logo */}
        <div className="md:hidden">
          <VoltSenseLogo className="h-6 w-auto" showText={false} />
        </div>

        {/* Active EV Status Badge (Single EV per user) */}
        {vehicles.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container border border-surface-container-highest/80 text-xs">
            <span className="material-symbols-outlined text-primary text-[18px]">
              directions_car
            </span>
            <span className="font-semibold text-on-surface truncate max-w-[200px]">
              {vehicles[0]?.name || 'My EV'}
            </span>
            <span className="text-[10px] font-mono text-on-surface-variant px-1.5 py-0.5 rounded bg-surface-container-low border border-surface-container-highest/60 hidden sm:inline-block">
              Active Pack
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Notification Bell */}
        <div className="relative" ref={notifRef}>
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors flex items-center justify-center cursor-pointer"
            title="Telemetry Notifications"
            aria-label="Notifications"
            aria-expanded={showNotifications}
          >
            <span className="material-symbols-outlined text-[22px]">notifications</span>
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-error ring-2 ring-surface-container-lowest animate-pulse" />
            )}
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-surface-container-lowest border border-surface-container-highest/90 rounded-xl shadow-xl p-space-md z-50 animate-in fade-in duration-150">
              <div className="flex items-center justify-between pb-space-xs border-b border-surface-container-highest/80">
                <div className="flex items-center gap-2">
                  <span className="font-label-md text-label-md font-semibold text-on-surface">Telemetry Alerts</span>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">BMS</span>
                </div>
                <span className="font-label-sm text-xs font-semibold px-2 py-0.5 rounded-full bg-primary-container/20 text-primary">
                  {unreadCount} New
                </span>
              </div>
              <div className="flex flex-col gap-1.5 mt-2 max-h-80 overflow-y-auto">
                {notifications.length === 0 && (
                  <div className="py-6 text-xs text-on-surface-variant text-center">
                    No active notifications for this vehicle.
                  </div>
                )}
                {notifications.slice(0, 8).map((notification) => {
                  const isAlert = notification.type === 'battery_health_change' || notification.type === 'data_quality_warning';
                  return (
                    <div
                      key={notification.id}
                      onClick={() => {
                        if (!notification.read) markNotificationRead(notification.id);
                        if (notification.vehicleId) selectVehicleForReport(notification.vehicleId);
                        setShowNotifications(false);
                      }}
                      className={`p-2.5 rounded-lg flex items-start gap-2.5 cursor-pointer transition-colors border ${
                        notification.read
                          ? 'bg-surface-container-low/50 border-transparent hover:bg-surface-container'
                          : isAlert
                          ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/15'
                          : 'bg-primary-container/10 border-primary-container/30 hover:bg-primary-container/15'
                      }`}
                    >
                      <span className={`material-symbols-outlined text-[18px] mt-0.5 shrink-0 ${isAlert ? 'text-amber-600' : 'text-primary'}`}>
                        {isAlert ? 'warning' : 'check_circle'}
                      </span>
                      <div className="flex flex-col flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-xs font-semibold truncate ${isAlert && !notification.read ? 'text-amber-900' : 'text-on-surface'}`}>
                            {notification.title}
                          </span>
                          <span className="text-[10px] text-on-surface-variant font-mono shrink-0">{notification.relativeTime}</span>
                        </div>
                        <span className="text-[11px] text-on-surface-variant line-clamp-2 mt-0.5">{notification.message}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="h-6 w-px bg-surface-container-highest/80" />

        {/* User Profile */}
        <div className="relative" ref={userMenuRef}>
          <button 
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 pl-1 text-left focus:outline-none group cursor-pointer"
            aria-expanded={showUserMenu}
            aria-label="User profile menu"
          >
            <div className="flex flex-col text-right hidden sm:flex">
              <span className="text-body-sm font-semibold text-on-surface group-hover:text-primary transition-colors leading-tight">
                {currentUser?.name || 'EV Operator'}
              </span>
              <span className="text-[11px] text-on-surface-variant font-mono">
                {currentUser?.title || 'Telemetry User'}
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-xs shadow-xs ring-2 ring-primary/20">
              {currentUser?.avatar || 'OP'}
            </div>
            <span className="material-symbols-outlined text-on-surface-variant text-[16px] hidden sm:block">
              expand_more
            </span>
          </button>

          {/* User Menu Dropdown */}
          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-60 bg-surface-container-lowest border border-surface-container-highest/90 rounded-xl shadow-xl p-2 z-50 animate-in fade-in duration-150">
              <div className="px-3 py-2 border-b border-surface-container-highest/80 mb-1">
                <p className="text-xs font-semibold text-on-surface">{currentUser?.name || 'EV Operator'}</p>
                <p className="text-[11px] text-on-surface-variant truncate font-mono">{currentUser?.email || ''}</p>
              </div>
              <button 
                onClick={() => {
                  setCurrentTab('vehicle');
                  setShowUserMenu(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-body-sm text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">directions_car</span>
                Vehicle Profile
              </button>
              <button 
                onClick={() => {
                  setCurrentTab('settings');
                  setShowUserMenu(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-body-sm text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">tune</span>
                Account & BMS Config
              </button>
              <button 
                onClick={() => {
                  setCurrentTab('help');
                  setShowUserMenu(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-body-sm text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">contact_support</span>
                Documentation & FAQ
              </button>
              <div className="my-1 border-t border-surface-container-highest/80" />
              <button 
                onClick={() => {
                  setShowUserMenu(false);
                  logout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-body-sm text-error hover:bg-error-container/20 transition-colors cursor-pointer font-medium"
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
