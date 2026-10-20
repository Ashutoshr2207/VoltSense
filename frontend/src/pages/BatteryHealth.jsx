import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import useVehicleDetail from '../hooks/useVehicleDetail';
import { uploadDataset, triggerProcessing, fetchDatasetsForVehicle, waitForProcessing } from '../api/datasetApi';
import { fetchPredictionsForVehicle } from '../api/predictionApi';
import CsvUploadPanel from '../components/common/CsvUploadPanel';
import DatasetStatusPanel from '../components/common/DatasetStatusPanel';
import { Card, Badge, Skeleton, Metric, PageHeader, EmptyState, ErrorState, Explain, Btn } from '../components/common/ui';
import VehicleBattery3D from '../components/dashboard/VehicleBattery3D';
import { BatteryHealthMeter, BatteryEventTimeline } from '../components/dashboard/BatteryHealthMeter';
import { fmt, has, healthLabel, tempLabel } from '../utils/battery';
import { buildInsights, avgTemp } from '../utils/insights';

export default function BatteryHealth() {
  const { setCurrentTab, predictions, refreshVehicles, refreshPredictions, setIsAddVehicleModalOpen } = useApp();
  const { vehicle: v, loading, error, retry } = useVehicleDetail();

  // CSV Upload State
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [uploadStage, setUploadStage] = useState('');
  const [latestDs, setLatestDs] = useState(null);
  const [pipelineRunId, setPipelineRunId] = useState(null);
  const onFileChange = () => {
    setUploadError('');
    setUploadSuccess('');
  };
  const [dsError, setDsError] = useState(false);
  const [vehiclePredictions, setVehiclePredictions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadVehicleHistory = React.useCallback(async (vehicleId) => {
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

  React.useEffect(() => {
    loadVehicleHistory(v?.id);
  }, [v?.id, loadVehicleHistory]);

  const loadLatest = async () => {
    if (!v?.id) return null;
    try { const r = await fetchDatasetsForVehicle(v.id); const d = (r.datasets || [])[0] || null; setLatestDs(d); setDsError(false); return d; }
    catch { setDsError(true); return null; }
  };
  React.useEffect(() => { setLatestDs(null); setPipelineRunId(null); loadLatest(); }, [v?.id]);
  const onSavedStatus = React.useCallback((state) => {
    setLatestDs((previous) => previous?.id === state.datasetId && previous.status !== state.status
      ? { ...previous, status: state.status } : previous);
  }, []);

  const h = healthLabel(v?.soh);
  const ins = buildInsights(v);
  const t = avgTemp(v);

  const handleAnalyze = async (file) => {
    if (!file || !v?.id) return;
    setUploading(true);
    setUploadError('');
    setUploadSuccess('');
    setPipelineRunId(null);
    try {
      setUploadStage('Checking file…');
      const dataset = await uploadDataset(v.id, file, 'user_upload');
      setUploadStage('Validating schema…');
      setLatestDs(dataset);
      const run = await triggerProcessing(dataset.id);
      setPipelineRunId(run.pipelineRunId);
      await waitForProcessing(dataset.id, { pipelineRunId: run.pipelineRunId, onStatus: (state) => {
        const active = Object.entries(state.pipelineRun?.stages || {}).filter(([, stage]) => stage.status === 'processing');
        setUploadStage(active.length ? active.map(([name]) => name.replace(/([A-Z])/g, ' $1')).join(', ') : 'Processing dataset…');
      } });
      setUploadStage('Refreshing results…');
      if (refreshVehicles) await refreshVehicles();
      if (retry) retry();
      if (refreshPredictions) refreshPredictions();
      await loadVehicleHistory(v?.id);
      const finalDs = await loadLatest();
      setUploadStage('');
      const rep = finalDs?.analysisReport || [];
      const failed = rep.some((a) => a.status === 'failed');
      const ineligibles = rep.filter((a) => a.status === 'ineligible');
      const sohRulDone = rep.some((a) => a.id === 'soh' && a.status === 'completed') && rep.some((a) => a.id === 'rul' && a.status === 'completed');

      if (finalDs?.status === 'failed' || failed) {
        setUploadError(`Analysis failed for "${file.name}". See the per-analysis results below.`);
      } else if (ineligibles.length > 0) {
        const skippedSummary = ineligibles.map((a) => `${a.name} (${a.reason})`).join('; ');
        if (sohRulDone) {
          setUploadSuccess(`Analysis completed for "${file.name}". SOH and RUL inference updated successfully. Skipped: ${skippedSummary}.`);
        } else {
          setUploadSuccess(`Partially completed for "${file.name}". SOH/RUL was not evaluated. Skipped: ${skippedSummary}.`);
        }
      } else {
        setUploadSuccess(`Analysis completed for "${file.name}". SOH and RUL are updated.`);
      }
    } catch (err) {
      await loadLatest();
      setUploadStage('');
      setUploadError(err?.message || 'Failed to process battery dataset.');
    } finally {
      setUploading(false);
    }
  };

  const capLoss = has(v?.referenceCapacityAh) && has(v?.currentCapacityAh)
    ? v.currentCapacityAh - v.referenceCapacityAh
    : null;

  // Merge all available prediction sources for this vehicle
  const allPreds = [...vehiclePredictions];
  const appPreds = (predictions || []).filter((p) => p.vehicleId === v?.id);
  for (const ap of appPreds) {
    const apId = ap.id || ap._id;
    if (!allPreds.some((lp) => (lp.id && lp.id === apId) || (lp._id && lp._id === apId))) {
      allPreds.push(ap);
    }
  }

  allPreds.sort((a, b) => {
    const timeA = new Date(a.measurementDate || a.prediction?.measurementDate || a.createdAt || a.uploadTimestampRaw || 0).getTime();
    const timeB = new Date(b.measurementDate || b.prediction?.measurementDate || b.createdAt || b.uploadTimestampRaw || 0).getTime();
    return timeB - timeA;
  });

  const seenKeys = new Set();
  const evaluationEvents = [];
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

    evaluationEvents.push({
      cycle: cycle || 1,
      soh: typeof sohVal === 'number' ? Number(sohVal.toFixed(1)) : sohVal,
      capacity: typeof capVal === 'number' ? Number(capVal.toFixed(2)) : capVal,
      date: mFormatted ? `Measured: ${mFormatted}` : (uFormatted ? `Uploaded: ${uFormatted}` : 'Recorded Cycle'),
      measurementDate: mFormatted,
      uploadDate: uFormatted,
      title: `Cycle ${cycle || 1} Assessment`,
    });
  }

  // Derive historical milestone checkpoints from the degradation sequence if available
  const cycles = v?.cycleTable || [];
  const refCap = v?.referenceCapacityAh || (cycles[0]?.capacity > 0 ? cycles[0].capacity : null);
  const cycleMilestones = [];
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
      cycleMilestones.push({
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

  let timelineEvents = [];
  if (evaluationEvents.length > 1) {
    timelineEvents = evaluationEvents.slice(0, 10);
  } else if (evaluationEvents.length === 1) {
    timelineEvents = [evaluationEvents[0], ...cycleMilestones].slice(0, 10);
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
    timelineEvents = [latestEvent, ...cycleMilestones].slice(0, 10);
  }

  const hasCapacityData = has(v?.currentCapacityAh) || has(v?.soh);

  if (!loading && !v?.id) return <Card><EmptyState title="Add a vehicle before uploading" text="Create your vehicle profile, then select a battery dataset." actionLabel="Add vehicle" onAction={() => setIsAddVehicleModalOpen(true)} /></Card>;

  if (!loading && !v?.hasAnalysis) {
    return (
      <div className="space-y-space-xl pb-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider mb-1">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse"></span>
              <span>Degradation & Lifespan Intelligence</span>
              <span>/</span>
              <span className="text-primary font-semibold">Random Forest & Gradient Boosting</span>
            </div>
            <PageHeader
              title="SOH & Remaining Useful Life"
              subtitle="State of Health, remaining discharge cycles to 80% EOL, and 3D battery module architecture."
            />
          </div>
          <Btn
            variant="secondary"
            onClick={() => setCurrentTab('anomalies')}
            className="text-xs flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px] text-amber-600">warning</span>
            Inspect Telemetry Anomalies
          </Btn>
        </div>

        {/* CSV upload */}
        {error && <ErrorState onRetry={retry} />}
        <CsvUploadPanel key={v?.id} onAnalyze={handleAnalyze} onFileChange={onFileChange} uploading={uploading} stage={uploadStage} error={uploadError} success={uploadSuccess} disabled={!v?.id} serverReport={latestDs?.analysisReport?.length ? latestDs.analysisReport : null} />
        <DatasetStatusPanel dataset={latestDs} pipelineRunId={pipelineRunId} onStatus={onSavedStatus} />
        <Card title="Battery Telemetry Anomalies" subtitle="Results for the latest upload. Screened against generic Li-ion reference limits, not vehicle-specific limits.">
          {dsError ? <p className="text-body-md text-error">Could not load results. <button type="button" className="underline" onClick={loadLatest}>Retry</button></p>
          : !latestDs ? <p className="text-body-md text-on-surface-variant">No upload yet.</p>
          : (() => { const a = (latestDs.analysisReport || []).find((x) => x.id === 'anomaly'); const an = latestDs.anomalies;
            if (!a || a.status !== 'completed') return <p className="text-body-md text-on-surface-variant">Not evaluated: {a?.reason || 'anomaly analysis has not run for this upload.'}</p>;
            const list = an?.anomalies || [];
            return (<div className="space-y-3">
              <p className="text-body-md">{an.unresolvedCount ?? 0} unresolved of {list.length} findings across {an.totalRecordsAnalyzed?.toLocaleString?.() ?? an.totalRecordsAnalyzed} records.</p>
              {latestDs.spreads && (<div className="grid grid-cols-2 gap-3 text-body-sm">
                <div className="rounded-xl border border-surface-container-highest/60 p-3"><div className="text-on-surface-variant">Cell voltage spread (max - min)</div><div className="font-semibold">{latestDs.spreads.voltage.maxSpread ?? '—'} V max (row {latestDs.spreads.voltage.maxSpreadRow ?? '—'}), mean {latestDs.spreads.voltage.meanSpread ?? '—'} V</div><div className="text-on-surface-variant">{latestDs.spreads.voltage.sentinelZero} sentinel 0 V cell readings excluded, {latestDs.spreads.voltage.missing} missing</div></div>
                <div className="rounded-xl border border-surface-container-highest/60 p-3"><div className="text-on-surface-variant">Cell temperature spread (max - min)</div><div className="font-semibold">{latestDs.spreads.temperature.maxSpread ?? '—'} °C max (row {latestDs.spreads.temperature.maxSpreadRow ?? '—'}), mean {latestDs.spreads.temperature.meanSpread ?? '—'} °C</div><div className="text-on-surface-variant">{latestDs.spreads.temperature.missing} missing</div></div>
              </div>)}
              {list.length === 0 ? <p className="text-body-md text-on-surface-variant">No readings exceeded the reference limits.</p> : (
                <ul className="divide-y divide-surface-container-highest/60 text-body-sm">{list.slice(0, 8).map((x, i) => (<li key={i} className="py-2"><span className="font-medium">{x.title || x.type}</span> · {x.severity} · measured {String(x.measuredValue)} vs limit {String(x.threshold)}{x.rowIndex != null ? ` · source row ${x.rowIndex}` : ''}</li>))}</ul>)}
              <Btn onClick={() => setCurrentTab('anomalies')}>Open full anomaly detail</Btn>
            </div>); })()}
        </Card>

        {/* 3D X-Ray Battery Architecture */}
        <Card
          title="Interactive 3D Battery Pack Architecture"
          subtitle="Transparent X-ray vehicle inspection showing an illustrative 16-module layout; colour reflects pack-level SOH only when a valid result exists."
        >
          <VehicleBattery3D soh={null} />
        </Card>

        <Card>
          <EmptyState
            icon="battery_unknown"
            title="No battery analysis yet"
            text="Upload an authentic battery telemetry CSV above to review measured capacity and calculate model SOH and Remaining Useful Life."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-space-xl pb-16">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider mb-1">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse"></span>
            <span>Degradation & Lifespan Intelligence</span>
            <span>/</span>
            <span className="text-primary font-semibold">Random Forest & Gradient Boosting</span>
          </div>
          <PageHeader
            title="SOH & Remaining Useful Life"
            subtitle="State of Health, remaining discharge cycles to 80% EOL, and 3D battery module architecture."
          />
        </div>

        {/* Action Link to Anomaly Inspection */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <Btn
            variant="secondary"
            onClick={() => setCurrentTab('anomalies')}
            className="text-xs flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px] text-amber-600">warning</span>
            Inspect Telemetry Anomalies
          </Btn>
        </div>
      </div>

      {/* CSV upload */}
      <CsvUploadPanel key={v?.id} onAnalyze={handleAnalyze} onFileChange={onFileChange} uploading={uploading} stage={uploadStage} error={uploadError} success={uploadSuccess} disabled={!v?.id} serverReport={latestDs?.analysisReport?.length ? latestDs.analysisReport : null} />
      <DatasetStatusPanel dataset={latestDs} pipelineRunId={pipelineRunId} onStatus={onSavedStatus} />
      <Card title="Battery Telemetry Anomalies" subtitle="Results for the latest upload. Screened against generic Li-ion reference limits, not vehicle-specific limits.">
        {dsError ? <p className="text-body-md text-error">Could not load results. <button type="button" className="underline" onClick={loadLatest}>Retry</button></p>
        : !latestDs ? <p className="text-body-md text-on-surface-variant">No upload yet.</p>
        : (() => { const a = (latestDs.analysisReport || []).find((x) => x.id === 'anomaly'); const an = latestDs.anomalies;
          if (!a || a.status !== 'completed') return <p className="text-body-md text-on-surface-variant">Not evaluated: {a?.reason || 'anomaly analysis has not run for this upload.'}</p>;
          const list = an?.anomalies || [];
          return (<div className="space-y-3">
            <p className="text-body-md">{an.unresolvedCount ?? 0} unresolved of {list.length} findings across {an.totalRecordsAnalyzed?.toLocaleString?.() ?? an.totalRecordsAnalyzed} records.</p>
            {latestDs.spreads && (<div className="grid grid-cols-2 gap-3 text-body-sm">
              <div className="rounded-xl border border-surface-container-highest/60 p-3"><div className="text-on-surface-variant">Cell voltage spread (max - min)</div><div className="font-semibold">{latestDs.spreads.voltage.maxSpread ?? '—'} V max (row {latestDs.spreads.voltage.maxSpreadRow ?? '—'}), mean {latestDs.spreads.voltage.meanSpread ?? '—'} V</div><div className="text-on-surface-variant">{latestDs.spreads.voltage.sentinelZero} sentinel 0 V cell readings excluded, {latestDs.spreads.voltage.missing} missing</div></div>
              <div className="rounded-xl border border-surface-container-highest/60 p-3"><div className="text-on-surface-variant">Cell temperature spread (max - min)</div><div className="font-semibold">{latestDs.spreads.temperature.maxSpread ?? '—'} °C max (row {latestDs.spreads.temperature.maxSpreadRow ?? '—'}), mean {latestDs.spreads.temperature.meanSpread ?? '—'} °C</div><div className="text-on-surface-variant">{latestDs.spreads.temperature.missing} missing</div></div>
            </div>)}
            {list.length === 0 ? <p className="text-body-md text-on-surface-variant">No readings exceeded the reference limits.</p> : (
              <ul className="divide-y divide-surface-container-highest/60 text-body-sm">{list.slice(0, 8).map((x, i) => (<li key={i} className="py-2"><span className="font-medium">{x.title || x.type}</span> · {x.severity} · measured {String(x.measuredValue)} vs limit {String(x.threshold)}{x.rowIndex != null ? ` · source row ${x.rowIndex}` : ''}</li>))}</ul>)}
            <Btn onClick={() => setCurrentTab('anomalies')}>Open full anomaly detail</Btn>
          </div>); })()}
      </Card>

      {error && <ErrorState onRetry={retry} />}

      {/* Experimental Model Banner (Truthful & Transparent) */}
      {v?.isExperimental && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-950 dark:text-amber-200 text-xs flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[22px] mt-0.5">science</span>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-sm text-amber-950 dark:text-amber-100">Experimental Model Inference</h4>
              <Badge tone="attention">Candidate {v?.modelVersion || 'v3'}</Badge>
            </div>
            <p className="text-amber-900 dark:text-amber-300">
              Predictions are generated by the fitted candidate V3 model (GradientBoosting capacity regressor &amp; RandomForest RUL estimator).
              This candidate has not undergone prospective EV pack validation and is provided for research analysis only.
            </p>
          </div>
        </div>
      )}

      {/* 3D X-Ray Battery Architecture — ALWAYS rendered on page load */}
      <Card
        title="Interactive 3D Battery Pack Architecture"
        subtitle="Transparent X-ray vehicle inspection showing an illustrative 16-module layout; colour reflects pack-level SOH only when a valid result exists."
      >
        <VehicleBattery3D soh={typeof v?.soh === 'number' ? v.soh : null} />
      </Card>

      {/* Trip-Only Dataset Notice (if dataset is trip-based without cycle capacity) */}
      {!loading && v?.hasAnalysis && !hasCapacityData && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-700 text-[20px] mt-0.5">info</span>
          <div>
            <h4 className="font-bold text-sm text-amber-900">Trip Driving Cycle Detected</h4>
            <p className="mt-0.5 text-amber-800">
              The uploaded file contains instantaneous driving telemetry (pack voltage, current, temperatures, and vehicle speed) but lacks multi-cycle discharge capacity fade records.
              VoltSense calculates real operating statistics below and detects safety excursions, but will not fabricate artificial SOH or RUL cycle predictions without cycle capacity ground truth.
            </p>
          </div>
        </div>
      )}

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
                <div className="text-4xl font-bold font-mono text-[#1c1e21] flex items-baseline gap-2">
                  <span>{fmt(v.rul, 0)}</span>
                  <span className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider">
                    Cycles
                  </span>
                </div>
                <p className="text-body-sm text-on-surface-variant mt-2">
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
                <dd className="font-mono font-bold text-base text-[#1c1e21]">
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
                <dd className="font-mono font-bold text-amber-800">
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
          tone={tempLabel(t).tone}
          note={has(t) ? `${tempLabel(t).label} thermal profile` : 'Not recorded in dataset'}
          loading={loading}
        />
        <Metric
          label="Operating Voltage"
          value={v?.voltage ? fmt(v.voltage, 1) : null}
          unit="V"
          note={v?.voltage ? 'Pack bus voltage' : 'Not recorded in dataset'}
          loading={loading}
        />
        <Metric
          label="Internal Resistance"
          value={v?.internalResistance ? fmt(Number(v.internalResistance), 2) : null}
          unit="mΩ"
          note={v?.internalResistance ? 'EIS / Load Step Impedance' : 'Not recorded in dataset'}
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

      {/* Historical Degradation Sequence */}
      <Card
        title="Historical Analysis Log"
        subtitle="Chronological record of individual completed evaluation sessions (non-graphical summary)."
      >
        {loading || historyLoading ? <Skeleton className="h-40" /> : <BatteryEventTimeline events={timelineEvents} />}
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
                  <span className="material-symbols-outlined text-[18px] text-[#24695b] mt-0.5">
                    check_circle
                  </span>
                  <span>{x}</span>
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
                  <span className="material-symbols-outlined text-[18px] text-[#d9822b] mt-0.5">
                    tips_and_updates
                  </span>
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
