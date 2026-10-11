import React, { useEffect, useState } from 'react';
import { fetchDatasetsForVehicle } from '../api/datasetApi';
import useVehicleDetail from '../hooks/useVehicleDetail';
import { Card, Skeleton, PageHeader, EmptyState, Metric, Badge } from '../components/common/ui';
import { fmt, has } from '../utils/battery';
import ChargingMap from './ChargingMap';

const Tab = ({ id, cur, set, children }) => (
  <button role="tab" aria-selected={cur === id} onClick={() => set(id)} className={`px-4 h-10 rounded-lg text-body-md font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${cur === id ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface hover:bg-surface-container-high'}`}>{children}</button>);

const fmtDur = (m) => (has(m) ? (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`) : '—');

export default function Charging() {
  const [tab, setTab] = useState('sessions');
  const { vehicle: v, loading } = useVehicleDetail();
  const [uploads, setUploads] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [uploadsState, setUploadsState] = useState('loading');
  const loadUploads = () => {
    if (!v?.id) return;
    setUploadsState('loading');
    fetchDatasetsForVehicle(v.id)
      .then((r) => {
        const list = (r.datasets || []).filter((d) => d.status === 'processed' || (d.chargingSessions || []).length > 0);
        setUploads(list);
        setSelectedId((cur) => (list.some((d) => d.id === cur) ? cur : list[0]?.id || ''));
        setUploadsState('ready');
      })
      .catch(() => setUploadsState('error'));
  };
  useEffect(loadUploads, [v?.id]);
  const selected = uploads.find((d) => d.id === selectedId);
  const sessions = selected?.chargingSessions || [];
  const statusTone = (st) => (st === 'Complete' ? 'good' : st === 'Insufficient data' ? 'bad' : 'warn');
  const avg = (k) => { const a = sessions.map((s) => s[k]).filter(has); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; };
  const energy = sessions.map((s) => s.energyKWh).filter(has).reduce((x, y) => x + y, 0);
  return (
    <div className="space-y-space-xl">
      <PageHeader title="Charging" subtitle="Your charging activity and nearby charging stations." />
      <div role="tablist" className="flex gap-2"><Tab id="sessions" cur={tab} set={setTab}>My charging</Tab><Tab id="stations" cur={tab} set={setTab}>Find stations</Tab></div>
      {tab === 'stations' ? <ChargingMap /> : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="upl" className="text-body-sm text-on-surface-variant">Upload</label>
              <select id="upl" value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={!uploads.length}
                className="h-10 px-3 rounded-lg border border-outline-variant bg-surface-container-lowest text-body-md max-w-full">
                {!uploads.length && <option value="">No analysed uploads</option>}
                {uploads.map((d) => <option key={d.id} value={d.id}>{`${d.originalFileName} · ${d.uploadedAt ? new Date(d.uploadedAt).toLocaleString() : 'date unknown'}`}</option>)}
              </select>
              {uploadsState === 'error' && <button onClick={loadUploads} className="text-body-sm text-error underline">Could not load uploads. Retry</button>}
            </div>

            {sessions.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const headers = ['Session ID', 'Cycle', 'Start Time (s)', 'End Time (s)', 'Duration (min)', 'Start SoC (%)', 'End SoC (%)', 'SoC Change (%)', 'Energy (kWh)', 'Energy Basis', 'Status', 'Data Quality Warnings'];
                  const rows = sessions.map((s, idx) => [
                    `CHG-${selectedId ? selectedId.slice(-6) : 'SESS'}-${idx + 1}`,
                    s.cycle ?? '',
                    s.startTime ?? '',
                    s.endTime ?? '',
                    s.durationMin ?? '',
                    s.startSoc ?? '',
                    s.endSoc ?? '',
                    s.socChange ?? '',
                    s.energyKWh ?? '',
                    `"${(s.energyBasis || '').replace(/"/g, '""')}"`,
                    `"${(s.status || '').replace(/"/g, '""')}"`,
                    `"${(s.warnings || []).join('; ').replace(/"/g, '""')}"`
                  ]);
                  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
                  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `charging-sessions-${selected?.originalFileName ? selected.originalFileName.replace(/[^a-zA-Z0-9_-]/g, '_') : 'export'}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 h-10 rounded-lg text-body-sm font-semibold bg-surface-container-high hover:bg-surface-container-highest border border-surface-container-highest text-primary transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">download</span>
                <span>Download Charging Cycles ({sessions.length})</span>
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-space-base">
            <Metric label="Charging sessions" value={sessions.length ? fmt(sessions.length, 0) : null} loading={loading} note={sessions.length ? null : 'Not enough data yet'} />
            <Metric label="Energy charged" value={sessions.length && energy ? fmt(energy) : null} unit="kWh" loading={loading} note={sessions.length ? null : 'Not enough data yet'} />
            <Metric label="Average duration" value={sessions.length ? fmtDur(avg('durationMin')) : null} loading={loading} note={sessions.length ? null : 'Not enough data yet'} />
            <Metric label="Time spent charging" value={has(v?.timeShare?.chargePercent) ? fmt(v.timeShare.chargePercent) : null} unit="%" loading={loading} note="Of recorded time" />
          </div>
          <Card title="Charging history">
            {loading ? <Skeleton className="h-40" /> : !sessions.length ? <EmptyState icon="ev_station" title="No verified charging sessions for this upload." text="Sessions appear when the selected upload contains charging data. Hover a status to see its warnings." /> : (
              <>
                <div className="hidden md:block overflow-x-auto"><table className="w-full text-body-md">
                  <thead><tr className="text-left text-body-sm text-on-surface-variant">{['Cycle', 'Duration', 'Energy (est.)', 'Start SoC', 'End SoC', 'SoC change', 'Status'].map((h) => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}</tr></thead>
                  <tbody>{sessions.map((s, i) => (<tr key={i} className="border-t border-surface-container-highest/60">
                    <td className="py-2 pr-3">{s.cycle ?? '—'}</td><td className="pr-3">{fmtDur(s.durationMin)}</td>
                    <td className="pr-3">{has(s.energyKWh) ? `${fmt(s.energyKWh)} kWh` : '—'}</td><td className="pr-3">{has(s.startSoc) ? `${s.startSoc}%` : '—'}</td><td className="pr-3">{has(s.endSoc) ? `${s.endSoc}%` : '—'}</td><td className="pr-3">{has(s.socChange) ? `${s.socChange > 0 ? '+' : ''}${s.socChange}%` : '—'}</td><td title={(s.warnings || []).join('; ')}><Badge tone={statusTone(s.status)}>{s.status || 'Needs verification'}</Badge></td></tr>))}</tbody></table></div>
                <ul className="md:hidden space-y-3">{sessions.map((s, i) => (<li key={i} className="rounded-xl border border-surface-container-highest/60 p-3 text-body-md">
                  <div className="font-medium">{s.cycle != null ? `Cycle ${s.cycle}` : 'Session'} · {fmtDur(s.durationMin)}</div>
                  <div className="text-on-surface-variant">{has(s.startSoc) && has(s.endSoc) ? `${s.startSoc}% → ${s.endSoc}%` : ''} {has(s.energyKWh) ? `· ${fmt(s.energyKWh)} kWh` : ''}</div></li>))}</ul>
              </>)}
          </Card>
          <Card title="Charging insights">
            {sessions.length ? <ul className="text-body-md space-y-1"><li>{sessions.length} recorded sessions, averaging {fmtDur(avg('durationMin'))}.</li>{sessions.some((s) => has(s.startSoc) && has(s.endSoc)) && <li>On average each session added about {fmt(sessions.filter((s) => has(s.startSoc) && has(s.endSoc)).reduce((a, s) => a + (s.endSoc - s.startSoc), 0) / sessions.filter((s) => has(s.startSoc) && has(s.endSoc)).length, 0)}% charge.</li>}</ul> : <p className="text-body-md text-on-surface-variant">Not enough data yet.</p>}
          </Card>
        </>)}
    </div>
  );
}
