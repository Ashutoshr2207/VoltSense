import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import useVehicleDetail from '../hooks/useVehicleDetail';
import { updateVehicle, deleteVehicle } from '../api/vehicleApi';
import { Card, Btn, PageHeader, EmptyState, Metric, Badge, Skeleton } from '../components/common/ui';
import { fmt, has, healthLabel } from '../utils/battery';

const Field = ({ id, label, ...p }) => (<div><label htmlFor={id} className="block text-body-sm text-on-surface-variant mb-1">{label}</label>
  <input id={id} {...p} className="w-full h-10 px-3 rounded-lg border border-outline-variant bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary" /></div>);

export default function Vehicle() {
  const { vehicles, selectedVehicleId, setSelectedVehicleId, setIsAddVehicleModalOpen, refreshVehicles, setCurrentTab } = useApp();
  const { vehicle: v, loading } = useVehicleDetail();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  if (!vehicles.length) return (<><PageHeader title="My Vehicle" /><Card><EmptyState icon="directions_car" title="No vehicle added yet" text="Add your EV to start tracking its battery health." actionLabel="Add vehicle" onAction={() => setIsAddVehicleModalOpen(true)} /></Card></>);

  const startEdit = () => { setForm({ nickname: v.name || '', manufacturer: v.manufacturer || '', model: v.model || '', year: v.year === '—' ? '' : v.year, batteryCapacityKWh: v.capacityKWh || '' }); setEditing(true); setMsg(''); };
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg('');
    try {
      await updateVehicle(v.id, { nickname: form.nickname || undefined, manufacturer: form.manufacturer || undefined, model: form.model || undefined,
        year: form.year ? Number(form.year) : undefined, batteryCapacityKWh: form.batteryCapacityKWh ? Number(form.batteryCapacityKWh) : undefined });
      await refreshVehicles(); setEditing(false);
    } catch (err) { setMsg(err.message?.includes('fetch') ? 'Unable to connect to VoltSense right now. Please try again.' : err.message); }
    setBusy(false);
  };
  const remove = async () => {
    if (!window.confirm(`Remove ${v.name}? Its battery history will be deleted.`)) return;
    try { await deleteVehicle(v.id); await refreshVehicles(); } catch (err) { setMsg('Could not remove this vehicle. Please try again.'); }
  };
  const h = healthLabel(v?.soh);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="space-y-space-xl">
      <PageHeader title="My Vehicle" subtitle="Manage your vehicles and see their battery details." action={<Btn onClick={() => setIsAddVehicleModalOpen(true)}>Add vehicle</Btn>} />
      {vehicles.length > 1 && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Select vehicle">{vehicles.map((x) => (
          <button key={x.id} role="radio" aria-checked={x.id === selectedVehicleId} onClick={() => setSelectedVehicleId(x.id)}
            className={`px-4 h-10 rounded-lg text-body-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${x.id === selectedVehicleId ? 'bg-primary text-on-primary' : 'bg-surface-container hover:bg-surface-container-high'}`}>{x.name}</button>))}</div>)}
      <Card title={v.name} subtitle={[v.manufacturer, v.model, v.year !== '—' ? v.year : null].filter((x) => x && x !== '—').join(' · ') || 'Vehicle details not added'}
        action={<div className="flex gap-2"><Btn variant="secondary" onClick={startEdit}>Edit</Btn><Btn variant="secondary" onClick={remove}>Remove</Btn></div>}>
        {editing ? (
          <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field id="vn" label="Vehicle name" value={form.nickname} onChange={set('nickname')} required />
            <Field id="vm" label="Make" value={form.manufacturer} onChange={set('manufacturer')} />
            <Field id="vmo" label="Model" value={form.model} onChange={set('model')} />
            <Field id="vy" label="Year" type="number" value={form.year} onChange={set('year')} />
            <Field id="vc" label="Battery size (kWh)" type="number" step="0.1" value={form.batteryCapacityKWh} onChange={set('batteryCapacityKWh')} />
            <div className="sm:col-span-2 flex gap-2 items-center"><Btn type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn><Btn type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Btn>{msg && <span role="alert" className="text-body-sm text-error">{msg}</span>}</div>
          </form>
        ) : (<>{msg && <p role="alert" className="text-body-sm text-error mb-2">{msg}</p>}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-space-base">
            <Metric label="Battery health" value={fmt(v.soh)} unit="%" tone={h.tone} note={h.label !== 'No data' ? h.label : 'No analysis yet'} loading={loading} />
            <Metric label="State of charge" value={fmt(v.soc, 0)} unit="%" note={has(v.soc) ? 'Last reading' : 'Not included in your data'} loading={loading} />
            <Metric label="Cycle count" value={fmt(v.cycles, 0)} loading={loading} />
            <Metric label="Battery size" value={has(v.capacityKWh) ? fmt(v.capacityKWh) : null} unit="kWh" loading={loading} />
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-space-xl text-body-md">
            <div><dt className="text-body-sm text-on-surface-variant">Total mileage</dt><dd>Not available</dd></div>
            <div><dt className="text-body-sm text-on-surface-variant">Last update</dt><dd>{v.lastBatch}</dd></div>
            <div><dt className="text-body-sm text-on-surface-variant">Data source</dt><dd>{loading ? <Skeleton className="h-5 w-32" /> : v.hasAnalysis ? <>{v.datasetSourceLabel}{v.datasetSourceDetail ? ` · ${v.datasetSourceDetail}` : ''}</> : <Badge>No data yet</Badge>}</dd></div>
          </dl>
          {!v.hasAnalysis && <div className="mt-space-xl"><Btn onClick={() => setCurrentTab('analysis')}>Analyze battery health</Btn></div>}</>)}
      </Card>
    </div>
  );
}
