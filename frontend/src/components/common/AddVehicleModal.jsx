import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export default function AddVehicleModal() {
  const { isAddVehicleModalOpen, setIsAddVehicleModalOpen, addVehicle } = useApp();

  const [formData, setFormData] = useState({
    nickname: '',
    year: '',
    capacityKwh: '',
    vin: '',
    soh: '',
    cycles: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isAddVehicleModalOpen) return null;

  const resetForm = () => {
    setFormData({ nickname: '', year: '', capacityKwh: '', vin: '', soh: '', cycles: '' });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-surface-container-highest/90">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-space-xl py-4 border-b border-surface-container-highest/80 bg-surface-container-low/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-container/20 text-primary flex items-center justify-center border border-primary-container/30">
              <span className="material-symbols-outlined text-[24px]">electric_car</span>
            </div>
            <div className="flex flex-col">
              <h2 className="text-headline-sm text-on-surface font-bold tracking-tight">
                Register EV Profile
              </h2>
              <span className="text-xs text-on-surface-variant font-mono">
                BMS architecture & battery configuration
              </span>
            </div>
          </div>
          <button 
            onClick={() => { setIsAddVehicleModalOpen(false); resetForm(); }}
            className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface cursor-pointer"
            aria-label="Close modal"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-space-xl flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider font-mono">
              Vehicle Nickname / ID *
            </label>
            <input 
              type="text" 
              required
              placeholder="e.g. My EV"
              value={formData.nickname}
              onChange={e => setFormData({ ...formData, nickname: e.target.value })}
              className="w-full h-10 px-3 bg-surface-container-lowest rounded-lg text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary border border-surface-container-highest/90"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider font-mono">
                Pack Capacity (kWh, optional)
              </label>
              <input 
                type="number" 
                step="0.1"
                placeholder="e.g. 75.0"
                value={formData.capacityKwh}
                onChange={e => setFormData({ ...formData, capacityKwh: e.target.value })}
                className="w-full h-10 px-3 bg-surface-container-lowest rounded-lg text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary border border-surface-container-highest/90 font-mono"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider font-mono">
                Model Year (optional)
              </label>
              <input 
                type="number" 
                min="2010"
                max="2030"
                placeholder="e.g. 2024"
                value={formData.year}
                onChange={e => setFormData({ ...formData, year: e.target.value })}
                className="w-full h-10 px-3 bg-surface-container-lowest rounded-lg text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary border border-surface-container-highest/90 font-mono"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider font-mono">
              VIN / Serial Number (optional)
            </label>
            <input 
              type="text" 
              placeholder="e.g. WP0AB2Y15PSA10293"
              value={formData.vin}
              onChange={e => setFormData({ ...formData, vin: e.target.value.toUpperCase() })}
              className="w-full h-10 px-3 bg-surface-container-lowest rounded-lg text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono uppercase border border-surface-container-highest/90"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 bg-surface-container-low/60 p-3 rounded-xl border border-surface-container-highest/60">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-on-surface-variant uppercase font-semibold font-mono">
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
                className="w-full h-9 px-2.5 bg-surface-container-lowest rounded-lg text-body-sm text-on-surface font-mono border border-surface-container-highest/80 focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-on-surface-variant uppercase font-semibold font-mono">
                Cycles Logged (optional)
              </label>
              <input 
                type="number" 
                placeholder="If known"
                value={formData.cycles}
                onChange={e => setFormData({ ...formData, cycles: e.target.value })}
                className="w-full h-9 px-2.5 bg-surface-container-lowest rounded-lg text-body-sm text-on-surface font-mono border border-surface-container-highest/80 focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
          </div>

          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            Leave unknown values blank. Pack nominal capacity (kWh) is recorded as metadata. Uploading battery logs will calculate empirical health independently.
          </p>

          {errorMessage && (
            <div className="px-3 py-2 rounded-lg bg-error-container/30 border border-error-container text-error text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">error</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-surface-container-highest/80 mt-1">
            <button 
              type="button"
              onClick={() => { setIsAddVehicleModalOpen(false); resetForm(); }}
              className="h-9 px-4 rounded-lg text-body-sm font-medium text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="h-9 px-5 rounded-lg bg-primary text-on-primary text-body-sm font-semibold hover:bg-surface-tint transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              {isSubmitting ? 'Setting up…' : 'Set Up My EV'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
