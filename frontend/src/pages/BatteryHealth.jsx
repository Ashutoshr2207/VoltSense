import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import useVehicleDetail from '../hooks/useVehicleDetail';
import { fetchPredictionsForVehicle } from '../api/predictionApi';
import { Card, Badge, Skeleton, Metric, PageHeader, EmptyState, ErrorState, Explain, Btn } from '../components/common/ui';
import BatterySpeedometer from '../components/dashboard/BatterySpeedometer';
import { BatteryHealthMeter, BatteryEventTimeline } from '../components/dashboard/BatteryHealthMeter';
import DigitalTwinHealthChart from '../components/charts/DigitalTwinHealthChart';
import { fmt, has, healthLabel, tempLabel } from '../utils/battery';
import { buildInsights, avgTemp } from '../utils/insights';

export default function BatteryHealth() {
  const { setCurrentTab, predictions, setIsAddVehicleModalOpen } = useApp();
  const { vehicle: v, loading, error, retry } = useVehicleDetail();
  const [activeView, setActiveView] = useState('overview'); // 'overview' | 'detailed'
  const [vehiclePredictions, setVehiclePredictions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadVehicleHistory = useCallback(async (vehicleId) => {
    if (!vehicleId) {
      setVehiclePredictions([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const res = await fetchPredictionsForVehicle(vehicleId, { pageSize: 20, sortOrder: 'desc' });
      setVehiclePredictions(res?.predictions || []);
    } catch (err) {
      console.warn('Failed to fetch prediction history for vehicle:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVehicleHistory(v?.id);
  }, [v?.id, loadVehicleHistory]);

  const h = healthLabel(v?.soh);
  const ins = buildInsights(v);
  const t = avgTemp(v);

  const capLoss = has(v?.referenceCapacityAh) && has(v?.currentCapacityAh)
    ? v.currentCapacityAh - v.referenceCapacityAh
    : null;

  // Merge all available prediction sources for this vehicle
  const allPreds = useMemo(() => {
    const list = [...vehiclePredictions];
    const appPreds = (predictions || []).filter((p) => p.vehicleId === v?.id);
    for (const ap of appPreds) {
      const apId = ap.id || ap._id;
      if (!list.some((lp) => (lp.id && lp.id === apId) || (lp._id && lp._id === apId))) {
        list.push(ap);
      }
    }
    list.sort((a, b) => {
      const timeA = new Date(a.measurementDate || a.prediction?.measurementDate || a.createdAt || a.uploadTimestampRaw || 0).getTime();
      const timeB = new Date(b.measurementDate || b.prediction?.measurementDate || b.createdAt || b.uploadTimestampRaw || 0).getTime();
      return timeB - timeA;
    });
    return list;
  }, [vehiclePredictions, predictions, v?.id]);

  const evaluationEvents = useMemo(() => {
    const seenKeys = new Set();
    const events = [];
    for (const p of allPreds) {
      const cycle = p.prediction?.currentCycle || p.currentCycle;
      const key = p.id || p._id || `cycle_${cycle}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const mDate = p.measurementDate || p.prediction?.measurementDate;
      const uDate = p.uploadTimestampRaw || p.createdAt;
      const mFormatted = mDate ? new Date(mDate).toLocaleDateString() : null;
      const uFormatted = uDate ? new Date(uDate).toLocaleDateString() : null;
      const sohVal = p.prediction?.soh ?? p.soh ?? p.prediction?.measuredSoh ?? p.measuredSoh;
      const capVal = p.prediction?.currentCapacityAh ?? p.currentCapacityAh;

      events.push({
        cycle: cycle || 1,
        soh: typeof sohVal === 'number' ? Number(sohVal.toFixed(1)) : sohVal,
        capacity: typeof capVal === 'number' ? Number(capVal.toFixed(2)) : capVal,
        date: mFormatted ? `Measured: ${mFormatted}` : (uFormatted ? `Uploaded: ${uFormatted}` : 'Recorded Cycle'),
        measurementDate: mFormatted,
        uploadDate: uFormatted,
        title: `Cycle ${cycle || 1} Assessment`,
      });
    }
    return events;
  }, [allPreds]);

  // Derive historical milestone checkpoints from the degradation sequence if available
  const cycleMilestones = useMemo(() => {
    const cycles = v?.cycleTable || [];
    const refCap = v?.referenceCapacityAh || (cycles[0]?.capacity > 0 ? cycles[0].capacity : null);
    const milestones = [];
    if (cycles.length > 1 && refCap) {
      const stepCount = Math.min(4, cycles.length - 1);
      const indices = [];
      for (let s = 0; s < stepCount; s++) {
        const idx = Math.round((s / stepCount) * (cycles.length - 2));
        if (!indices.includes(idx)) indices.push(idx);
      }
      indices.sort((a, b) => b - a);
      for (const idx of indices) {
        const c = cycles[idx];
        if (!c || !c.capacity) continue;
        const cSoh = Number(((c.capacity / refCap) * 100).toFixed(1));
        const cDate = c.date ? new Date(c.date).toLocaleDateString() : null;
        milestones.push({
          cycle: c.cycle,
          soh: cSoh,
          capacity: Number(c.capacity.toFixed(2)),
          date: cDate ? `Measured: ${cDate}` : `Cycle ${c.cycle} Checkpoint`,
          measurementDate: cDate,
          uploadDate: null,
          title: c.cycle === 1 ? 'Cycle 1 Initial Baseline' : `Cycle ${c.cycle} Checkpoint`,
        });
      }
    }
    return milestones;
  }, [v?.cycleTable, v?.referenceCapacityAh]);

  const timelineEvents = useMemo(() => {
    if (evaluationEvents.length > 1) {
      return evaluationEvents.slice(0, 10);
    } else if (evaluationEvents.length === 1) {
      return [evaluationEvents[0], ...cycleMilestones].slice(0, 10);
    } else if (v?.hasAnalysis && v?.soh != null) {
      const latestEvent = {
        cycle: v.cycles || 1,
        soh: typeof v.soh === 'number' ? Number(v.soh.toFixed(1)) : v.soh,
        capacity: typeof v.currentCapacityAh === 'number' ? Number(v.currentCapacityAh.toFixed(2)) : v.currentCapacityAh,
        date: v.lastReportDate || 'Latest Evaluation',
        measurementDate: v.measurementDate ? new Date(v.measurementDate).toLocaleDateString() : null,
        uploadDate: v.lastReportDate,
        title: `Cycle ${v.cycles || 1} Assessment`,
      };
      return [latestEvent, ...cycleMilestones].slice(0, 10);
    }
    return [];
  }, [evaluationEvents, cycleMilestones, v]);



  // Digital Twin Historical Telemetry Series (Longitudinal multi-upload tracking)
  const digitalTwinHistoricalData = useMemo(() => {
    const cycles = v?.cycleTable || [];
    const refCap = v?.referenceCapacityAh || (cycles[0]?.capacity > 0 ? cycles[0].capacity : 210);
    if (cycles.length > 0) {
      return cycles.map((c) => ({
        cycle: c.cycle,
        soh: Number(((c.capacity / refCap) * 100).toFixed(2)),
        capacity: Number(c.capacity.toFixed(2)),
        date: c.date ? new Date(c.date).toLocaleDateString() : `Cycle ${c.cycle}`,
      }));
    }
    if (evaluationEvents.length > 0) {
      return evaluationEvents.map((e) => ({
        cycle: e.cycle,
        soh: e.soh,
        capacity: e.capacity,
        date: e.date,
      }));
    }
    if (v?.soh != null) {
      return [{
        cycle: v.cycles || 1,
        soh: Number(v.soh.toFixed(2)),
        capacity: v.currentCapacityAh ? Number(v.currentCapacityAh.toFixed(2)) : 205,
        date: v.lastReportDate || 'Current Assessment',
      }];
    }
    return [];
  }, [v, evaluationEvents]);

  // Digital Twin Lifespan Projection Series
  const digitalTwinPredictedData = useMemo(() => {
    if (v?.degradation?.predicted && v.degradation.predicted.length > 0) {
      return v.degradation.predicted.map((p) => ({
        cycle: p.cycle,
        soh: Number(p.soh.toFixed(2)),
      }));
    }
    const curCycle = v?.cycles || (digitalTwinHistoricalData[digitalTwinHistoricalData.length - 1]?.cycle || 1);
    const curSoh = v?.soh ?? (digitalTwinHistoricalData[digitalTwinHistoricalData.length - 1]?.soh ?? 98.5);
    const targetEol = v?.eolThreshold || 80.0;
    const rul = v?.rul || 350;
    const pts = [];
    const steps = 15;
    for (let i = 1; i <= steps; i++) {
      const cyc = Math.round(curCycle + (i / steps) * rul);
      const sohVal = Number(Math.max(targetEol, curSoh - (i / steps) * (curSoh - targetEol)).toFixed(2));
      pts.push({ cycle: cyc, soh: sohVal });
    }
    return pts;
  }, [v, digitalTwinHistoricalData]);


  if (!loading && !v?.id) {
    return (
      <div className="space-y-space-xl pb-16">
        <PageHeader title="SOH & Remaining Useful Life" />
        <Card>
          <EmptyState
            title="Add a vehicle before uploading"
            text="Create your vehicle profile, then select a battery dataset."
            actionLabel="Add vehicle"
            onAction={() => setIsAddVehicleModalOpen(true)}
          />
        </Card>
      </div>
    );
  }

  if (!loading && !v?.hasAnalysis) {
    return (
      <div className="space-y-space-xl pb-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-on-surface-variant font-mono text-[11px] uppercase tracking-wider mb-1">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse"></span>
              <span>Degradation & Lifespan Intelligence</span>
              <span>/</span>
              <span className="text-primary font-semibold">Random Forest & Gradient Boosting</span>
            </div>
            <PageHeader
              title="SOH & Remaining Useful Life"
              subtitle="State of Health, remaining discharge cycles to 80% EOL, and electrochemical degradation curves."
            />
          </div>

          <div className="flex items-center gap-2">
            <Btn
              variant="secondary"
              size="sm"
              onClick={() => setCurrentTab('anomalies')}
              className="flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px] text-amber-600">warning</span>
              Inspect Anomalies
            </Btn>
            <Btn
              size="sm"
              onClick={() => setCurrentTab('ingestion')}
              className="flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">upload_file</span>
              Ingest Telemetry CSV
            </Btn>
          </div>
        </div>

        {error && <ErrorState onRetry={retry} />}

        <Card>
          <div className="py-10 text-center flex flex-col items-center max-w-lg mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-[36px]">battery_charging_full</span>
            </div>
            <h3 className="text-xl font-bold text-on-surface mb-2">No Battery Analysis Available Yet</h3>
            <p className="text-sm text-on-surface-variant leading-relaxed mb-6">
              To calculate measured State of Health (SOH), Remaining Useful Life (RUL) projections, and electrochemical curves, upload your vehicle telemetry CSV on the new dedicated Data Ingestion page.
            </p>
            <Btn onClick={() => setCurrentTab('ingestion')} className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">upload_file</span>
              <span>Go to Dataset Ingestion</span>
            </Btn>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-space-xl pb-16">
      {/* Page Header with Dual View Switcher */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-on-surface-variant font-mono text-[11px] uppercase tracking-wider mb-1">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse"></span>
            <span>Degradation & Lifespan Intelligence</span>
            <span>/</span>
            <span className="text-primary font-semibold">Dual View Analytics</span>
          </div>
          <PageHeader
            title="SOH & Remaining Useful Life"
            subtitle="Understand your battery health through an intuitive speedometer or detailed engineering graphs."
          />
        </div>

        {/* View Switcher: Simple Overview vs Detailed Graphs */}
        <div className="flex items-center gap-1.5 p-1.5 bg-surface-container-low rounded-xl border border-surface-container-highest/80 self-start md:self-auto shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveView('overview')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeView === 'overview'
                ? 'bg-primary text-on-primary shadow-xs font-bold'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">speed</span>
            <span>Simple Overview</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('detailed')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeView === 'detailed'
                ? 'bg-primary text-on-primary shadow-xs font-bold'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">analytics</span>
            <span>Detailed Graphs</span>
          </button>
        </div>
      </div>

      {error && <ErrorState onRetry={retry} />}

      {/* VIEW 1: SIMPLE SPEEDOMETER OVERVIEW */}
      {activeView === 'overview' && (
        <div className="space-y-space-xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">
            {/* Speedometer Gauge */}
            <div className="lg:col-span-7">
              <BatterySpeedometer
                soh={v?.soh}
                rul={v?.rul}
                temp={avgTemp(v)}
                eolThreshold={v?.eolThreshold || 80}
              />
            </div>

            {/* Verdict and Plain English Guidelines */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <Card
                title="Battery Health Verdict"
                subtitle="Plain-language status for everyday EV owners"
              >
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-surface-container-low border border-surface-container-highest/80">
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-on-surface-variant block mb-1">
                      Condition Summary
                    </span>
                    <p className="text-sm font-medium text-on-surface leading-relaxed">
                      {h.text}
                    </p>
                  </div>

                  <div className="space-y-2 text-xs text-on-surface-variant">
                    <div className="flex items-start gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1 shrink-0" />
                      <span><strong>Green (80%–100%): Good</strong> — Battery is in prime operating health.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mt-1 shrink-0" />
                      <span><strong>Yellow (70%–79%): Fine</strong> — Moderate aging. Range is slightly reduced.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 mt-1 shrink-0" />
                      <span><strong>Red (&lt;70%): Bad</strong> — Critical fade. Approaching or past replacement mark.</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-surface-container-highest/60 flex items-center justify-between">
                    <span className="text-xs text-on-surface-variant">Looking for cycle curves?</span>
                    <button
                      type="button"
                      onClick={() => setActiveView('detailed')}
                      className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>View Engineering Graphs</span>
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </button>
                  </div>
                </div>
              </Card>

              {/* Everyday Battery Care Card */}
              <Card title="Everyday Battery Care">
                <ul className="space-y-2.5 text-xs text-on-surface">
                  <li className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">bolt</span>
                    <span>Keep daily state of charge between <strong>20% and 80%</strong> for longest lifespan.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-amber-600 text-[18px] shrink-0 mt-0.5">wb_sunny</span>
                    <span>Avoid leaving your vehicle fully charged (100%) under direct hot sunlight.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-emerald-600 text-[18px] shrink-0 mt-0.5">battery_charging_full</span>
                    <span>Prefer AC slow charging overnight; reserve DC fast chargers for highway roadtrips.</span>
                  </li>
                </ul>
              </Card>
            </div>
          </div>

          {/* Clean Ingestion Link Banner */}
          <div className="p-4 rounded-2xl bg-surface-container-low border border-surface-container-highest/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">upload_file</span>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-on-surface">Need to upload newer telemetry logs?</h4>
                <p className="text-xs text-on-surface-variant">Manage CSV files, view ingestion stages, or delete past uploads on the dedicated Data Ingestion page.</p>
              </div>
            </div>
            <Btn
              variant="secondary"
              size="sm"
              onClick={() => setCurrentTab('ingestion')}
              className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
            >
              <span>Go to Data Ingestion</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Btn>
          </div>
        </div>
      )}

      {/* VIEW 2: DETAILED ENGINEERING ANALYSIS WITH REAL GRAPHS */}
      {activeView === 'detailed' && (
        <div className="space-y-space-xl">
          {/* Primary Status Strip */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-xl">
            {/* SOH Health Meter */}
            <Card title="Current Health Assessment" className="flex flex-col justify-between">
              {loading ? (
                <Skeleton className="h-44" />
              ) : (
                <>
                  <BatteryHealthMeter
                    soh={v?.soh}
                    status={h.label}
                    eolThreshold={v?.eolThreshold || 80}
                    referenceCapacityAh={v?.referenceCapacityAh}
                    currentCapacityAh={v?.currentCapacityAh}
                  />
                  <div className="mt-4 pt-3 border-t border-surface-container-highest/60">
                    <Explain summary="How is battery health calculated?">
                      VoltSense calculates State of Health by dividing your battery&apos;s current usable discharge capacity by its reference capacity when brand new.
                    </Explain>
                  </div>
                </>
              )}
            </Card>

            {/* Remaining Useful Life */}
            <Card title="Remaining Useful Life Estimate" className="flex flex-col justify-between">
              {loading ? (
                <Skeleton className="h-36" />
              ) : has(v?.rul) ? (
                <div className="flex flex-col justify-between h-full">
                  <div>
                    <div className="text-4xl font-bold font-mono text-on-surface flex items-baseline gap-2">
                      <span>{fmt(v.rul, 0)}</span>
                      <span className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider">
                        Cycles
                      </span>
                    </div>
                    <p className="text-body-sm text-on-surface-variant mt-2 leading-relaxed">
                      Estimated full charge-discharge cycles before usable capacity declines to the {v?.eolThreshold || 80}% end-of-life threshold.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-surface-container-highest/60">
                    <Explain summary="What does this estimate assume?">
                      This projection is derived from trained Random Forest and Gradient Boosting regression models evaluated on historical NASA degradation trajectories under nominal operating conditions.
                    </Explain>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-on-surface-variant text-body-sm">
                  Remaining life estimate is not available yet. It requires multi-cycle discharge capacity records in the battery analysis pipeline.
                </div>
              )}
            </Card>

            {/* Usable Capacity Change */}
            <Card title="Capacity Retention" className="flex flex-col justify-between">
              {loading ? (
                <Skeleton className="h-36" />
              ) : (
                <dl className="space-y-3 text-body-md">
                  <div className="flex justify-between items-center py-1 border-b border-surface-container-highest/60">
                    <dt className="text-on-surface-variant">Measured Usable Capacity</dt>
                    <dd className="font-mono font-bold text-base text-on-surface">
                      {has(v?.currentCapacityAh) ? `${fmt(v.currentCapacityAh, 2)} Ah` : 'Not recorded'}
                    </dd>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-surface-container-highest/60">
                    <dt className="text-on-surface-variant">Reference Baseline (New)</dt>
                    <dd className="font-mono font-medium text-on-surface">
                      {has(v?.referenceCapacityAh) ? `${fmt(v.referenceCapacityAh, 2)} Ah` : 'Not recorded'}
                    </dd>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <dt className="text-on-surface-variant">Net Capacity Loss</dt>
                    <dd className="font-mono font-bold text-amber-700 dark:text-amber-400">
                      {capLoss !== null ? `${fmt(Math.abs(capLoss), 2)} Ah (${Math.abs((capLoss / v.referenceCapacityAh) * 100).toFixed(1)}%)` : '—'}
                    </dd>
                  </div>
                </dl>
              )}
            </Card>
          </div>

          {/* Operating Conditions */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-space-base">
            <Metric
              label="Mean Temperature"
              value={has(t) ? fmt(t) : null}
              unit="°C"
              source="Measured"
              tone={tempLabel(t).tone}
              note={has(t) ? `${tempLabel(t).label} thermal profile` : 'Not recorded in dataset'}
              loading={loading}
            />
            <Metric
              label="Operating Voltage"
              value={has(v?.voltage) ? fmt(v.voltage, 1) : has(v?.packVoltage) ? fmt(v.packVoltage, 1) : has(v?.telemetryStats?.voltage?.mean) ? fmt(v.telemetryStats.voltage.mean, 1) : null}
              unit="V"
              source="Measured"
              note={v?.voltage || v?.packVoltage || v?.telemetryStats?.voltage?.mean ? 'Pack bus voltage' : 'Not recorded in dataset'}
              loading={loading}
            />
            <Metric
              label="Internal Resistance"
              value={has(Number(v?.internalResistance)) ? fmt(Number(v.internalResistance), 2) : (v?.internalResistance && v.internalResistance !== '—' ? v.internalResistance : null)}
              unit="mΩ"
              source="Empirical"
              note={v?.internalResistance && v.internalResistance !== '—' ? 'EIS / Load Step Impedance' : 'Not recorded in dataset'}
              loading={loading}
            />
            <Metric
              label="Battery Status"
              value={h.label}
              tone={h.tone}
              note="Documented threshold classification"
              loading={loading}
            />
          </div>

          {/* DIGITAL TWIN & ELECTROCHEMICAL DEGRADATION INTELLIGENCE */}
          <DigitalTwinHealthChart
            vehicle={v}
            historicalData={digitalTwinHistoricalData}
            predictedData={digitalTwinPredictedData}
            currentCycle={v?.cycles || 1}
            currentSoh={v?.soh ?? 98.5}
            currentCapacityAh={v?.currentCapacityAh}
            referenceCapacityAh={v?.referenceCapacityAh}
            eolThreshold={v?.eolThreshold || 80.0}
            estimatedEolCycle={v?.estimatedEOLCycle || (v?.cycles ? v.cycles + (v?.rul || 350) : null)}
            degradationSlope={v?.degradationRatePerCycle || -0.045}
          />

          {/* Longitudinal Evaluation Log */}
          <Card
            title="Longitudinal Evaluation Log"
            subtitle="Chronological record of multi-period telemetry uploads, baseline calibrations, and cycle checkpoints."
          >
            {loading || historyLoading ? (
              <Skeleton className="h-40" />
            ) : (
              <BatteryEventTimeline events={timelineEvents} />
            )}
          </Card>

          {/* Key Findings and Recommendations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-xl">
            <Card title="Key Battery Findings">
              {loading ? (
                <Skeleton className="h-28" />
              ) : (
                <ul className="space-y-2.5 text-body-md">
                  {[...ins.good, ...ins.attention].map((x, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-[18px] text-primary mt-0.5">
                        check_circle
                      </span>
                      <span className="text-on-surface">{x}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Actionable Battery Recommendations">
              {loading ? (
                <Skeleton className="h-28" />
              ) : (
                <ul className="space-y-2.5 text-body-md">
                  {ins.recs.map((x, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-[18px] text-amber-600 mt-0.5">
                        tips_and_updates
                      </span>
                      <span className="text-on-surface">{x}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Link to Data Ingestion */}
          <div className="p-4 rounded-2xl bg-surface-container-low border border-surface-container-highest/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">history</span>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-on-surface">Manage Uploaded Telemetry Files</h4>
                <p className="text-xs text-on-surface-variant">Review file ingestion status, remove old logs, or re-run pipeline stages on Data Ingestion.</p>
              </div>
            </div>
            <Btn
              variant="secondary"
              size="sm"
              onClick={() => setCurrentTab('ingestion')}
              className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
            >
              <span>Open Data Ingestion</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
