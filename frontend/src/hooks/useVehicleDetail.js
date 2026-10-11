import { useEffect, useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';

/** Loads the latest analysis detail for the selected vehicle once and exposes loading/error state. */
export default function useVehicleDetail() {
  const { activeVehicle, vehiclesLoading, loadVehicleDetail } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const id = activeVehicle?.id;
  const load = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    setLoading(true); setError(false);
    try { await loadVehicleDetail(id); } catch { setError(true); }
    setLoading(false);
  }, [id, loadVehicleDetail]);
  useEffect(() => { load(); }, [load]);
  return { vehicle: activeVehicle, loading: loading || vehiclesLoading, error, retry: load };
}
