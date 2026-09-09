import React, { createContext, useContext, useState, useEffect } from 'react';

const AppContext = createContext();

const initialVehicles = [
  {
    id: "tesla_m3_perf",
    name: "Tesla Model 3 Performance",
    year: 2023,
    trim: "Long Range AWD",
    chemistry: "82.0 kWh NCA",
    cellType: "2170 Cylindrical",
    vin: "5YJ3E1EB9PF829104",
    status: "Healthy",
    soh: 94.2,
    eolThreshold: 70.0,
    cycles: 412,
    rul: 680,
    packVoltage: "389.4 V",
    internalResistance: "1.8 mΩ",
    cellImbalance: "6 mV",
    tempAvg: "28.4 °C",
    lastBatch: "2 hours ago",
    degradationRate: "-0.12% / mo",
    lastReportDate: "Sep 7, 2026",
    reportId: "VS-2026-09",
    recordsCount: 12482,
    lossBreakdown: { lli: 4.1, lam: 1.7, ohmic: 3.2 },
    recommendations: [
      "Maintain daily charging threshold below 80% to curtail SEI layer growth.",
      "Scheduled cell passive balance cycle nominal; next interval at 500 cycles.",
      "Coolant flow impedance optimal; thermistor differential within ±0.8°C."
    ]
  },
  {
    id: "byd_atto3",
    name: "BYD Atto 3",
    year: 2022,
    trim: "Extended Range",
    chemistry: "60.5 kWh Blade LFP",
    cellType: "Prismatic Blade LFP",
    vin: "LGXCE4CB4N0341829",
    status: "Attention",
    alertNote: "Imbalance Δ14mV",
    soh: 87.8,
    eolThreshold: 70.0,
    cycles: 731,
    rul: 285,
    packVoltage: "403.2 V",
    internalResistance: "2.6 mΩ",
    cellImbalance: "14 mV",
    tempAvg: "33.8 °C",
    lastBatch: "4 hours ago",
    degradationRate: "-0.24% / mo",
    lastReportDate: "Sep 7, 2026",
    reportId: "VS-2026-08",
    recordsCount: 18920,
    lossBreakdown: { lli: 7.4, lam: 3.1, ohmic: 5.6 },
    recommendations: [
      "Perform controlled top-balancing charge to 100% at 0.1C to equalize cell bank 3.",
      "Warning: Accelerated fade profile detected on cell modules 14-16.",
      "Review thermal bypass actuator logs; localized thermal delta of 3.4°C recorded."
    ]
  },
  {
    id: "tata_nexon",
    name: "Tata Nexon EV",
    year: 2024,
    trim: "Long Range Empowered+",
    chemistry: "40.5 kWh LFP",
    cellType: "Prismatic LFP",
    vin: "MAT612034R1049281",
    status: "Healthy",
    soh: 93.1,
    eolThreshold: 70.0,
    cycles: 289,
    rul: 820,
    packVoltage: "320.1 V",
    internalResistance: "1.9 mΩ",
    cellImbalance: "5 mV",
    tempAvg: "27.1 °C",
    lastBatch: "1 day ago",
    degradationRate: "-0.10% / mo",
    lastReportDate: "Sep 6, 2026",
    reportId: "VS-2026-07",
    recordsCount: 9640,
    lossBreakdown: { lli: 3.8, lam: 1.4, ohmic: 2.9 },
    recommendations: [
      "Operating strictly within baseline degradation envelope.",
      "Regenerative braking thermal absorption within factory specs.",
      "No manual service balancing required."
    ]
  }
];

const initialPredictions = [
  {
    id: "pred-01",
    timestamp: "2026-09-07 14:22:10 UTC",
    vehicleId: "tesla_m3_perf",
    vehicleName: "Tesla Model 3 Performance",
    vin: "5YJ3E1EB9PF••••••",
    modelVersion: "VoltSense Bayesian v1.0",
    measuredSoh: 94.2,
    predictedSoh: 94.1,
    delta: "-0.10%",
    credibleInterval: "93.7% - 94.5%",
    latency: "38.2 ms",
    status: "Nominal"
  },
  {
    id: "pred-02",
    timestamp: "2026-09-07 11:45:02 UTC",
    vehicleId: "byd_atto3",
    vehicleName: "BYD Atto 3 Extended",
    vin: "LGXCE4CB4N0••••••",
    modelVersion: "VoltSense Bayesian v1.0",
    measuredSoh: 87.8,
    predictedSoh: 87.3,
    delta: "-0.50%",
    credibleInterval: "86.6% - 88.0%",
    latency: "44.6 ms",
    status: "Drift Flag"
  },
  {
    id: "pred-03",
    timestamp: "2026-09-06 18:30:15 UTC",
    vehicleId: "tata_nexon",
    vehicleName: "Tata Nexon EV Max",
    vin: "MAT612034R1••••••",
    modelVersion: "VoltSense Bayesian v1.0",
    measuredSoh: 93.1,
    predictedSoh: 93.2,
    delta: "+0.10%",
    credibleInterval: "92.8% - 93.6%",
    latency: "39.1 ms",
    status: "Nominal"
  },
  {
    id: "pred-04",
    timestamp: "2026-09-05 09:12:44 UTC",
    vehicleId: "tesla_m3_perf",
    vehicleName: "Tesla Model 3 Performance",
    vin: "5YJ3E1EB9PF••••••",
    modelVersion: "VoltSense NeuralODE v2.1",
    measuredSoh: 94.3,
    predictedSoh: 94.2,
    delta: "-0.10%",
    credibleInterval: "93.9% - 94.5%",
    latency: "41.0 ms",
    status: "Nominal"
  },
  {
    id: "pred-05",
    timestamp: "2026-09-04 16:04:19 UTC",
    vehicleId: "byd_atto3",
    vehicleName: "BYD Atto 3 Extended",
    vin: "LGXCE4CB4N0••••••",
    modelVersion: "VoltSense Bayesian v1.0",
    measuredSoh: 88.1,
    predictedSoh: 87.9,
    delta: "-0.20%",
    credibleInterval: "87.3% - 88.5%",
    latency: "42.3 ms",
    status: "Nominal"
  }
];

export function AppProvider({ children }) {
  const [vehicles, setVehicles] = useState(() => {
    const saved = localStorage.getItem('voltsense_vehicles');
    return saved ? JSON.parse(saved) : initialVehicles;
  });

  const [predictions, setPredictions] = useState(() => {
    const saved = localStorage.getItem('voltsense_predictions');
    return saved ? JSON.parse(saved) : initialPredictions;
  });

  const [currentTab, setCurrentTab] = useState('dashboard');
  const [selectedVehicleId, setSelectedVehicleId] = useState('tesla_m3_perf');
  const [isAddVehicleModalOpen, setIsAddVehicleModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(true);

  const [currentUser, setCurrentUser] = useState({
    name: "Reed Parmar",
    title: "Battery Systems Lead",
    email: "reed.parmar@voltsense.io",
    avatar: "RP"
  });

  // Save vehicles & predictions to localStorage
  useEffect(() => {
    localStorage.setItem('voltsense_vehicles', JSON.stringify(vehicles));
  }, [vehicles]);

  useEffect(() => {
    localStorage.setItem('voltsense_predictions', JSON.stringify(predictions));
  }, [predictions]);

  const addVehicle = (vehicleData) => {
    const newVehicle = {
      ...vehicleData,
      id: vehicleData.id || `veh_${Date.now()}`,
      status: vehicleData.status || "Healthy",
      eolThreshold: 70.0,
      rul: vehicleData.rul || Math.round((vehicleData.soh - 70) * 28),
      lastBatch: "Just now",
      degradationRate: "-0.11% / mo",
      lastReportDate: "Sep 7, 2026",
      reportId: `VS-2026-${Math.floor(10 + Math.random() * 90)}`,
      recordsCount: 5000,
      lossBreakdown: { lli: 3.5, lam: 1.5, ohmic: 2.8 },
      recommendations: [
        "Initial baseline telemetry registered. Continue nominal charge cycle logging.",
        "Monitored pack cell voltage variance within manufacturer spec."
      ]
    };
    setVehicles(prev => [newVehicle, ...prev]);
  };

  const addPrediction = (newPred) => {
    setPredictions(prev => [newPred, ...prev]);
  };

  const selectVehicleForReport = (vehicleId) => {
    setSelectedVehicleId(vehicleId);
    setCurrentTab('analysis');
  };

  const login = (email) => {
    setCurrentUser({
      name: email.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      title: "Battery Systems Engineer",
      email: email,
      avatar: email.slice(0, 2).toUpperCase()
    });
    setIsAuthenticated(true);
    setCurrentTab('dashboard');
  };

  const logout = () => {
    setIsAuthenticated(false);
    setCurrentTab('signin');
  };

  const activeVehicle = vehicles.find(v => v.id === selectedVehicleId) || vehicles[0];

  return (
    <AppContext.Provider value={{
      vehicles,
      predictions,
      currentTab,
      setCurrentTab,
      selectedVehicleId,
      setSelectedVehicleId,
      selectVehicleForReport,
      activeVehicle,
      addVehicle,
      addPrediction,
      isAddVehicleModalOpen,
      setIsAddVehicleModalOpen,
      searchQuery,
      setSearchQuery,
      isAuthenticated,
      currentUser,
      login,
      logout
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
