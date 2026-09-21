import React, { useState } from 'react';
import { useApp } from './context/AppContext';
import Sidebar from './components/layout/Sidebar';
import Navbar from './components/layout/Navbar';
import AddVehicleModal from './components/common/AddVehicleModal';

import Dashboard from './pages/Dashboard';
import UploadData from './pages/UploadData';
import BatteryAnalysis from './pages/BatteryAnalysis';
import ChargingMap from './pages/ChargingMap';
import PredictionHistory from './pages/PredictionHistory';
import Settings from './pages/Settings';
import Help from './pages/Help';
import SignIn from './pages/SignIn';
import LandingPage from './pages/LandingPage';

export default function App() {
  const { currentTab, isAuthenticated, authChecked } = useApp();
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
      case 'upload':
        return <UploadData />;
      case 'analysis':
        return <BatteryAnalysis />;
      case 'charging':
        return <ChargingMap />;
      case 'predictions':
        return <PredictionHistory />;
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

        <main className="w-full pt-20 px-space-md md:px-margin-desktop py-space-xl max-w-[1600px] mx-auto flex-1">
          {renderActivePage()}
        </main>
      </div>

      {/* Global Modals */}
      <AddVehicleModal />
    </div>
  );
}
