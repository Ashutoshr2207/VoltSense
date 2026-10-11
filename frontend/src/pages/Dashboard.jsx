import { fetchDatasetsForVehicle } from '../api/datasetApi';
import React from 'react';
import { useApp } from '../context/AppContext';
import useVehicleDetail from '../hooks/useVehicleDetail';
import { Card, Badge, Skeleton, Metric, PageHeader, EmptyState, ErrorState, Btn } from '../components/common/ui';
import { fmt, has, healthLabel, tempLabel, greeting } from '../utils/battery';
import { formatRelativeTime } from '../utils/mappers';

export default function Dashboard() {
  const { currentUser, setCurrentTab, setIsAddVehicleModalOpen, vehicles } = useApp();
  const { vehicle: v, loading, error, retry } = useVehicleDetail();

  if (!loading && !vehicles.length) {
    return (
      <div className="space-y-space-xl">
        <PageHeader title={`${greeting()}${currentUser?.name ? `, ${currentUser.name.split(' ')[0]}` : ''}`} />
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
  const [dsList, setDsList] = React.useState([]);
  const [dsState, setDsState] = React.useState('loading');
  const loadDs = React.useCallback(() => {
    if (!v?.id) { setDsList([]); setDsState('ready'); return; }
    setDsState('loading');
    fetchDatasetsForVehicle(v.id).then((r) => { setDsList(r.datasets || []); setDsState('ready'); }).catch(() => setDsState('error'));
  }, [v?.id]);
  React.useEffect(() => { loadDs(); }, [loadDs]);
  const processedDs = dsList.filter((d) => d.status === 'processed');
  const latestDs = dsList[0] || null; // API returns newest first
  const latestReport = latestDs?.analysisReport || [];
  const partial = latestDs?.status === 'processed' && latestReport.some((a) => a.status === 'ineligible' || a.status === 'failed');
  const analysisStatus = dsState === 'error' ? { label: 'Could not load', tone: 'attention' }
    : !latestDs ? { label: 'No upload yet', tone: 'neutral' }
    : latestDs.status === 'failed' ? { label: 'Failed', tone: 'attention' }
    : latestDs.status === 'uploaded' || latestDs.status === 'processing' ? { label: 'Processing', tone: 'neutral' }
    : partial ? { label: 'Partially completed', tone: 'attention' }
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

      {/* Minimal & Elegant Metric Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-space-base">
        {/* Card 2: Successfully analysed uploads */}
        <div className="bg-surface-container-lowest p-space-lg rounded-2xl border border-surface-container-highest/60 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase font-semibold text-on-surface-variant">
              Analysed Uploads
            </span>
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">inventory_2</span>
          </div>
          <div className="my-3">
            <div className="flex items-baseline gap-1.5">
              <span className="font-headline-lg text-headline-lg font-bold font-mono text-on-surface">
                {analyzedUploadsCount}
              </span>
              <span className="text-xs font-semibold text-on-surface-variant uppercase">files</span>
            </div>
          </div>
          <span className="text-[11px] text-on-surface-variant">
            {analyzedUploadsCount > 0 ? 'Telemetry logs & captures processed' : 'No uploads processed yet'}
          </span>
        </div>

        {/* Card 3: Latest unresolved anomalies */}
        <div className="bg-surface-container-lowest p-space-lg rounded-2xl border border-surface-container-highest/60 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase font-semibold text-on-surface-variant">
              Unresolved Anomalies
            </span>
            <span className={`material-symbols-outlined text-[20px] ${unresolvedAnomalies > 0 ? 'text-amber-600' : 'text-primary'}`}>
              {unresolvedAnomalies > 0 ? 'warning' : 'verified_user'}
            </span>
          </div>
          <div className="my-3">
            <div className="flex items-baseline gap-1.5">
              <span className={`font-headline-lg text-headline-lg font-bold font-mono ${unresolvedAnomalies > 0 ? 'text-amber-700' : 'text-on-surface'}`}>
                {unresolvedAnomalies}
              </span>
              <span className="text-xs font-semibold text-on-surface-variant uppercase">events</span>
            </div>
          </div>
          <span className="text-[11px] text-on-surface-variant">
            {unresolvedAnomalies > 0 ? 'Excursions requiring attention' : anomalyRan ? 'No unresolved anomalies in analysed uploads' : 'Not evaluated: no eligible anomaly analysis has run'}
          </span>
        </div>

        {/* Card 4: Latest analysis status */}
        <div className="bg-surface-container-lowest p-space-lg rounded-2xl border border-surface-container-highest/60 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase font-semibold text-on-surface-variant">
              Analysis Status
            </span>
            <span className="material-symbols-outlined text-primary text-[20px]">sync_saved_locally</span>
          </div>
          <div className="my-3">
            <Badge tone={analysisStatus.tone}>{analysisStatus.label}</Badge>
          </div>
          <span className="text-[11px] text-on-surface-variant">
            {dsState === 'error' ? <button type="button" className="underline text-error" onClick={loadDs}>Retry</button> : latestDs ? `Latest upload: ${latestDs.originalFileName}` : 'Awaiting telemetry upload'}
          </span>
        </div>
      </div>

      {/* Latest Finding Banner & Core Answers Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl">
        {/* Latest Finding & What VoltSense Learned */}
        <div className="lg:col-span-8 flex flex-col gap-space-md">
          <Card
            title="Latest Telemetry Finding"
            subtitle="Automated review of recent pack voltage balance, temperatures, and charging cycles."
            action={
              hasAnalysis && (
                <Btn variant="secondary" onClick={() => setCurrentTab('anomalies')} className="text-xs">
                  Review Anomalies
                </Btn>
              )
            }
          >
            {loading ? (
              <Skeleton className="h-32" />
            ) : hasAnalysis ? (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-surface-container-low border border-surface-container-highest/60 flex items-start gap-3">
                  <span className={`material-symbols-outlined mt-0.5 text-[20px] ${unresolvedAnomalies > 0 ? 'text-amber-600' : 'text-primary'}`}>
                    {unresolvedAnomalies > 0 ? 'report_problem' : 'check_circle'}
                  </span>
                  <div>
                    <h4 className="font-semibold text-sm text-on-surface">
                      {latestFinding || (anomalyRan ? 'No anomalies detected against generic reference limits' : 'Anomaly analysis has not run for this vehicle')}
                    </h4>
                    <p className="text-body-sm text-on-surface-variant mt-1">
                      {unresolvedAnomalies > 0
                        ? 'Rule-based evaluation against generic Li-ion reference limits (not vehicle-specific) flagged readings. See SOH & RUL > Battery Telemetry Anomalies.'
                        : anomalyRan ? 'No readings exceeded the generic reference limits in the analysed uploads.' : 'Upload a CSV with voltage, temperature or current columns on the SOH & RUL page.'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
                  <div className="p-2.5 rounded-lg bg-surface-container-low/50 border border-surface-container-highest/40">
                    <span className="text-[11px] text-on-surface-variant block uppercase font-semibold">State of Health</span>
                    <span className="font-mono text-base font-bold text-on-surface">
                      {has(v?.soh) ? `${fmt(v?.soh, 1)}%` : 'Upload data'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface-container-low/50 border border-surface-container-highest/40">
                    <span className="text-[11px] text-on-surface-variant block uppercase font-semibold">State of Charge</span>
                    <span className="font-mono text-base font-bold text-on-surface">
                      {has(v?.soc) ? `${fmt(v?.soc, 0)}%` : (has(v?.latestSoc) ? `${fmt(v?.latestSoc, 0)}%` : 'Upload data')}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface-container-low/50 border border-surface-container-highest/40">
                    <span className="text-[11px] text-on-surface-variant block uppercase font-semibold">Remaining Cycles</span>
                    <span className="font-mono text-base font-bold text-on-surface">
                      {has(v?.rul) ? `${fmt(v?.rul, 0)} cyc` : 'Requires 7+ cyc'}
                    </span>
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
        </div>

        {/* Quick Actions & Navigation Hub */}
        <div className="lg:col-span-4 flex flex-col gap-space-md justify-between">
          <Card title="Quick Actions">
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setCurrentTab('analysis')}
                className="w-full p-3 rounded-xl bg-surface-container-low hover:bg-surface-container text-left border border-surface-container-highest/60 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-primary text-[20px]">battery_charging_full</span>
                  <div>
                    <span className="font-semibold text-sm text-on-surface block">SOH & Remaining Life</span>
                    <span className="text-[11px] text-on-surface-variant">Inspect battery health & 3D pack</span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant text-[18px]">chevron_right</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentTab('anomalies')}
                className="w-full p-3 rounded-xl bg-surface-container-low hover:bg-surface-container text-left border border-surface-container-highest/60 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-amber-600 text-[20px]">warning</span>
                  <div>
                    <span className="font-semibold text-sm text-on-surface block">Battery Anomalies</span>
                    <span className="text-[11px] text-on-surface-variant">Profile rules & telemetry health</span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant text-[18px]">chevron_right</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentTab('charging')}
                className="w-full p-3 rounded-xl bg-surface-container-low hover:bg-surface-container text-left border border-surface-container-highest/60 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-secondary text-[20px]">ev_station</span>
                  <div>
                    <span className="font-semibold text-sm text-on-surface block">Charging Stations</span>
                    <span className="text-[11px] text-on-surface-variant">Find nearby public chargers & directions</span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant text-[18px]">chevron_right</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentTab('insights')}
                className="w-full p-3 rounded-xl bg-surface-container-low hover:bg-surface-container text-left border border-surface-container-highest/60 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-primary text-[20px]">insights</span>
                  <div>
                    <span className="font-semibold text-sm text-on-surface block">Insight</span>
                    <span className="text-[11px] text-on-surface-variant">Diagnostics, timeline & AI explanations</span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant text-[18px]">chevron_right</span>
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
