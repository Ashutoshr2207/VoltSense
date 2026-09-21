import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { loginUser, registerUser, getCurrentUser, logoutUser } from '../api/authApi';
import { updateProfile } from '../api/userApi';
import { fetchVehicles, createVehicle } from '../api/vehicleApi';
import { fetchPredictionsForVehicle, fetchInsightsForPrediction } from '../api/predictionApi';
import { fetchDatasetsForVehicle, triggerProcessing, getProcessingStatus } from '../api/datasetApi';
import { fetchNotifications, markNotificationAsRead } from '../api/notificationApi';
import { mapVehicle, mergeVehicleDetail, mapPredictionRow, mapNotification } from '../utils/mappers';

const AppContext = createContext();

function initialsFromName(name, email) {
  if (name) {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
  return (email || '??').slice(0, 2).toUpperCase();
}

function mapUser(apiUser) {
  return {
    name: apiUser.name,
    title: 'EV Owner',
    email: apiUser.email,
    avatar: initialsFromName(apiUser.name, apiUser.email)
  };
}

export function AppProvider({ children }) {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const [vehicles, setVehicles] = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [predictions, setPredictions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [currentTab, setCurrentTab] = useState('landing');
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [isAddVehicleModalOpen, setIsAddVehicleModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const vehiclesRef = useRef(vehicles);
  useEffect(() => {
    vehiclesRef.current = vehicles;
  }, [vehicles]);

  const refreshVehicles = useCallback(async () => {
    setVehiclesLoading(true);
    try {
      const result = await fetchVehicles();
      const mapped = (result.vehicles || []).map(mapVehicle);
      setVehicles(mapped);
      setSelectedVehicleId((prev) => prev && mapped.some((v) => v.id === prev) ? prev : (mapped[0]?.id || null));
      return mapped;
    } catch (error) {
      console.error('Failed to load vehicles:', error);
      return [];
    } finally {
      setVehiclesLoading(false);
    }
  }, []);

  const refreshPredictions = useCallback(async (vehicleList) => {
    const list = vehicleList || vehiclesRef.current;
    if (!list.length) {
      setPredictions([]);
      return;
    }
    try {
      const perVehicle = await Promise.all(
        list.map(async (vehicle) => {
          try {
            const result = await fetchPredictionsForVehicle(vehicle.id, { pageSize: 10, sortOrder: 'desc' });
            return (result.predictions || []).map((p) => mapPredictionRow(p, vehicle));
          } catch (error) {
            console.error(`Failed to load predictions for vehicle ${vehicle.id}:`, error);
            return [];
          }
        })
      );
      const merged = perVehicle.flat().sort((a, b) => new Date(b.timestampRaw) - new Date(a.timestampRaw));
      const seenIds = new Set();
      const deduplicated = [];
      for (const p of merged) {
        if (p.id && !seenIds.has(p.id)) {
          seenIds.add(p.id);
          deduplicated.push(p);
        }
      }
      setPredictions(deduplicated);
    } catch (error) {
      console.error('Failed to load predictions:', error);
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const result = await fetchNotifications();
      setNotifications((result.notifications || []).map(mapNotification));
      setUnreadCount(result.unreadCount || 0);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  }, []);

  const markNotificationRead = useCallback(async (notificationId) => {
    try {
      await markNotificationAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }, []);

  // Fetches the latest prediction, its insight, and the most recent dataset
  // for a vehicle, then merges that detail onto the vehicle's list entry so
  // BatteryAnalysis can render real loss-breakdown/recommendations/metrics.
  const loadVehicleDetail = useCallback(async (vehicleId) => {
    try {
      const predResult = await fetchPredictionsForVehicle(vehicleId, { pageSize: 1, sortOrder: 'desc' });
      const latestPrediction = predResult.predictions?.[0] || null;

      let insight = null;
      if (latestPrediction) {
        try {
          insight = await fetchInsightsForPrediction(latestPrediction.id);
        } catch (error) {
          // Insights may not exist yet for this prediction; not fatal.
        }
      }

      let dataset = null;
      try {
        const dsResult = await fetchDatasetsForVehicle(vehicleId);
        dataset = dsResult.datasets?.[0] || null;
      } catch (error) {
        // No datasets yet; not fatal.
      }

      setVehicles((prev) =>
        prev.map((v) =>
          v.id === vehicleId ? mergeVehicleDetail(v, { prediction: latestPrediction, insight, dataset }) : v
        )
      );
    } catch (error) {
      console.error(`Failed to load detail for vehicle ${vehicleId}:`, error);
    }
  }, []);

  const [switchingBattery, setSwitchingBattery] = useState(false);

  const switchBattery = useCallback(async (batteryId) => {
    const veh = vehiclesRef.current[0];
    if (!veh || !veh.id) return;
    setSwitchingBattery(true);
    try {
      const dsResult = await fetchDatasetsForVehicle(veh.id);
      const dataset = dsResult.datasets?.[0];
      if (!dataset) return;
      await triggerProcessing(dataset.id, { batteryId });
      let attempts = 0;
      while (attempts < 25) {
        await new Promise((r) => setTimeout(r, 600));
        const status = await getProcessingStatus(dataset.id);
        if (status.status === 'processed' || status.pipelineRun?.status === 'completed') {
          break;
        }
        attempts++;
      }
      await refreshVehicles();
      await loadVehicleDetail(veh.id);
    } catch (err) {
      console.error('Failed to switch battery:', err);
    } finally {
      setSwitchingBattery(false);
    }
  }, [refreshVehicles, loadVehicleDetail]);

  const loadUserData = useCallback(async () => {
    const mapped = await refreshVehicles();
    await refreshPredictions(mapped);
    await refreshNotifications();
    return mapped;
  }, [refreshVehicles, refreshPredictions, refreshNotifications]);

  // Bootstrap session exactly once on initial application mount.
  // Never repeatedly overwrite currentTab once user is browsing.
  useEffect(() => {
    let active = true;
    (async () => {
      const token = localStorage.getItem('voltsense_token');
      if (!token) {
        if (active) setAuthChecked(true);
        return;
      }
      try {
        const user = await getCurrentUser();
        if (active) {
          setCurrentUser(mapUser(user));
          setIsAuthenticated(true);
          setCurrentTab((prev) => (prev === 'landing' || prev === 'signin' || prev === 'register' ? 'dashboard' : prev));
        }
        await loadUserData();
      } catch (error) {
        localStorage.removeItem('voltsense_token');
        if (active) {
          setIsAuthenticated(false);
          setCurrentUser(null);
          setVehicles([]);
          setPredictions([]);
          setNotifications([]);
        }
      } finally {
        if (active) setAuthChecked(true);
      }
    })();
    return () => { active = false; };
  }, [loadUserData]);

  useEffect(() => {
    const handleUnauthorized = () => {
      localStorage.removeItem('voltsense_token');
      setIsAuthenticated(false);
      setCurrentUser(null);
      setVehicles([]);
      setPredictions([]);
      setNotifications([]);
      setUnreadCount(0);
      setSelectedVehicleId(null);
      setCurrentTab('signin');
    };
    window.addEventListener('voltsense:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('voltsense:unauthorized', handleUnauthorized);
  }, []);

  const login = async (email, password) => {
    const result = await loginUser(email, password);
    localStorage.setItem('voltsense_token', result.token);
    setCurrentUser(mapUser(result.user));
    setIsAuthenticated(true);
    setVehicles([]);
    setPredictions([]);
    setNotifications([]);
    setUnreadCount(0);
    setSelectedVehicleId(null);
    await loadUserData();
    setCurrentTab('dashboard');
  };

  const register = async (name, email, password) => {
    const result = await registerUser(name, email, password);
    localStorage.setItem('voltsense_token', result.token);
    setCurrentUser(mapUser(result.user));
    setIsAuthenticated(true);
    setVehicles([]);
    setPredictions([]);
    setNotifications([]);
    setUnreadCount(0);
    setSelectedVehicleId(null);
    await loadUserData();
    setCurrentTab('dashboard');
  };

  const logout = async () => {
    try {
      await logoutUser();
    } catch (error) {
      // Even if the server call fails, proceed with clearing the local session.
    }
    localStorage.removeItem('voltsense_token');
    setIsAuthenticated(false);
    setCurrentUser(null);
    setVehicles([]);
    setPredictions([]);
    setNotifications([]);
    setUnreadCount(0);
    setSelectedVehicleId(null);
    setCurrentTab('landing');
  };

  const addVehicle = async (formPayload) => {
    await createVehicle(formPayload);
    await loadUserData();
  };

  const addPrediction = (row) => {
    if (!row || !row.id) return;
    setPredictions((prev) => {
      if (prev.some((p) => p.id === row.id)) {
        return prev;
      }
      return [row, ...prev];
    });
  };

  const updateProfileInfo = async (payload) => {
    const updatedUser = await updateProfile(payload);
    setCurrentUser(mapUser(updatedUser));
    return updatedUser;
  };

  const selectVehicleForReport = (vehicleId) => {
    setSelectedVehicleId(vehicleId);
    setCurrentTab('analysis');
  };

  const activeVehicle = vehicles.find((v) => v.id === selectedVehicleId) || vehicles[0] || null;

  return (
    <AppContext.Provider
      value={{
        authChecked,
        vehicles,
        vehiclesLoading,
        predictions,
        notifications,
        unreadCount,
        markNotificationRead,
        refreshNotifications,
        currentTab,
        setCurrentTab,
        selectedVehicleId,
        setSelectedVehicleId,
        selectVehicleForReport,
        activeVehicle,
        addVehicle,
        addPrediction,
        updateProfileInfo,
        refreshVehicles,
        refreshPredictions,
        loadVehicleDetail,
        isAddVehicleModalOpen,
        setIsAddVehicleModalOpen,
        searchQuery,
        setSearchQuery,
        isAuthenticated,
        currentUser,
        login,
        register,
        logout,
        switchBattery,
        switchingBattery,
      }}
    >
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
