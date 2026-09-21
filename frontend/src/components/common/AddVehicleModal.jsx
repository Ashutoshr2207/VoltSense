import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export default function AddVehicleModal() {
  const { isAddVehicleModalOpen, setIsAddVehicleModalOpen, addVehicle } = useApp();

  const [formData, setFormData] = useState({
    nickname: '',
    year: '',
    capacityKwh: '75.0',
    vin: '',
    soh: '',
    cycles: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isAddVehicleModalOpen) return null;

  const resetForm = () => {
    setFormData({ nickname: '', year: '', capacityKwh: '75.0', vin: '', soh: '', cycles: '' });
    setErrorMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.nickname) {
      setErrorMessage('Please give your EV a name.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await addVehicle({
        nickname: formData.nickname,
        year: formData.year ? Number(formData.year) : undefined,
        batteryCapacityKWh: formData.capacityKwh ? Number(formData.capacityKwh) : undefined,
        vin: formData.vin || undefined,
        latestSOH: formData.soh !== '' ? Number(formData.soh) : undefined,
        currentCycleCount: formData.cycles !== '' ? Number(formData.cycles) : undefined
      });
      setIsAddVehicleModalOpen(false);
      resetForm();
    } catch (error) {
      setErrorMessage(error.message || 'Could not set up your EV. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface-container-lowest rounded-2xl shadow-xl w-full max-w-xl overflow-hidden border border-surface-container-highest">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-space-xl py-space-lg border-b border-surface-container-highest bg-surface-container-low/50">
          <div className="flex items-center gap-space-sm">
            <div className="w-10 h-10 rounded-lg bg-primary-container/20 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">electric_car</span>
            </div>
            <div className="flex flex-col">
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                Set Up Your EV
              </h2>
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                Register your battery for degradation monitoring
              </span>
            </div>
          </div>
          <button 
            onClick={() => { setIsAddVehicleModalOpen(false); resetForm(); }}
            className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-space-xl flex flex-col gap-space-md">
          <div className="flex flex-col gap-1">
            <label className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
              EV Nickname *
            </label>
            <input 
              type="text" 
              required
              placeholder="e.g. My Tesla Model 3"
              value={formData.nickname}
              onChange={e => setFormData({ ...formData, nickname: e.target.value })}
              className="w-full h-10 px-3 bg-surface-container-low rounded-lg text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary border border-transparent focus:border-primary/30"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
            <div className="flex flex-col gap-1">
              <label className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
                Pack Capacity (kWh)
              </label>
              <input 
                type="number" 
                step="0.1"
                placeholder="e.g. 75.0"
                value={formData.capacityKwh}
                onChange={e => setFormData({ ...formData, capacityKwh: e.target.value })}
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary border border-transparent focus:border-primary/30"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
                Model Year (optional)
              </label>
              <input 
                type="number" 
                min="2010"
                max="2030"
                placeholder="e.g. 2023"
                value={formData.year}
                onChange={e => setFormData({ ...formData, year: e.target.value })}
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary border border-transparent focus:border-primary/30"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
              VIN / Serial Number (optional)
            </label>
            <input 
              type="text" 
              placeholder="e.g. WP0AB2Y15PSA10293"
              value={formData.vin}
              onChange={e => setFormData({ ...formData, vin: e.target.value.toUpperCase() })}
              className="w-full h-10 px-3 bg-surface-container-low rounded-lg text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-mono uppercase border border-transparent focus:border-primary/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-space-sm bg-surface-container-low p-space-sm rounded-xl">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-on-surface-variant uppercase font-semibold">
                Current SOH % (optional)
              </label>
              <input 
                type="number" 
                step="0.1"
                min="0"
                max="100"
                placeholder="If known"
                value={formData.soh}
                onChange={e => setFormData({ ...formData, soh: e.target.value })}
                className="w-full h-9 px-2 bg-surface-container-lowest rounded text-body-sm text-on-surface font-mono"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-on-surface-variant uppercase font-semibold">
                Cycles Logged (optional)
              </label>
              <input 
                type="number" 
                placeholder="If known"
                value={formData.cycles}
                onChange={e => setFormData({ ...formData, cycles: e.target.value })}
                className="w-full h-9 px-2 bg-surface-container-lowest rounded text-body-sm text-on-surface font-mono"
              />
            </div>
          </div>

          <p className="text-[12px] text-on-surface-variant">
            Don't know your SOH or cycle count yet? Leave them blank — upload a telemetry CSV afterward and VoltSense will calculate them for you.
          </p>

          {errorMessage && (
            <div className="px-space-md py-space-sm rounded-lg bg-error-container/30 border border-error-container text-error font-body-sm text-body-sm">
              {errorMessage}
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-space-sm pt-space-sm border-t border-surface-container-highest mt-2">
            <button 
              type="button"
              onClick={() => { setIsAddVehicleModalOpen(false); resetForm(); }}
              className="h-10 px-space-md rounded-lg text-body-md font-medium text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="h-10 px-space-xl rounded-lg bg-primary text-on-primary font-body-md font-semibold hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-space-xs disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              {isSubmitting ? 'Setting up…' : 'Set Up My EV'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
