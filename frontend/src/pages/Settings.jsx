import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Card, PageHeader, Btn } from '../components/common/ui';

export default function Settings() {
  const { currentUser, updateProfileInfo, logout, refreshVehicles } = useApp();
  const [name, setName] = useState(currentUser?.name || '');
  const [telemetryInterval, setTelemetryInterval] = useState(() => localStorage.getItem('vs_telemetry_interval') || '10hz');
  const [eolThreshold, setEolThreshold] = useState(() => localStorage.getItem('vs_eol_threshold') || '80');
  const [alertImbalance, setAlertImbalance] = useState(() => localStorage.getItem('vs_alert_imbalance') || '10');
  const [autoSync, setAutoSync] = useState(() => localStorage.getItem('vs_auto_sync') !== 'false');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSaving(true);
    try {
      if (name && name !== currentUser?.name) {
        await updateProfileInfo({ name });
      }
      localStorage.setItem('vs_telemetry_interval', telemetryInterval);
      localStorage.setItem('vs_eol_threshold', eolThreshold);
      localStorage.setItem('vs_alert_imbalance', alertImbalance);
      localStorage.setItem('vs_auto_sync', String(autoSync));
      window.dispatchEvent(new Event('vs-settings-updated'));
      if (refreshVehicles) await refreshVehicles();
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (error) {
      setErrorMessage(error.message || 'Could not save your profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setTelemetryInterval('10hz');
    setEolThreshold('80');
    setAlertImbalance('10');
    setAutoSync(true);
    localStorage.removeItem('vs_telemetry_interval');
    localStorage.removeItem('vs_eol_threshold');
    localStorage.removeItem('vs_alert_imbalance');
    localStorage.removeItem('vs_auto_sync');
    window.dispatchEvent(new Event('vs-settings-updated'));
    if (refreshVehicles) refreshVehicles();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="flex flex-col w-full pb-space-4xl max-w-4xl space-y-space-xl">
      <PageHeader
        title="EV Profile & Settings"
        subtitle="Configure telemetry sampling rates, degradation alert thresholds, and electrochemical modeling parameters."
      />

      {savedSuccess && (
        <div className="p-3.5 bg-primary/10 border border-primary/30 rounded-xl text-primary font-medium text-body-sm flex items-center gap-2 animate-in fade-in">
          <span className="material-symbols-outlined text-[20px]">check_circle</span>
          Configuration parameters updated successfully across active ECU streams.
        </div>
      )}

      <form onSubmit={handleSave} className="flex flex-col gap-space-xl">
        {/* User Profile */}
        <Card title="User Profile" subtitle="Account credentials and display profile.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Your Name
              </label>
              <input 
                type="text" 
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg text-body-sm text-on-surface border border-surface-container-highest/80 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Email Address
              </label>
              <input 
                type="email" 
                value={currentUser.email}
                disabled
                className="w-full h-10 px-3 bg-surface-container-low/60 rounded-lg text-body-sm text-on-surface-variant border border-surface-container-highest/80 cursor-not-allowed"
              />
            </div>
          </div>
        </Card>

        {/* Telemetry Ingestion Engine */}
        <Card title="BMS Telemetry & Streaming Configuration" subtitle="ECU sampling rates and electrochemical alert thresholds.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                ECU Sampling Frequency
              </label>
              <select 
                value={telemetryInterval}
                onChange={e => setTelemetryInterval(e.target.value)}
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg text-body-sm text-on-surface border border-surface-container-highest/80 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary font-mono text-xs"
              >
                <option value="1hz">1 Hz (Low Bandwidth Telematics)</option>
                <option value="5hz">5 Hz (Standard Diagnostic Log)</option>
                <option value="10hz">10 Hz (High Fidelity Diagnostic - Default)</option>
                <option value="can_burst">CAN Bus Raw Frame Burst (50 Hz)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Cell Voltage Imbalance Alert (mV)
              </label>
              <input 
                type="number" 
                value={alertImbalance}
                onChange={e => setAlertImbalance(e.target.value)}
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg text-body-sm text-on-surface border border-surface-container-highest/80 font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md pt-2">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Battery End of Life (EOL) Threshold (%)
              </label>
              <input 
                type="number" 
                value={eolThreshold}
                onChange={e => setEolThreshold(e.target.value)}
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg text-body-sm text-on-surface border border-surface-container-highest/80 font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex items-center gap-3 pt-6">
              <input 
                type="checkbox" 
                id="autoSync"
                checked={autoSync}
                onChange={e => setAutoSync(e.target.checked)}
                className="accent-primary h-4 w-4 rounded cursor-pointer"
              />
              <label htmlFor="autoSync" className="text-body-sm font-medium text-on-surface cursor-pointer">
                Re-analyze automatically when new battery data is uploaded
              </label>
            </div>
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          <Btn
            type="button"
            variant="secondary"
            onClick={logout}
            className="text-error hover:bg-error/10 hover:border-error/30"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            Log Out
          </Btn>

          <div className="flex items-center gap-space-sm">
            {errorMessage && (
              <span className="text-error font-medium text-body-sm">{errorMessage}</span>
            )}
            <Btn 
              type="button"
              variant="secondary"
              onClick={handleResetDefaults}
              className="text-on-surface-variant hover:text-on-surface"
            >
              Reset to Defaults
            </Btn>
            <Btn 
              type="submit"
              disabled={isSaving}
            >
              {isSaving ? 'Saving…' : 'Save Preferences'}
            </Btn>
          </div>
        </div>
      </form>
    </div>
  );
}
