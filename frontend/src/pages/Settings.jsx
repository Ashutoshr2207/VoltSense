import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function Settings() {
  const { currentUser } = useApp();
  const [telemetryInterval, setTelemetryInterval] = useState('10hz');
  const [eolThreshold, setEolThreshold] = useState('70');
  const [alertImbalance, setAlertImbalance] = useState('10');
  const [autoSync, setAutoSync] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="flex flex-col w-full pb-space-4xl max-w-4xl">
      <div className="flex flex-col gap-space-2xs mb-space-xl">
        <span className="font-label-sm text-label-sm text-primary uppercase tracking-wider font-semibold">
          System Config
        </span>
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
          Operator & Diagnostics Settings
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Configure telemetry sampling rates, degradation alert thresholds, and electrochemical modeling parameters.
        </p>
      </div>

      {savedSuccess && (
        <div className="p-space-md bg-secondary-container/30 border border-secondary-container rounded-xl text-primary font-medium text-body-sm flex items-center gap-2 mb-space-lg animate-in fade-in">
          <span className="material-symbols-outlined text-[20px]">check_circle</span>
          Configuration parameters updated successfully across active ECU streams.
        </div>
      )}

      <form onSubmit={handleSave} className="flex flex-col gap-space-xl">
        {/* Operator Profile */}
        <div className="bg-surface-container-lowest p-space-xl rounded-xl shadow-sm border border-surface-container-highest/40 flex flex-col gap-space-md">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Operator Profile
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
            <div>
              <label className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
                Operator Name
              </label>
              <input 
                type="text" 
                defaultValue={currentUser.name} 
                className="w-full h-10 px-3 mt-1 bg-surface-container-low rounded-lg text-body-sm text-on-surface border border-surface-container-highest/60"
              />
            </div>
            <div>
              <label className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
                Work Email
              </label>
              <input 
                type="email" 
                defaultValue={currentUser.email} 
                className="w-full h-10 px-3 mt-1 bg-surface-container-low rounded-lg text-body-sm text-on-surface border border-surface-container-highest/60"
              />
            </div>
          </div>
        </div>

        {/* Telemetry Ingestion Engine */}
        <div className="bg-surface-container-lowest p-space-xl rounded-xl shadow-sm border border-surface-container-highest/40 flex flex-col gap-space-md">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            BMS Telemetry & Streaming Configuration
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
            <div>
              <label className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
                ECU Sampling Frequency
              </label>
              <select 
                value={telemetryInterval}
                onChange={e => setTelemetryInterval(e.target.value)}
                className="w-full h-10 px-3 mt-1 bg-surface-container-low rounded-lg text-body-sm text-on-surface border border-surface-container-highest/60 cursor-pointer"
              >
                <option value="1hz">1 Hz (Low Bandwidth Telematics)</option>
                <option value="5hz">5 Hz (Standard Fleet Log)</option>
                <option value="10hz">10 Hz (High Fidelity Diagnostic - Default)</option>
                <option value="can_burst">CAN Bus Raw Frame Burst (50 Hz)</option>
              </select>
            </div>

            <div>
              <label className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
                Cell Voltage Imbalance Alert (mV)
              </label>
              <input 
                type="number" 
                value={alertImbalance}
                onChange={e => setAlertImbalance(e.target.value)}
                className="w-full h-10 px-3 mt-1 bg-surface-container-low rounded-lg text-body-sm text-on-surface border border-surface-container-highest/60 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md pt-2">
            <div>
              <label className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
                Battery End of Life (EOL) Threshold (%)
              </label>
              <input 
                type="number" 
                value={eolThreshold}
                onChange={e => setEolThreshold(e.target.value)}
                className="w-full h-10 px-3 mt-1 bg-surface-container-low rounded-lg text-body-sm text-on-surface border border-surface-container-highest/60 font-mono"
              />
            </div>

            <div className="flex items-center gap-3 pt-6">
              <input 
                type="checkbox" 
                id="autoSync"
                checked={autoSync}
                onChange={e => setAutoSync(e.target.checked)}
                className="accent-primary h-4 w-4"
              />
              <label htmlFor="autoSync" className="text-body-sm font-medium text-on-surface cursor-pointer">
                Automatic Bayesian posterior re-calibration on new CSV ingestion
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button 
            type="submit"
            className="h-10 px-space-xl bg-primary text-on-primary hover:bg-primary-container rounded-lg font-label-md text-label-md font-semibold transition-colors shadow-sm"
          >
            Save Preferences
          </button>
        </div>
      </form>
    </div>
  );
}
