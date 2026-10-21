import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import useVehicleDetail from '../hooks/useVehicleDetail';
import { Card, Badge, Skeleton, PageHeader, EmptyState, ErrorState, Btn } from '../components/common/ui';
import { apiRequest } from '../api/api';

const ANOMALY_FILTER_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'critical', label: 'Critical' },
  { id: 'voltage', label: 'Voltage' },
  { id: 'temperature', label: 'Thermal' },
  { id: 'current', label: 'Current' },
];

function getCategoryForType(type) {
  if (!type) return '';
  if (type === 'cell_imbalance' || type === 'cell_under_voltage' || type === 'under_voltage' || type === 'over_voltage' || type === 'pack_over_voltage' || type === 'voltage') return 'voltage';
  if (type === 'thermal_runaway_risk' || type === 'high_temperature' || type === 'sensor_fault' || type === 'thermal_gradient' || type === 'temperature') return 'temperature';
  if (type === 'high_discharge_current' || type === 'high_charge_current' || type === 'current') return 'current';
  return type;
}

export default function BatteryAnomalies() {
  const { vehicles, setCurrentTab, refreshVehicles } = useApp();
  const { vehicle: v, loading: vehicleLoading } = useVehicleDetail();

  const [selectedProfile, setSelectedProfile] = useState('generic_reference');
  const [anomalyData, setAnomalyData] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);


  const fetchAnomalies = async (profileId) => {
    if (!v?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest(`/vehicles/${v.id}/anomalies?profileId=${profileId}`);
      if (res?.success) {
        setAnomalyData(res.data);
      }
    } catch (err) {
      setError(err?.message || 'Failed to fetch telemetry anomalies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (v?.id) {
      fetchAnomalies(selectedProfile);
    }
  }, [v?.id, selectedProfile]);


  if (!vehicleLoading && !vehicles.length) {
    return (
      <div className="space-y-space-xl">
        <PageHeader title="Battery Telemetry Anomalies" />
        <Card>
          <EmptyState
            icon="directions_car"
            title="No vehicle found"
            text="Please add a vehicle profile first to evaluate telemetry anomalies."
            actionLabel="Go to Dashboard"
            onAction={() => setCurrentTab('dashboard')}
          />
        </Card>
      </div>
    );
  }

  const report = anomalyData?.anomalyReport;
  const profile = anomalyData?.profile;
  const datasetName = anomalyData?.datasetName;
  const isHealthy = report?.overallStatus === 'normal' || report?.unresolvedCount === 0;

  return (
    <div className="space-y-space-xl pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider mb-1">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
            <span>Safety & Diagnostic Engine</span>
            <span>/</span>
            <span className="text-primary font-semibold">Rule-Based Limits</span>
          </div>
          <PageHeader
            title="Battery Telemetry Anomalies"
            subtitle="Automated detection of cell voltage spread, thermal spikes, sensor disconnects, and current excursions."
          />
        </div>

        {/* Reference limits notice (no vehicle profiles: limits are generic and unverified) */}
        <div className="text-xs text-on-surface-variant bg-surface-container-low p-2 rounded-xl border border-surface-container-highest/60 max-w-sm">
          Screened against generic Li-ion reference limits, not your vehicle&apos;s manufacturer limits.
        </div>
      </div>

      {/* Upload lives only on the SOH & RUL page; this page shows results for the selected dataset */}
      <div className="p-space-lg rounded-2xl bg-surface-container-lowest border border-surface-container-highest/60 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm text-on-surface">
            {datasetName ? `Active telemetry: ${datasetName}` : 'No telemetry analysed yet'}
          </h3>
          <p className="text-xs text-on-surface-variant">
            To analyse a new CSV, upload it once on the SOH &amp; RUL page. Every eligible analysis, including these anomaly results, runs from that single upload.
          </p>
        </div>
        <button type="button" onClick={() => setCurrentTab('analysis')} className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-xs font-semibold bg-primary text-on-primary">
          <span className="material-symbols-outlined text-[16px]">upload_file</span>Go to SOH &amp; RUL upload
        </button>
      </div>

      {error && <ErrorState onRetry={() => fetchAnomalies(selectedProfile)} />}

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-base">
        <div className="bg-surface-container-lowest p-space-lg rounded-2xl border border-surface-container-highest/60 shadow-sm flex flex-col justify-between">
          <span className="font-label-sm text-label-sm uppercase font-semibold text-on-surface-variant">Overall Condition</span>
          <div className="my-2">
            <Badge tone={isHealthy ? 'healthy' : (report?.overallStatus === 'critical' ? 'critical' : 'attention')}>
              {isHealthy ? 'Nominal / Healthy' : `${report?.overallStatus?.toUpperCase()} STATUS`}
            </Badge>
          </div>
          <span className="text-[11px] text-on-surface-variant">
            {isHealthy ? 'All monitored parameters within safety bounds' : 'Parameters outside specified profile envelopes'}
          </span>
        </div>

        <div className="bg-surface-container-lowest p-space-lg rounded-2xl border border-surface-container-highest/60 shadow-sm flex flex-col justify-between">
          <span className="font-label-sm text-label-sm uppercase font-semibold text-on-surface-variant">Detected Excursions</span>
          <div className="my-2 flex items-baseline gap-1">
            <span className={`text-3xl font-bold font-mono ${isHealthy ? 'text-on-surface' : 'text-amber-600'}`}>
              {report?.unresolvedCount ?? 0}
            </span>
            <span className="text-xs font-semibold text-on-surface-variant uppercase">events</span>
          </div>
          <span className="text-[11px] text-on-surface-variant">
            Across {report?.totalRecordsAnalyzed ?? 0} telemetry records
          </span>
        </div>

        <div className="bg-surface-container-lowest p-space-lg rounded-2xl border border-surface-container-highest/60 shadow-sm flex flex-col justify-between">
          <span className="font-label-sm text-label-sm uppercase font-semibold text-on-surface-variant">Max Voltage Imbalance</span>
          <div className="my-2 flex items-baseline gap-1">
            <span className="text-3xl font-bold font-mono text-on-surface">
              {profile?.voltageLimits?.maxSpreadV ? `< ${profile.voltageLimits.maxSpreadV} V` : '—'}
            </span>
          </div>
          <span className="text-[11px] text-on-surface-variant">Allowed cell-to-cell spread</span>
        </div>

        <div className="bg-surface-container-lowest p-space-lg rounded-2xl border border-surface-container-highest/60 shadow-sm flex flex-col justify-between">
          <span className="font-label-sm text-label-sm uppercase font-semibold text-on-surface-variant">Max Thermal Delta</span>
          <div className="my-2 flex items-baseline gap-1">
            <span className="text-3xl font-bold font-mono text-on-surface">
              {profile?.tempLimitsC?.maxSpreadC ? `< ${profile.tempLimitsC.maxSpreadC} °C` : '—'}
            </span>
          </div>
          <span className="text-[11px] text-on-surface-variant">Allowed module temperature gradient</span>
        </div>
      </div>

      {/* Main Content: Grouped Findings & Specification Thresholds */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl">
        {/* Left Column: Grouped Anomaly Findings */}
        <div className="lg:col-span-7 flex flex-col gap-space-md">
          <Card
            title="Diagnosed Telemetry Anomalies"
            subtitle={`Evaluating telemetry against ${profile?.displayName || 'Vehicle Profile'}.`}
            action={
              <div className="flex items-center gap-1 overflow-x-auto">
                {ANOMALY_FILTER_CATEGORIES.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilterType(f.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                      filterType === f.id
                        ? 'bg-primary text-on-primary shadow-xs'
                        : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            }
          >
            {loading ? (
              <Skeleton className="h-48" />
            ) : (() => {
              const allGroups = report?.groupedAnomalies || [];
              const filteredGroups = allGroups.filter((g) => {
                if (filterType === 'all') return true;
                if (filterType === 'critical') return g.severity === 'critical';
                const cat = g.category || getCategoryForType(g.type);
                if (filterType === 'voltage') return cat === 'voltage';
                if (filterType === 'temperature') return cat === 'temperature';
                if (filterType === 'current') return cat === 'current';
                return true;
              });

              if (filteredGroups.length === 0) {
                return (
                  <div className="p-8 text-center flex flex-col items-center">
                    <span className="material-symbols-outlined text-primary text-4xl mb-2">verified_user</span>
                    <h4 className="font-semibold text-base text-on-surface">No Excursions in this Category</h4>
                    <p className="text-body-sm text-on-surface-variant max-w-md mt-1">
                      {filterType === 'all'
                        ? `All monitored telemetry values are strictly within normal operational bounds.`
                        : `No ${filterType} excursions were flagged in the active telemetry dataset.`}
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {filteredGroups.map((group, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-surface-container-highest/60 bg-surface-container-low/60 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`material-symbols-outlined text-[18px] ${group.severity === 'critical' ? 'text-error' : 'text-amber-600'}`}>
                          {group.severity === 'critical' ? 'error' : 'warning'}
                        </span>
                        <h4 className="font-semibold text-sm text-on-surface">{group.title}</h4>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-surface-container-highest text-on-surface">
                        {group.occurrences} {group.occurrences === 1 ? 'event' : 'events'}
                      </span>
                    </div>

                    <p className="text-xs text-on-surface-variant">
                      {group.sample?.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-surface-container-highest/40 text-[11px]">
                      <span className="font-semibold text-on-surface">Measured:</span>
                      <span className="font-mono text-primary font-bold">{group.sample?.measuredValue}</span>
                      <span className="text-outline">|</span>
                      <span className="font-semibold text-on-surface">Threshold:</span>
                      <span className="font-mono text-on-surface-variant">{group.sample?.threshold}</span>
                    </div>

                    <div className="mt-1 p-2 rounded-lg bg-surface-container-lowest/80 border border-surface-container-highest/40 text-[11px] text-on-surface-variant flex items-start gap-1.5">
                      <span className="material-symbols-outlined text-primary text-[15px] mt-0.5">lightbulb</span>
                      <span><strong>Recommendation:</strong> {group.sample?.recommendation}</span>
                    </div>
                  </div>
                ))}
                </div>
              );
            })()}
          </Card>
        </div>

        {/* Right Column: Specification Threshold Envelope */}
        <div className="lg:col-span-5 flex flex-col gap-space-md">
          <Card
            title="Profile Envelope Specifications"
            subtitle="Configured safety thresholds for the selected vehicle profile."
          >
            {loading ? (
              <Skeleton className="h-48" />
            ) : (
              <div className="space-y-3 text-body-sm">
                <div className="p-3 rounded-xl bg-surface-container-low border border-surface-container-highest/60">
                  <div className="font-semibold text-xs text-on-surface uppercase mb-1.5">Voltage Limits</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-on-surface-variant block">Cell Range:</span>
                      <span className="font-mono font-semibold text-on-surface">
                        {profile?.voltageLimits?.minCellV} V – {profile?.voltageLimits?.maxCellV} V
                      </span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant block">Max Imbalance:</span>
                      <span className="font-mono font-semibold text-on-surface">
                        {profile?.voltageLimits?.maxSpreadV} V
                      </span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant block">Pack Range:</span>
                      <span className="font-mono font-semibold text-on-surface">
                        {profile?.voltageLimits?.minPackV != null ? `${profile.voltageLimits.minPackV} V – ${profile.voltageLimits.maxPackV} V` : 'Not evaluated (no applicable limit)'}
                      </span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant block">Nominal Pack:</span>
                      <span className="font-mono font-semibold text-on-surface">
                        {profile?.nominalPackVoltageV != null ? `${profile.nominalPackVoltageV} V` : 'Not applicable'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-surface-container-low border border-surface-container-highest/60">
                  <div className="font-semibold text-xs text-on-surface uppercase mb-1.5">Thermal Envelope</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-on-surface-variant block">Operating Range:</span>
                      <span className="font-mono font-semibold text-on-surface">
                        {profile?.tempLimitsC?.minOperating} °C – {profile?.tempLimitsC?.maxOperating} °C
                      </span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant block">Thermal Warning:</span>
                      <span className="font-mono font-semibold text-amber-700">
                        &gt;= {profile?.tempLimitsC?.warningHigh} °C
                      </span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant block">Max Module Delta:</span>
                      <span className="font-mono font-semibold text-on-surface">
                        {profile?.tempLimitsC?.maxSpreadC} °C
                      </span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant block">Critical Cutoff:</span>
                      <span className="font-mono font-semibold text-error">
                        {profile?.tempLimitsC?.criticalHigh} °C
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-surface-container-low border border-surface-container-highest/60">
                  <div className="font-semibold text-xs text-on-surface uppercase mb-1.5">Current Envelope</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-on-surface-variant block">Max Discharge:</span>
                      <span className="font-mono font-semibold text-on-surface">
                        {profile?.currentLimitsA?.maxDischargeA != null ? `${profile.currentLimitsA.maxDischargeA} A` : 'Not evaluated (no applicable limit)'}
                      </span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant block">Max Fast Charge:</span>
                      <span className="font-mono font-semibold text-on-surface">
                        {profile?.currentLimitsA?.maxChargeA != null ? `${profile.currentLimitsA.maxChargeA} A` : 'Not evaluated (no applicable limit)'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
