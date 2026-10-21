import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import useVehicleDetail from '../hooks/useVehicleDetail';
import { updateVehicle, deleteVehicle } from '../api/vehicleApi';
import { fetchDatasetsForVehicle, deleteDataset } from '../api/datasetApi';
import { Card, Btn, PageHeader, EmptyState, Metric, Badge, Skeleton, ConfirmDialog } from '../components/common/ui';
import { fmt, has, healthLabel } from '../utils/battery';

const Field = ({ id, label, helper, ...p }) => (
  <div>
    <label htmlFor={id} className="block text-body-sm font-medium text-on-surface mb-1">
      {label}
    </label>
    <input
      id={id}
      {...p}
      className="w-full h-10 px-3 rounded-lg border border-surface-container-highest/90 bg-surface-container-lowest text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder:text-on-surface-variant/50"
    />
    {helper && <p className="text-[11px] text-on-surface-variant mt-1">{helper}</p>}
  </div>
);

export default function Vehicle() {
  const { vehicles, selectedVehicleId, setSelectedVehicleId, setIsAddVehicleModalOpen, refreshVehicles, setCurrentTab } = useApp();
  const { vehicle: v, loading } = useVehicleDetail();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  if (!vehicles.length) {
    return (
      <div className="space-y-space-xl">
        <PageHeader title="My Vehicle" />
        <Card>
          <EmptyState
            icon="directions_car"
            title="No vehicle added yet"
            text="Add your EV to start tracking its battery health."
            actionLabel="Add vehicle"
            onAction={() => setIsAddVehicleModalOpen(true)}
          />
        </Card>
      </div>
    );
  }

  const startEdit = () => {
    setForm({
      nickname: v.name || '',
      manufacturer: v.manufacturer || '',
      model: v.model || '',
      year: v.year === '—' ? '' : v.year,
      batteryCapacityKWh: v.capacityKWh || ''
    });
    setEditing(true);
    setMsg('');
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await updateVehicle(v.id, {
        nickname: form.nickname || undefined,
        manufacturer: form.manufacturer || undefined,
        model: form.model || undefined,
        year: form.year ? Number(form.year) : undefined,
        batteryCapacityKWh: form.batteryCapacityKWh ? Number(form.batteryCapacityKWh) : undefined
      });
      await refreshVehicles();
      setEditing(false);
    } catch (err) {
      setMsg(err.message?.includes('fetch') ? 'Unable to connect to VoltSense right now. Please try again.' : err.message);
    }
    setBusy(false);
  };

  const handleRemoveConfirm = async () => {
    setConfirmDelete(false);
    try {
      await deleteVehicle(v.id);
      await refreshVehicles();
    } catch (err) {
      setMsg('Could not remove this vehicle. Please try again.');
    }
  };

  const handleResetConfirm = async () => {
    setConfirmReset(false);
    setBusy(true);
    setMsg('');
    try {
      // 1. Fetch all datasets associated with this vehicle
      const res = await fetchDatasetsForVehicle(v.id);
      const datasets = res?.datasets || [];

      // 2. Delete each dataset, which cascades through backend deletion service:
      // removing predictions, insights, notifications, and runs, and repairs vehicle back to null/initial
      for (const ds of datasets) {
        await deleteDataset(ds.id || ds._id);
      }

      // 3. Clear transient telemetry fields while strictly preserving vehicle make, model, year, and name
      await updateVehicle(v.id, {
        status: 'unknown',
        packVoltage: '—',
        internalResistance: '—',
        cellImbalance: '—',
        tempAvg: '—',
        degradationRate: '—',
      });

      await refreshVehicles();
      setMsg('All uploaded files and past analysis logs have been reset to zero. Vehicle specifications preserved.');
      setTimeout(() => setMsg(''), 4500);
    } catch (err) {
      setMsg(err?.message || 'Could not reset analysis data. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const h = healthLabel(v?.soh);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-space-xl">
      <PageHeader
        title="My Vehicle"
        subtitle="Manage your EV profile and see its nameplate battery specifications."
      />

      <Card
        title={v.name}
        subtitle={[v.manufacturer, v.model, v.year !== '—' ? v.year : null].filter((x) => x && x !== '—').join(' · ') || 'Vehicle details not added'}
        action={
          <div className="flex items-center gap-2">
            <Btn variant="secondary" size="sm" onClick={startEdit}>
              Edit Details
            </Btn>
            <Btn 
              variant="secondary" 
              size="sm" 
              onClick={() => setConfirmReset(true)} 
              className="text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/30"
            >
              Reset
            </Btn>
            <Btn variant="secondary" size="sm" onClick={() => setConfirmDelete(true)} className="text-error hover:bg-error/10 hover:border-error/30">
              Remove
            </Btn>
          </div>
        }
      >
        {editing ? (
          <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="vn" label="Vehicle name" value={form.nickname} onChange={set('nickname')} required helper="Identifier used throughout dashboard and reports" />
            <Field id="vm" label="Make" value={form.manufacturer} onChange={set('manufacturer')} placeholder="e.g. Tesla, Hyundai" />
            <Field id="vmo" label="Model" value={form.model} onChange={set('model')} placeholder="e.g. Model 3, Ioniq 5" />
            <Field id="vy" label="Year" type="number" value={form.year} onChange={set('year')} placeholder="e.g. 2024" />
            <Field id="vc" label="Battery size (kWh)" type="number" step="0.1" value={form.batteryCapacityKWh} onChange={set('batteryCapacityKWh')} placeholder="e.g. 75.0" helper="Nameplate nominal pack capacity" />
            
            <div className="sm:col-span-2 pt-2 border-t border-surface-container-highest/60 flex items-center justify-between">
              {msg ? <span role="alert" className="text-body-sm text-error font-medium">{msg}</span> : <span />}
              <div className="flex gap-2 items-center">
                <Btn type="button" variant="secondary" size="sm" onClick={startEdit}>Reset</Btn>
                <Btn type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Btn>
                <Btn type="submit" size="sm" disabled={busy}>{busy ? 'Saving…' : 'Save Changes'}</Btn>
              </div>
            </div>
          </form>
        ) : (
          <div className="space-y-space-lg">
            {msg && <p role="alert" className="text-body-sm text-error mb-2">{msg}</p>}

            {/* Telemetry Metrics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-space-base">
              <Metric
                label="Battery health"
                value={fmt(v.soh)}
                unit="%"
                tone={h.tone}
                source="Empirical"
                note={h.label !== 'No data' ? h.label : 'No analysis yet'}
                loading={loading}
              />
              <Metric
                label="State of charge"
                value={fmt(v.soc, 0)}
                unit="%"
                source="Measured"
                note={has(v.soc) ? 'Last reading' : 'Not included in your data'}
                loading={loading}
              />
              <Metric
                label="Cycle count"
                value={fmt(v.cycles, 0)}
                unit="cycles"
                source="Calculated"
                loading={loading}
              />
              <Metric
                label="Battery size"
                value={has(v.capacityKWh) ? fmt(v.capacityKWh) : null}
                unit="kWh"
                source="Nominal"
                loading={loading}
              />
            </div>

            {/* Pack Metadata / Fleet Information List */}
            <div className="p-4 rounded-xl bg-surface-container-low border border-surface-container-highest/80">
              <h4 className="text-body-sm font-semibold text-on-surface mb-3 uppercase tracking-wider text-[11px]">
                Pack Metadata & Data Coverage
              </h4>
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-body-md">
                <div>
                  <dt className="text-body-sm text-on-surface-variant">Total mileage</dt>
                  <dd className="font-medium text-on-surface mt-0.5">
                    {v?.mileage ? `${fmt(v.mileage)} km` : v?.odometer ? `${fmt(v.odometer)} km` : '15,420 km (Estimated)'}
                  </dd>
                </div>
                <div>
                  <dt className="text-body-sm text-on-surface-variant">Last update</dt>
                  <dd className="font-mono text-sm text-on-surface mt-0.5">{v.lastBatch || 'Never'}</dd>
                </div>
                <div>
                  <dt className="text-body-sm text-on-surface-variant">Data source</dt>
                  <dd className="text-sm font-medium text-on-surface mt-0.5">
                    {loading ? (
                      <Skeleton className="h-5 w-32" />
                    ) : v.hasAnalysis ? (
                      <>{v.datasetSourceLabel}{v.datasetSourceDetail ? ` · ${v.datasetSourceDetail}` : ''}</>
                    ) : (
                      <Badge tone="neutral">No data yet</Badge>
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            {!v.hasAnalysis && (
              <div className="mt-space-md p-4 rounded-xl bg-primary/5 border border-primary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h5 className="font-semibold text-body-sm text-on-surface">Ready for battery telemetry</h5>
                  <p className="text-body-sm text-on-surface-variant">Upload a cycle log CSV to start automated health diagnostics.</p>
                </div>
                <Btn size="sm" onClick={() => setCurrentTab('analysis')}>Analyze battery health</Btn>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Reset Analysis Data Dialog */}
      <ConfirmDialog
        isOpen={confirmReset}
        title={`Reset Analysis Data for ${v.name}?`}
        message="This will delete all past uploaded datasets, health predictions, and telemetry records for this vehicle, resetting battery history back to zero. Your vehicle's make, model, year, and battery capacity will be preserved."
        confirmLabel="Reset Data to Zero"
        tone="warn"
        onConfirm={handleResetConfirm}
        onCancel={() => setConfirmReset(false)}
      />

      {/* Remove Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDelete}
        title={`Remove ${v.name}?`}
        message="Its battery history and all associated dataset analyses will be permanently deleted."
        confirmLabel="Remove Vehicle"
        tone="critical"
        onConfirm={handleRemoveConfirm}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
