import React, { useEffect, useState } from 'react';
import { fetchDatasetsForVehicle } from '../api/datasetApi';
import useVehicleDetail from '../hooks/useVehicleDetail';
import { Card, Skeleton, PageHeader, EmptyState, Metric, Badge, Btn } from '../components/common/ui';
import { fmt, has } from '../utils/battery';
import ChargingMap from './ChargingMap';

const Tab = ({ id, cur, set, children }) => (
  <button
    role="tab"
    aria-selected={cur === id}
    onClick={() => set(id)}
    className={`px-4 h-9 rounded-lg text-body-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
      cur === id
        ? 'bg-primary text-on-primary shadow-2xs'
        : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
    }`}
  >
    {children}
  </button>
);

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
  const avg = (k) => {
    const a = sessions.map((s) => s[k]).filter(has);
    return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  };
  const energy = sessions.map((s) => s.energyKWh).filter(has).reduce((x, y) => x + y, 0);

  return (
    <div className="space-y-space-xl">
      <PageHeader
        title="Charging"
        subtitle="Your charging activity and nearby charging stations."
      />

      <div role="tablist" className="flex gap-2">
        <Tab id="sessions" cur={tab} set={setTab}>My charging</Tab>
        <Tab id="stations" cur={tab} set={setTab}>Find stations</Tab>
      </div>

      {tab === 'stations' ? (
        <ChargingMap />
      ) : (
        <>
          {/* Upload Selector Bar */}
          <div className="p-3.5 rounded-xl bg-surface-container-lowest border border-surface-container-highest/80 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
            <div className="flex flex-wrap items-center gap-2.5">
              <label htmlFor="upl" className="text-body-sm font-medium text-on-surface">
                Source Upload:
              </label>
              <select
                id="upl"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                disabled={!uploads.length}
                className="h-9 px-3 rounded-lg border border-surface-container-highest/90 bg-surface-container-low text-on-surface text-body-sm font-mono max-w-full focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {!uploads.length && <option value="">No analysed uploads</option>}
                {uploads.map((d) => (
                  <option key={d.id} value={d.id}>
                    {`${d.originalFileName} · ${d.uploadedAt ? new Date(d.uploadedAt).toLocaleString() : 'date unknown'}`}
                  </option>
                ))}
              </select>
              {uploadsState === 'error' && (
                <button type="button" onClick={loadUploads} className="text-body-sm text-error underline font-medium">
                  Could not load uploads. Retry
                </button>
              )}
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
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-semibold bg-surface-container-high hover:bg-surface-container-highest border border-surface-container-highest text-primary transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                <span>Download Charging Cycles ({sessions.length})</span>
              </button>
            )}
          </div>

          {/* KPI Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-space-base">
            <Metric
              label="Charging sessions"
              value={sessions.length ? fmt(sessions.length, 0) : null}
              source="Extracted"
              loading={loading}
              note={sessions.length ? null : 'Not enough data yet'}
            />
            <Metric
              label="Energy charged"
              value={sessions.length && energy ? fmt(energy) : null}
              unit="kWh"
              source="Calculated"
              loading={loading}
              note={sessions.length ? null : 'Not enough data yet'}
            />
            <Metric
              label="Average duration"
              value={sessions.length ? fmtDur(avg('durationMin')) : null}
              source="Derived"
              loading={loading}
              note={sessions.length ? null : 'Not enough data yet'}
            />
            <Metric
              label="Time spent charging"
              value={has(v?.timeShare?.chargePercent) ? fmt(v.timeShare.chargePercent) : null}
              unit="%"
              source="Measured"
              loading={loading}
              note="Of recorded time"
            />
          </div>

          {/* Sessions Table Card */}
          <Card
            title="Charging history"
            subtitle="Verified charging sessions extracted from telemetry where positive charging current was recorded."
          >
            {loading ? (
              <Skeleton className="h-40" />
            ) : !sessions.length ? (
              <EmptyState
                icon="ev_station"
                title="No verified charging sessions for this upload."
                text="Sessions appear when the selected upload contains charging data. Hover a status to see its warnings."
              />
            ) : (
              <>
                <div className="hidden md:block data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Cycle</th>
                        <th>Duration</th>
                        <th>Energy (est.)</th>
                        <th>Start SoC</th>
                        <th>End SoC</th>
                        <th>SoC change</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s, i) => (
                        <tr key={i}>
                          <td className="font-mono text-xs">{s.cycle ?? '—'}</td>
                          <td className="font-mono text-xs">{fmtDur(s.durationMin)}</td>
                          <td className="font-mono text-xs font-semibold text-on-surface">
                            {has(s.energyKWh) ? `${fmt(s.energyKWh)} kWh` : '—'}
                          </td>
                          <td className="font-mono text-xs">{has(s.startSoc) ? `${s.startSoc}%` : '—'}</td>
                          <td className="font-mono text-xs">{has(s.endSoc) ? `${s.endSoc}%` : '—'}</td>
                          <td className="font-mono text-xs font-semibold text-primary">
                            {has(s.socChange) ? `${s.socChange > 0 ? '+' : ''}${s.socChange}%` : '—'}
                          </td>
                          <td title={(s.warnings || []).join('; ')}>
                            <Badge tone={statusTone(s.status)}>
                              {s.status || 'Needs verification'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View */}
                <ul className="md:hidden space-y-3">
                  {sessions.map((s, i) => (
                    <li key={i} className="rounded-xl border border-surface-container-highest/80 bg-surface-container-low p-3.5 text-body-md space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-on-surface">
                          {s.cycle != null ? `Cycle ${s.cycle}` : 'Session'} · {fmtDur(s.durationMin)}
                        </span>
                        <Badge tone={statusTone(s.status)}>{s.status || 'Verified'}</Badge>
                      </div>
                      <div className="text-body-sm text-on-surface-variant font-mono">
                        {has(s.startSoc) && has(s.endSoc) ? `${s.startSoc}% → ${s.endSoc}%` : ''}
                        {has(s.energyKWh) ? ` · ${fmt(s.energyKWh)} kWh` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          {/* Charging Insights */}
          <Card title="Charging insights">
            {sessions.length ? (
              <ul className="text-body-md space-y-2 text-on-surface">
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[18px] text-primary mt-0.5">check_circle</span>
                  <span>{sessions.length} recorded sessions, averaging {fmtDur(avg('durationMin'))}.</span>
                </li>
                {sessions.some((s) => has(s.startSoc) && has(s.endSoc)) && (
                  <li className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-[18px] text-primary mt-0.5">check_circle</span>
                    <span>
                      On average each session added about{' '}
                      <strong>
                        {fmt(
                          sessions
                            .filter((s) => has(s.startSoc) && has(s.endSoc))
                            .reduce((a, s) => a + (s.endSoc - s.startSoc), 0) /
                            sessions.filter((s) => has(s.startSoc) && has(s.endSoc)).length,
                          0
                        )}
                        %
                      </strong>{' '}
                      charge.
                    </span>
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-body-md text-on-surface-variant">Not enough data yet.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
