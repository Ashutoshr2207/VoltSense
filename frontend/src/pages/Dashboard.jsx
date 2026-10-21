import { fetchDatasetsForVehicle } from '../api/datasetApi';
import React from 'react';
import { useApp } from '../context/AppContext';
import useVehicleDetail from '../hooks/useVehicleDetail';
import { Card, Badge, Skeleton, Metric, PageHeader, EmptyState, ErrorState, Btn } from '../components/common/ui';
import BatteryAssistant from '../components/dashboard/BatteryAssistant';
import VehicleBattery3D from '../components/dashboard/VehicleBattery3D';
import { fmt, has, healthLabel, tempLabel, greeting } from '../utils/battery';
import { formatRelativeTime } from '../utils/mappers';

export default function Dashboard() {
  const { currentUser, setCurrentTab, setIsAddVehicleModalOpen, vehicles, vehiclesError, refreshVehicles } = useApp();
  const { vehicle: v, loading, error, retry } = useVehicleDetail();

  // Hooks must run on every render, including before the first vehicle is created.
  const [dsList, setDsList] = React.useState([]);
  const [dsState, setDsState] = React.useState('loading');
  const loadDs = React.useCallback(() => {
    if (!v?.id) { setDsList([]); setDsState('ready'); return; }
    setDsState('loading');
    fetchDatasetsForVehicle(v.id).then((r) => { setDsList(r.datasets || []); setDsState('ready'); }).catch(() => setDsState('error'));
  }, [v?.id]);
  React.useEffect(() => { loadDs(); }, [loadDs]);

  if (!loading && !vehicles.length) {
    return (
      <div className="space-y-space-xl">
        <PageHeader title={`${greeting()}${currentUser?.name ? `, ${currentUser.name.split(' ')[0]}` : ''}`} />
        {vehiclesError && <ErrorState text={vehiclesError} onRetry={refreshVehicles} />}
        <Card>
          <EmptyState
            icon="directions_car"
            title="Add your vehicle to get started"
            text="Add a vehicle profile, then upload a telemetry CSV to monitor health, and anomalies."
            actionLabel="Add vehicle"
            onAction={() => setIsAddVehicleModalOpen(true)}
          />
        </Card>
      </div>
    );
  }

  // Counters come from the saved datasets of the selected vehicle (backend), never from constants.
  const processedDs = dsList.filter((d) => d.status === 'processed');
  const latestDs = dsList[0] || null; // API returns newest first
  const latestReport = latestDs?.analysisReport || [];
  const sohRulDone = latestReport.some((a) => a.id === 'soh' && a.status === 'completed') && latestReport.some((a) => a.id === 'rul' && a.status === 'completed');
  const ineligibles = latestReport.filter((a) => a.status === 'ineligible');
  const hasFailed = latestReport.some((a) => a.status === 'failed');
  const partial = latestDs?.status === 'processed' && (ineligibles.length > 0 || hasFailed);
  const analysisStatus = dsState === 'error' ? { label: 'Could not load', tone: 'attention' }
    : !latestDs ? { label: 'No upload yet', tone: 'neutral' }
    : latestDs.status === 'failed' || hasFailed ? { label: 'Failed', tone: 'attention' }
    : latestDs.status === 'uploaded' ? { label: 'Uploaded; not processed', tone: 'neutral' }
    : latestDs.status === 'processing' ? { label: 'Processing', tone: 'neutral' }
    : (partial && sohRulDone) ? { label: `SOH & RUL Ready (${ineligibles.map((a) => a.name.split('-')[0].trim()).join(', ')} skipped)`, tone: 'healthy' }
    : partial ? { label: `Partially completed (${ineligibles.map((a) => a.name).join(', ')} ineligible)`, tone: 'attention' }
    : { label: 'Completed', tone: 'healthy' };
  const hasAnalysis = processedDs.length > 0;
  const h = healthLabel(v?.soh);
  const tl = tempLabel(v?.tempAvg || v?.temperature);

  // Key dashboard metrics
  const analyzedUploadsCount = processedDs.length;
  const unresolvedAnomalies = processedDs.reduce((n, d) => n + (d.anomalies?.unresolvedCount || 0), 0);
  const anomalyRan = processedDs.some((d) => (d.analysisReport || []).some((a) => a.id === 'anomaly' && a.status === 'completed') || d.anomalies?.totalRecordsAnalyzed > 0);
  const latestFinding = v?.latestAnomalyFinding || null;
  const latestFindingAt = v?.latestAnomalyAt || v?.analysisAt;

  return (
    <div className="space-y-space-xl">
      {/* Welcome & Vehicle Context Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <PageHeader
          title={`${greeting()}${currentUser?.name ? `, ${currentUser.name.split(' ')[0]}` : ''}`}
          subtitle={
            loading
              ? 'Loading vehicle status…'
              : hasAnalysis
              ? `${v?.name || 'Vehicle profile'}: System operational — ${h.text}`
              : `${v?.name || 'Vehicle profile'}: Ready for first battery data upload.`
          }
          action={
            hasAnalysis && latestFindingAt && (
              <span className="text-body-sm text-on-surface-variant font-mono">
                Last analyzed {formatRelativeTime(latestFindingAt)}
              </span>
            )
          }
        />

        {/* Primary Ingestion Action */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <Btn
            variant="primary"
            onClick={() => setCurrentTab('analysis')}
            className="text-xs flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">battery_charging_full</span>
            Analyze Battery Health
          </Btn>
        </div>
      </div>

      {error && <ErrorState onRetry={retry} />}
      {vehiclesError && <ErrorState text={vehiclesError} onRetry={refreshVehicles} />}

      {/* Primary Telemetry & KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-base">
        {/* Card 1: State of Health */}
        <Metric 
          label="State of Health" 
          value={has(v?.soh) ? `${fmt(v?.soh, 1)}` : null} 
          unit="%" 
          tone={h.tone} 
          source="Empirical"
          note={has(v?.soh) ? h.label : 'Awaiting battery logs'} 
          loading={loading} 
        />

        {/* Card 2: Remaining Useful Life */}
        <Metric 
          label="Remaining Useful Life" 
          value={has(v?.rul) ? `${fmt(v?.rul, 0)}` : null} 
          unit="cycles" 
          tone={has(v?.rul) && v.rul < 100 ? 'warn' : 'good'} 
          source="Model (Exp.)"
          note={has(v?.rul) ? `To ${v?.eolThreshold || 80}% EOL threshold` : 'Requires 7+ cycle history'} 
          loading={loading} 
        />

        {/* Card 3: BMS State of Charge */}
        <Metric 
          label="BMS State of Charge" 
          value={has(v?.soc) ? `${fmt(v?.soc, 0)}` : (has(v?.latestSoc) ? `${fmt(v?.latestSoc, 0)}` : null)} 
          unit="%" 
          source="Measured"
          note={has(v?.soc) || has(v?.latestSoc) ? 'Latest telemetry capture' : 'Not recorded in stream'} 
          loading={loading} 
        />

        {/* Card 4: Unresolved Anomalies */}
        <div className="bg-surface-container-lowest p-space-base rounded-xl border border-surface-container-highest/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-body-sm font-medium text-on-surface-variant">Telemetry Anomalies</span>
            <span className={`w-2 h-2 rounded-full ${unresolvedAnomalies > 0 ? 'bg-amber-500' : 'bg-primary-container'}`} />
          </div>
          <div className="my-1.5 flex items-baseline gap-1.5">
            <span className={`text-[28px] leading-tight font-bold font-mono ${unresolvedAnomalies > 0 ? 'text-amber-700' : 'text-on-surface'}`}>
              {unresolvedAnomalies}
            </span>
            <span className="text-body-sm text-on-surface-variant font-sans font-normal">events</span>
          </div>
          <span className="text-body-sm text-on-surface-variant">
            {unresolvedAnomalies > 0 ? 'Requires engineering review' : anomalyRan ? 'No rule excursions detected' : 'Not evaluated'}
          </span>
        </div>
      </div>

      {/* Main Analysis and Action Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl">
        {/* Left Column: Diagnostics & Recent Datasets */}
        <div className="lg:col-span-8 flex flex-col gap-space-xl">
          {/* Latest Telemetry Finding Card */}
          <Card
            title="Latest Telemetry Finding"
            subtitle="Automated screening of pack voltage balance, temperatures, and charging cycles."
            action={
              hasAnalysis && (
                <Btn variant="secondary" size="sm" onClick={() => setCurrentTab('anomalies')}>
                  Review Anomalies
                </Btn>
              )
            }
          >
            {loading ? (
              <Skeleton className="h-32" />
            ) : hasAnalysis ? (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-surface-container-low border border-surface-container-highest/80 flex items-start gap-3">
                  <span className={`material-symbols-outlined mt-0.5 text-[22px] shrink-0 ${unresolvedAnomalies > 0 ? 'text-amber-600' : 'text-primary'}`}>
                    {unresolvedAnomalies > 0 ? 'report_problem' : 'verified_user'}
                  </span>
                  <div>
                    <h4 className="font-semibold text-body-md text-on-surface">
                      {latestFinding || (anomalyRan ? 'No anomalies detected against generic reference limits' : 'Anomaly analysis has not run for this vehicle')}
                    </h4>
                    <p className="text-body-sm text-on-surface-variant mt-1 leading-relaxed">
                      {unresolvedAnomalies > 0
                        ? 'Rule-based evaluation against generic Li-ion reference limits (not vehicle-specific) flagged readings. See SOH & RUL > Battery Telemetry Anomalies.'
                        : anomalyRan ? 'No readings exceeded the generic reference limits in the analysed uploads.' : 'Upload a CSV with voltage, temperature or current columns on the SOH & RUL page.'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-lg bg-surface-container-low border border-surface-container-highest/60">
                    <span className="text-[11px] text-on-surface-variant block uppercase font-mono font-semibold">Source Pack</span>
                    <span className="text-sm font-semibold text-on-surface truncate block mt-0.5">
                      {v?.name || 'EV Battery'}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-surface-container-low border border-surface-container-highest/60">
                    <span className="text-[11px] text-on-surface-variant block uppercase font-mono font-semibold">Mean Pack Temp</span>
                    <span className="font-mono text-sm font-bold text-on-surface block mt-0.5">
                      {has(v?.tempAvg || v?.temperature) ? `${fmt(v?.tempAvg || v?.temperature, 1)}°C` : 'Not recorded'}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-surface-container-low border border-surface-container-highest/60">
                    <span className="text-[11px] text-on-surface-variant block uppercase font-mono font-semibold">Pipeline Status</span>
                    <div className="mt-0.5">
                      <Badge tone={analysisStatus.tone}>{analysisStatus.label}</Badge>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                icon="battery_charging_full"
                title="No battery analysis yet"
                text="Upload an authentic battery telemetry CSV to start automated diagnostics and SOH/RUL evaluation."
                actionLabel="Analyze Battery Health"
                onAction={() => setCurrentTab('analysis')}
              />
            )}
          </Card>

          {/* Recent Ingestion History Table */}
          {hasAnalysis && (
            <Card
              title="Recent Telemetry Datasets"
              subtitle="Processed files and cycle captures associated with this vehicle."
              action={
                <span className="text-xs font-mono text-on-surface-variant">
                  {analyzedUploadsCount} total {analyzedUploadsCount === 1 ? 'file' : 'files'}
                </span>
              }
            >
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Dataset Name</th>
                      <th>Records</th>
                      <th>Discharge Cycles</th>
                      <th>Status</th>
                      <th>Uploaded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dsList.slice(0, 5).map((d) => (
                      <tr key={d.id}>
                        <td className="font-mono text-xs font-semibold text-on-surface truncate max-w-[200px]">
                          {d.originalFileName}
                        </td>
                        <td className="font-mono text-xs text-on-surface-variant">
                          {d.recordCount ? fmt(d.recordCount, 0) : '—'}
                        </td>
                        <td className="font-mono text-xs text-on-surface-variant">
                          {d.cycleCount ? fmt(d.cycleCount, 0) : '—'}
                        </td>
                        <td>
                          <Badge tone={d.status === 'processed' ? 'good' : d.status === 'failed' ? 'bad' : 'neutral'}>
                            {d.status}
                          </Badge>
                        </td>
                        <td className="font-mono text-xs text-on-surface-variant">
                          {formatRelativeTime(d.uploadedAt || d.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: 3D Pack Monitor, Quick Navigation Hub & Advisory Assistant */}
        <div className="lg:col-span-4 flex flex-col gap-space-xl">
          {/* 3D X-Ray Pack Monitor */}
          <Card 
            title="3D Battery Pack Monitor" 
            subtitle={has(v?.soh) ? `${v?.name || 'EV Pack'} · ${fmt(v?.soh, 1)}% SOH` : 'Interactive skateboard architecture'}
          >
            <VehicleBattery3D 
              soh={typeof v?.soh === 'number' ? v.soh : null} 
              height="h-[210px]" 
            />
          </Card>

          <Card title="Quick Actions" subtitle="Navigate battery analytics modules.">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setCurrentTab('analysis')}
                className="w-full p-3 rounded-xl bg-surface-container-low hover:bg-surface-container text-left border border-surface-container-highest/80 flex items-center justify-between transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-surface-container-lowest text-primary shadow-2xs border border-surface-container-highest/60">
                    <span className="material-symbols-outlined text-[20px]">battery_charging_full</span>
                  </div>
                  <div>
                    <span className="font-semibold text-body-sm text-on-surface block group-hover:text-primary transition-colors">SOH & Remaining Life</span>
                    <span className="text-[11px] text-on-surface-variant">Inspect battery health & 3D pack</span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant text-[18px] group-hover:translate-x-0.5 transition-transform">chevron_right</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentTab('anomalies')}
                className="w-full p-3 rounded-xl bg-surface-container-low hover:bg-surface-container text-left border border-surface-container-highest/80 flex items-center justify-between transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-surface-container-lowest text-amber-600 shadow-2xs border border-surface-container-highest/60">
                    <span className="material-symbols-outlined text-[20px]">warning</span>
                  </div>
                  <div>
                    <span className="font-semibold text-body-sm text-on-surface block group-hover:text-primary transition-colors">Battery Anomalies</span>
                    <span className="text-[11px] text-on-surface-variant">Screen cell spread & thermal spikes</span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant text-[18px] group-hover:translate-x-0.5 transition-transform">chevron_right</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentTab('charging')}
                className="w-full p-3 rounded-xl bg-surface-container-low hover:bg-surface-container text-left border border-surface-container-highest/80 flex items-center justify-between transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-surface-container-lowest text-secondary shadow-2xs border border-surface-container-highest/60">
                    <span className="material-symbols-outlined text-[20px]">ev_station</span>
                  </div>
                  <div>
                    <span className="font-semibold text-body-sm text-on-surface block group-hover:text-primary transition-colors">Charging & Telemetry</span>
                    <span className="text-[11px] text-on-surface-variant">Verified sessions & public map</span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant text-[18px] group-hover:translate-x-0.5 transition-transform">chevron_right</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentTab('insights')}
                className="w-full p-3 rounded-xl bg-surface-container-low hover:bg-surface-container text-left border border-surface-container-highest/80 flex items-center justify-between transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-surface-container-lowest text-primary shadow-2xs border border-surface-container-highest/60">
                    <span className="material-symbols-outlined text-[20px]">insights</span>
                  </div>
                  <div>
                    <span className="font-semibold text-body-sm text-on-surface block group-hover:text-primary transition-colors">Multi-Cycle Insights</span>
                    <span className="text-[11px] text-on-surface-variant">Degradation timeline & explanations</span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant text-[18px] group-hover:translate-x-0.5 transition-transform">chevron_right</span>
              </button>
            </div>
          </Card>

          {/* Diagnostic Assistant based on real metrics */}
          <BatteryAssistant vehicle={v} />
        </div>
      </div>
    </div>
  );
}
