import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export default function AddVehicleModal() {
  const { isAddVehicleModalOpen, setIsAddVehicleModalOpen, addVehicle } = useApp();

  const [formData, setFormData] = useState({
    name: '',
    year: 2024,
    trim: '',
    chemistry: 'NMC',
    capacityKwh: '75.0',
    cellType: 'Prismatic NMC',
    vin: '',
    soh: 98.0,
    cycles: 120,
    packVoltage: '400.0 V',
    internalResistance: '1.7 mΩ',
    cellImbalance: '4 mV',
    tempAvg: '26.5 °C'
  });

  if (!isAddVehicleModalOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.vin) {
      alert('Please enter Vehicle Name and VIN');
      return;
    }

    addVehicle({
      ...formData,
      id: `veh_${Date.now()}`,
      chemistry: `${formData.capacityKwh} kWh ${formData.chemistry}`,
      soh: Number(formData.soh),
      cycles: Number(formData.cycles),
      status: Number(formData.soh) >= 90 ? 'Healthy' : 'Attention'
    });

    setIsAddVehicleModalOpen(false);
    // Reset form
    setFormData({
      name: '',
      year: 2024,
      trim: '',
      chemistry: 'NMC',
      capacityKwh: '75.0',
      cellType: 'Prismatic NMC',
      vin: '',
      soh: 98.0,
      cycles: 120,
      packVoltage: '400.0 V',
      internalResistance: '1.7 mΩ',
      cellImbalance: '4 mV',
      tempAvg: '26.5 °C'
    });
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
                Register New EV Pack
              </h2>
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                Electrochemical Telemetry Diagnostic Stream
              </span>
            </div>
          </div>
          <button 
            onClick={() => setIsAddVehicleModalOpen(false)}
            className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-space-xl flex flex-col gap-space-md">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
            <div className="flex flex-col gap-1">
              <label className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
                Make & Model *
              </label>
              <input 
                type="text" 
                required
                placeholder="e.g. Porsche Taycan 4S"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary border border-transparent focus:border-primary/30"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
                Model Year
              </label>
              <input 
                type="number" 
                min="2015"
                max="2027"
                value={formData.year}
                onChange={e => setFormData({ ...formData, year: Number(e.target.value) })}
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary border border-transparent focus:border-primary/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
            <div className="flex flex-col gap-1">
              <label className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
                Trim / Variant
              </label>
              <input 
                type="text" 
                placeholder="e.g. Performance Plus"
                value={formData.trim}
                onChange={e => setFormData({ ...formData, trim: e.target.value })}
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary border border-transparent focus:border-primary/30"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
                Battery Chemistry
              </label>
              <select 
                value={formData.chemistry}
                onChange={e => setFormData({ ...formData, chemistry: e.target.value })}
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary border border-transparent focus:border-primary/30 cursor-pointer"
              >
                <option value="NMC">NMC (Nickel Manganese Cobalt)</option>
                <option value="NCA">NCA (Nickel Cobalt Aluminum)</option>
                <option value="Blade LFP">Blade LFP (Lithium Iron Phosphate)</option>
                <option value="LFP">Standard LFP</option>
                <option value="Solid State">Solid State Prototype</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
            <div className="flex flex-col gap-1">
              <label className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
                Pack Capacity (kWh)
              </label>
              <input 
                type="number" 
                step="0.1"
                placeholder="e.g. 82.0"
                value={formData.capacityKwh}
                onChange={e => setFormData({ ...formData, capacityKwh: e.target.value })}
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary border border-transparent focus:border-primary/30"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
                VIN / Serial Number *
              </label>
              <input 
                type="text" 
                required
                placeholder="e.g. WP0AB2Y15PSA10293"
                value={formData.vin}
                onChange={e => setFormData({ ...formData, vin: e.target.value.toUpperCase() })}
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-mono uppercase border border-transparent focus:border-primary/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-space-sm bg-surface-container-low p-space-sm rounded-xl">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-on-surface-variant uppercase font-semibold">
                Initial SOH %
              </label>
              <input 
                type="number" 
                step="0.1"
                min="50"
                max="100"
                value={formData.soh}
                onChange={e => setFormData({ ...formData, soh: e.target.value })}
                className="w-full h-9 px-2 bg-surface-container-lowest rounded text-body-sm text-on-surface font-mono"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-on-surface-variant uppercase font-semibold">
                Cycles Logged
              </label>
              <input 
                type="number" 
                value={formData.cycles}
                onChange={e => setFormData({ ...formData, cycles: e.target.value })}
                className="w-full h-9 px-2 bg-surface-container-lowest rounded text-body-sm text-on-surface font-mono"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-on-surface-variant uppercase font-semibold">
                Pack Voltage
              </label>
              <input 
                type="text" 
                value={formData.packVoltage}
                onChange={e => setFormData({ ...formData, packVoltage: e.target.value })}
                className="w-full h-9 px-2 bg-surface-container-lowest rounded text-body-sm text-on-surface font-mono"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-space-sm pt-space-sm border-t border-surface-container-highest mt-2">
            <button 
              type="button"
              onClick={() => setIsAddVehicleModalOpen(false)}
              className="h-10 px-space-md rounded-lg text-body-md font-medium text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="h-10 px-space-xl rounded-lg bg-primary text-on-primary font-body-md font-semibold hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-space-xs"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Initialize Fleet Telemetry
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
