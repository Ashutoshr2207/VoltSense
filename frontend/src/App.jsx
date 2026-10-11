import React, { useState } from 'react';
import { useApp } from './context/AppContext';
import Sidebar from './components/layout/Sidebar';
import Navbar from './components/layout/Navbar';
import AddVehicleModal from './components/common/AddVehicleModal';

import Dashboard from './pages/Dashboard';
import BatteryHealth from './pages/BatteryHealth';
import BatteryAnomalies from './pages/BatteryAnomalies';
import Vehicle from './pages/Vehicle';
import Insights from './pages/Insights';
import Charging from './pages/Charging';
import Settings from './pages/Settings';
import Help from './pages/Help';
import SignIn from './pages/SignIn';
import LandingPage from './pages/LandingPage';

export default function App() {
  const { currentTab, setCurrentTab, isAuthenticated, authChecked } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Wait for the session bootstrap (token check) to finish before deciding
  // what to render, so an already-logged-in EV user doesn't see a flash
  if (!authChecked) {
    return <div className="min-h-screen bg-background" />;
  }

  // If not authenticated, route between landing page, signin, and register
  if (!isAuthenticated) {
    if (currentTab === 'signin') {
      return <SignIn initialMode="signin" />;
    }
    if (currentTab === 'register') {
      return <SignIn initialMode="register" />;
    }
    return <LandingPage />;
  }

  // If authenticated and explicitly viewing landing page
  if (currentTab === 'landing') {
    return <LandingPage />;
  }
  if (currentTab === 'signin') {
    return <SignIn initialMode="signin" />;
  }
  if (currentTab === 'register') {
    return <SignIn initialMode="register" />;
  }

  const renderActivePage = () => {
    switch (currentTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'anomalies':
        return <BatteryAnomalies />;
      case 'upload':
      case 'analysis':
        return <BatteryHealth />;
      case 'charging':
        return <Charging />;
      case 'vehicle':
        return <Vehicle />;
      case 'history':
      case 'predictions':
      case 'insights':
        return <Insights initialTab={currentTab === 'history' || currentTab === 'predictions' ? 'analyses' : 'overview'} />;
      case 'settings':
        return <Settings />;
      case 'help':
        return <Help />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-background font-body-md text-on-surface flex">
      {/* Sidebar navigation */}
      <Sidebar mobileOpen={mobileMenuOpen} setMobileOpen={setMobileMenuOpen} />

      {/* Main content wrapper */}
      <div className="md:pl-64 flex flex-col flex-1 min-h-screen">
        <Navbar onOpenMobileMenu={() => setMobileMenuOpen(true)} />

        <main className="w-full pt-20 px-space-md md:px-margin-desktop py-space-xl pb-24 md:pb-space-xl max-w-[1600px] mx-auto flex-1">
          {renderActivePage()}
        </main>
      </div>

      <nav aria-label="Quick navigation" className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface-container-lowest border-t border-surface-container-highest/60 flex">
        {[
          ['dashboard', 'Dashboard', 'speed'],
          ['anomalies', 'Anomalies', 'warning'],
          ['analysis', 'SOH & RUL', 'battery_charging_full'],
          ['charging', 'Charging', 'ev_station'],
          ['insights', 'Insight', 'insights']
        ].map(([id, label, icon]) => (
          <button key={id} onClick={() => setCurrentTab(id)} aria-current={currentTab === id ? 'page' : undefined}
            className={`flex-1 flex flex-col items-center py-2 text-[11px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${currentTab === id ? 'text-primary font-semibold' : 'text-on-surface-variant'}`}>
            <span className="material-symbols-outlined text-[22px]" aria-hidden="true">{icon}</span>{label}</button>))}
      </nav>

      {/* Global Modals */}
      <AddVehicleModal />
    </div>
  );
}
