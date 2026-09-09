import React, { useState } from 'react';
import { useApp } from './context/AppContext';
import Sidebar from './components/layout/Sidebar';
import Navbar from './components/layout/Navbar';
import AddVehicleModal from './components/common/AddVehicleModal';

import Dashboard from './pages/Dashboard';
import MyVehicles from './pages/MyVehicles';
import UploadData from './pages/UploadData';
import BatteryAnalysis from './pages/BatteryAnalysis';
import PredictionHistory from './pages/PredictionHistory';
import Settings from './pages/Settings';
import Help from './pages/Help';
import SignIn from './pages/SignIn';

export default function App() {
  const { currentTab, isAuthenticated } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // If on Sign-In tab or not authenticated
  if (currentTab === 'signin' || !isAuthenticated) {
    return <SignIn />;
  }

  const renderActivePage = () => {
    switch (currentTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'vehicles':
        return <MyVehicles />;
      case 'upload':
        return <UploadData />;
      case 'analysis':
        return <BatteryAnalysis />;
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
