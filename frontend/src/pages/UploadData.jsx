import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { uploadDataset, triggerProcessing, getProcessingStatus } from '../api/datasetApi';
import { fetchPredictionsForVehicle } from '../api/predictionApi';
import { mapPredictionRow } from '../utils/mappers';

// Maps the backend's 7 fine-grained pipeline stages onto the 4 stage cards
// shown in the UI.
const STAGE_GROUPS = [
  ['validation', 'schemaMapping'],
  ['cleaning', 'missingValueHandling', 'outlierDetection'],
  ['featureEngineering'],
  ['normalization']
];

const SAMPLE_PROFILES = [
  {
    id: 'A',
    name: 'Benchmark profile A — 40 cycles',
    cycles: 40,
    baseCapacity: 1.96,
    initialCapacity: 2.00,
    slope: 0.002,
    dischargeTimeBase: 3600,
    timeDecay: 6,
    tempBase: 24.2,
    tempSlope: 0.03,
  },
  {
    id: 'B',
    name: 'Benchmark profile B — 80 cycles',
    cycles: 80,
    baseCapacity: 1.95,
    initialCapacity: 2.00,
    slope: 0.0035,
    dischargeTimeBase: 3600,
    timeDecay: 12,
    tempBase: 24.5,
    tempSlope: 0.05,
  },
  {
    id: 'C',
    name: 'Benchmark profile C — 140 cycles',
    cycles: 140,
    baseCapacity: 1.94,
    initialCapacity: 2.00,
    slope: 0.0037,
    dischargeTimeBase: 3600,
    timeDecay: 16,
    tempBase: 25.0,
    tempSlope: 0.06,
  },
];

function buildSampleCsv(profileIndex = 0) {
  const profile = SAMPLE_PROFILES[profileIndex % SAMPLE_PROFILES.length];
  const header = 'Voltage_measured,Current_measured,Temperature_measured,Current_load,Voltage_load,Time,Capacity,Cycle\n';
  const rows = [];
  for (let cycle = 1; cycle <= profile.cycles; cycle += 1) {
    const capacity = Math.max(1.2, profile.baseCapacity - (cycle - 1) * profile.slope);
    const dischargeTime = Math.max(1500, profile.dischargeTimeBase - (cycle - 1) * profile.timeDecay);
    const temp = profile.tempBase + cycle * profile.tempSlope;

    rows.push(`${(4.195 - cycle * 0.0015).toFixed(3)},-1.500,${temp.toFixed(1)},-1.500,${(4.180 - cycle * 0.0015).toFixed(3)},0.000,${capacity.toFixed(4)},${cycle}`);
    rows.push(`${(4.180 - cycle * 0.0015).toFixed(3)},-1.500,${(temp + 0.2).toFixed(1)},-1.500,${(4.170 - cycle * 0.0015).toFixed(3)},600.000,${capacity.toFixed(4)},${cycle}`);
    rows.push(`${(3.950 - cycle * 0.002).toFixed(3)},1.500,${(temp + 1.5).toFixed(1)},1.500,${(3.930 - cycle * 0.002).toFixed(3)},1800.000,${capacity.toFixed(4)},${cycle}`);
    rows.push(`${(3.500 - cycle * 0.003).toFixed(3)},1.500,${(temp + 2.8).toFixed(1)},1.500,${(3.480 - cycle * 0.003).toFixed(3)},${dischargeTime.toFixed(3)},${capacity.toFixed(4)},${cycle}`);
    rows.push(`${(3.720 - cycle * 0.0015).toFixed(3)},0.000,${(temp + 0.8).toFixed(1)},0.000,${(3.720 - cycle * 0.0015).toFixed(3)},${(dischargeTime + 300).toFixed(3)},${capacity.toFixed(4)},${cycle}`);
  }
  return {
    blob: new Blob([header + rows.join('\n')], { type: 'text/csv' }),
    profile,
  };
}

export default function UploadData() {
  const {
    vehicles,
    selectVehicleForReport,
    addPrediction,
    refreshVehicles,
    loadVehicleDetail,
    setIsAddVehicleModalOpen,
  } = useApp();

  const [selectedFile, setSelectedFile] = useState(null);
  const [rawFile, setRawFile] = useState(null);
  const [sampleProfileIndex, setSampleProfileIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState(1);
  const [processingLogs, setProcessingLogs] = useState([]);
  const [completedResult, setCompletedResult] = useState(null);
  const [protocol, setProtocol] = useState('ml');
  const [errorMessage, setErrorMessage] = useState('');

  const pollTimeoutRef = useRef(null);
  const isStartingRef = useRef(false);

  const activeVeh = vehicles[0];

  useEffect(() => {
    refreshVehicles();
  }, [refreshVehicles]);

  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setRawFile(file);
      setSelectedFile({
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        type: file.type || 'text/csv'
      });
      setCompletedResult(null);
      setProgress(0);
      setProcessingLogs([]);
      setErrorMessage('');
    }
  };

  const loadSampleDataset = () => {
    const nextIdx = sampleProfileIndex;
    const { blob, profile } = buildSampleCsv(nextIdx);
    setSampleProfileIndex((prev) => (prev + 1) % SAMPLE_PROFILES.length);
    const file = new File([blob], `nasa_profile_${profile.id}_${Date.now()}.csv`, { type: 'text/csv' });
    setRawFile(file);
    setSelectedFile({
      name: file.name,
      size: `${(file.size / 1024).toFixed(1)} KB`,
      type: 'text/csv',
      profileName: profile.name,
    });
    setCompletedResult(null);
    setProgress(0);
    setErrorMessage('');
    setProcessingLogs([
      `[INFO] Loaded synthetic benchmark ${profile.name} for ${activeVeh?.name || 'your EV'}`,
      `[INFO] Ingested ${profile.cycles} test cycles (${profile.cycles * 5} records)`,
      `[INFO] Schema: Voltage_measured, Current_measured, Temperature_measured, Current_load, Voltage_load, Time, Capacity, Cycle`
    ]);
    return file;
  };

  const downloadSampleCsv = (fileToDownload) => {
    let target = fileToDownload || rawFile;
    if (!target) {
      target = loadSampleDataset();
    }
    const url = URL.createObjectURL(target);
    const a = document.createElement('a');
    a.href = url;
    a.download = target.name || 'nasa_battery_telemetry.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const pollStatus = (datasetId, resolve, reject) => {
    pollTimeoutRef.current = setTimeout(async () => {
      try {
        const status = await getProcessingStatus(datasetId);
        const stages = status.pipelineRun?.stages || {};

        const completedGroups = STAGE_GROUPS.filter((group) =>
          group.every((stageName) => stages[stageName]?.status === 'completed')
        ).length;
        setCurrentStage(Math.max(1, completedGroups || 1));
        setProgress(Math.min(95, Math.round((completedGroups / STAGE_GROUPS.length) * 95) + 5));

        if (status.status === 'processed' || status.pipelineRun?.status === 'completed') {
          setProgress(100);
          setCurrentStage(4);
          resolve(status);
          return;
        }

        if (status.pipelineRun?.status === 'failed' || status.status === 'failed') {
          reject(new Error('Pipeline processing failed.'));
          return;
        }

        pollStatus(datasetId, resolve, reject);
      } catch (error) {
        reject(error);
      }
    }, 1500);
  };

  const startPipeline = async () => {
    if (isProcessing || isStartingRef.current) return;
    isStartingRef.current = true;

    // Refresh vehicles to guarantee fresh ownership for current user session
    let currentVeh = activeVeh;
    try {
      const freshVehicles = await refreshVehicles();
      currentVeh = freshVehicles[0];
    } catch (err) {
      console.warn('Could not refresh vehicles before upload:', err);
    }

    if (!currentVeh) {
      setErrorMessage('Please set up your EV first before uploading battery telemetry.');
      isStartingRef.current = false;
      return;
    }

    const fileToUpload = rawFile;
    if (!fileToUpload) {
      setErrorMessage('Select a telemetry CSV before starting analysis. VoltSense does not generate analysis input automatically.');
      isStartingRef.current = false;
      return;
    }

    setIsProcessing(true);
    setProgress(5);
    setCurrentStage(1);
    setCompletedResult(null);
    setErrorMessage('');
    setProcessingLogs([
      `[INFO] Initializing ingestion stream for ${currentVeh.vin && currentVeh.vin !== '—' ? currentVeh.vin : currentVeh.name}...`,
      `[INFO] Uploading dataset to VoltSense pipeline...`
    ]);

    try {
      const dataset = await uploadDataset(currentVeh.id, fileToUpload, rawFile ? 'user_upload' : 'demo_dataset');
      setProcessingLogs((prev) => [...prev, `[INFO] Dataset stored: ${dataset.recordCount ?? '—'} records queued for processing.`]);

      await triggerProcessing(dataset.id);
      setProcessingLogs((prev) => [
        ...prev,
        `[INFO] Stage 01: Validating schema & checksum...`,
      ]);

      const finalStatus = await new Promise((resolve, reject) => {
        pollStatus(dataset.id, resolve, reject);
      });

      setProcessingLogs((prev) => [
        ...prev,
        `[INFO] Stage 02: Running electrochemical anomaly screening...`,
        `[INFO] Stage 03: Executing ML degradation fitting (Model inference using the configured training pipeline)...`,
        `[INFO] Stage 04: Projecting remaining useful life & degradation trajectory...`,
        `[DONE] Pipeline finished with status: ${finalStatus.status}.`
      ]);

      // Pull the freshly created prediction + refresh vehicle state.
      const predResult = await fetchPredictionsForVehicle(currentVeh.id, { pageSize: 1, sortOrder: 'desc' });
      const latestPrediction = predResult.predictions?.[0];

      await refreshVehicles();
      await loadVehicleDetail(currentVeh.id);

      if (latestPrediction) {
        addPrediction(mapPredictionRow(latestPrediction, currentVeh));
        setCompletedResult({
          soh: latestPrediction.prediction.soh,
          rul: latestPrediction.prediction.rulCycles,
          cycles: latestPrediction.prediction.currentCycle,
          confidence: latestPrediction.confidence?.calibrated
            ? `${((latestPrediction.confidence.value ?? latestPrediction.confidence.soh ?? 0) * 100).toFixed(1)}%`
            : 'Not calibrated',
          modelName: latestPrediction.model?.name || 'RandomForest (SOH) + GradientBoosting (RUL)'
        });
      }
    } catch (error) {
      setErrorMessage(error.message || 'Something went wrong while processing this dataset.');
      setProcessingLogs((prev) => [...prev, `[ERROR] ${error.message || 'Pipeline failed.'}`]);
    } finally {
      setIsProcessing(false);
      isStartingRef.current = false;
    }
  };

  if (!activeVeh) {
    return (
      <div className="p-12 text-center bg-surface-container-lowest rounded-xl border border-surface-container-highest/60 flex flex-col items-center max-w-lg mx-auto my-12">
        <div className="w-16 h-16 rounded-xl bg-primary-container/20 text-primary flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-[36px]">upload_file</span>
        </div>
        <p className="font-headline-sm text-headline-sm text-on-surface font-semibold">Set up your EV first</p>
        <p className="text-body-sm text-on-surface-variant mt-2 text-center max-w-md">
          Please register your vehicle before uploading telemetry datasets so health predictions can be assigned to your battery.
        </p>
        <button
          onClick={() => setIsAddVehicleModalOpen(true)}
          className="mt-6 h-11 px-6 rounded-lg bg-primary text-on-primary font-label-md text-label-md font-bold hover:bg-primary/90 transition-colors shadow flex items-center gap-2 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Set Up My EV
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full pb-space-4xl">
      {/* Header Diagnostic Panel */}
      <div className="flex flex-col md:flex-row md:items-end justify-between pb-space-lg gap-space-md">
        <div className="flex flex-col gap-space-2xs">
          <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">
            <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse"></span>
            <span>Telemetry Ingestion Engine</span>
            <span className="text-outline">/</span>
            <span className="text-primary font-semibold">Stage 01</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
            Upload Battery Data
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
            Upload raw EV battery telemetry, BMS logs, or diagnostic datasets to compute current SOH, predict remaining useful life, and detect degradation anomalies.
          </p>
        </div>

        <div className="flex items-center gap-space-sm self-start md:self-auto bg-surface-container-low px-space-md py-space-xs rounded-xl shadow-sm border border-surface-container-highest/60">
          <div className="flex flex-col text-right">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">Pipeline Latency</span>
            <span className="font-telemetry-sm text-telemetry-sm text-on-surface font-semibold font-mono">&lt; 420ms / 10k rows</span>
          </div>
          <div className="h-6 w-px bg-surface-container-highest"></div>
          <span className="material-symbols-outlined text-secondary text-[22px]">hub</span>
        </div>
      </div>

      {/* Primary Engineering Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl">
        {/* LEFT COLUMN: Vehicle & Configuration Controls (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-space-lg">
          <div className="bg-surface-container-lowest p-space-xl rounded-xl shadow-sm flex flex-col gap-space-lg border border-surface-container-highest/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-primary text-[20px]">tune</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Telemetry Config</span>
              </div>
              <span className="font-label-sm text-label-sm px-space-xs py-space-2xs bg-surface-container text-on-surface-variant rounded font-mono font-semibold">
                CONFIG_V2.4
              </span>
            </div>

            {/* Target Vehicle (single EV) */}
            <div className="flex flex-col gap-space-xs">
              <label className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
                Target EV Unit
              </label>
              <div className="h-10 px-space-md flex items-center bg-surface-container-low text-on-surface rounded-lg font-body-md text-body-md border border-transparent">
                {activeVeh.name} {activeVeh.year !== '—' ? `(${activeVeh.year})` : ''}
              </div>
            </div>

            {/* Detected BMS Spec Card */}
            <div className="bg-surface-container-low p-space-md rounded-lg flex flex-col gap-space-xs border border-surface-container-highest/40">
              <div className="flex items-center justify-between">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">Parser Definition</span>
                <span className="font-label-sm text-label-sm px-space-xs py-space-2xs bg-secondary-container text-on-secondary-container rounded font-medium flex items-center gap-1 font-mono">
                  <span className="h-1.5 w-1.5 rounded-full bg-secondary"></span> Auto-Bound
                </span>
              </div>
              <div className="font-telemetry-sm text-telemetry-sm text-on-surface font-semibold flex items-center gap-space-xs font-mono">
                <span className="material-symbols-outlined text-[16px] text-primary">memory</span>
                Format: Charge / Discharge / Impedance Cycles
              </div>
              <div className="text-[12px] text-on-surface-variant">
                Pack: <span className="font-mono text-on-surface font-semibold">{activeVeh.chemistry}</span>
              </div>
              <div className="text-[12px] text-on-surface-variant font-mono">
                Expected columns: cycle, voltage, current, temperature, impedance
              </div>
            </div>

            {/* Inference Protocol */}
            <div className="flex flex-col gap-space-xs">
              <label className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
                Inference Protocol
              </label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 p-2.5 rounded-lg bg-surface-container-low cursor-pointer hover:bg-surface-container transition-colors">
                  <input 
                    type="radio" 
                    name="protocol" 
                    checked={protocol === 'ml'} 
                    onChange={() => setProtocol('ml')}
                    className="accent-primary"
                  />
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface font-semibold">Telemetry-Derived Empirical Baseline</span>
                    <span className="text-[11px] text-on-surface-variant">Model inference using the configured training pipeline & degradation curve</span>
                  </div>
                </label>
                <label className="flex items-center gap-2 p-2.5 rounded-lg bg-surface-container-low cursor-pointer hover:bg-surface-container transition-colors">
                  <input 
                    type="radio" 
                    name="protocol" 
                    checked={protocol === 'deterministic'} 
                    onChange={() => setProtocol('deterministic')}
                    className="accent-primary"
                  />
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface font-semibold">Deterministic Coulomb-Counting SOH</span>
                    <span className="text-[11px] text-on-surface-variant">Direct capacity retention screening (&lt;50ms)</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Drag & Drop Dropzone, Progress & Result (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-space-lg">
          {/* File Upload Ingestion Box */}
          <div className="bg-surface-container-lowest p-space-xl rounded-xl shadow-sm border border-surface-container-highest/40 flex flex-col gap-space-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Dataset Ingestion Zone
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Upload raw CSV / JSON telemetry logs or load pre-configured battery traces.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                <button 
                  type="button"
                  onClick={loadSampleDataset}
                  className="h-9 px-space-md bg-secondary-container text-on-secondary-container hover:bg-secondary-container/80 rounded-lg font-label-md text-label-md font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">cloud_sync</span>
                  Load Sample BMS Log
                </button>
                <button 
                  type="button"
                  onClick={() => downloadSampleCsv(rawFile)}
                  className="h-9 px-space-md bg-surface-container-high hover:bg-surface-container-highest text-on-surface rounded-lg font-label-md text-label-md font-semibold flex items-center gap-1.5 transition-colors border border-surface-container-highest/80 shadow-sm cursor-pointer"
                  title="Download BMS dataset CSV to your computer"
                >
                  <span className="material-symbols-outlined text-[18px]">download</span>
                  Download CSV
                </button>
              </div>
            </div>

            {/* Dropzone */}
            <label className="border-2 border-dashed border-surface-container-highest hover:border-primary/50 bg-surface-container-low/50 hover:bg-surface-container-low rounded-xl p-space-xl flex flex-col items-center justify-center cursor-pointer transition-all group text-center">
              <input 
                type="file" 
                accept=".csv,.json,.parquet,.txt" 
                onChange={handleFileChange}
                className="hidden" 
              />
              <div className="w-14 h-14 rounded-full bg-surface-container-lowest flex items-center justify-center text-primary mb-space-sm group-hover:scale-110 transition-transform shadow-sm">
                <span className="material-symbols-outlined text-[28px]">upload_file</span>
              </div>
              <p className="font-label-md text-label-md text-on-surface font-semibold">
                Click to browse or drag & drop battery telemetry file
              </p>
              <p className="text-[12px] text-on-surface-variant mt-1">
                Supports .CSV, .JSON, .PARQUET format with voltage, current, and cell temperatures
              </p>
            </label>

            {/* Selected File Card */}
            {selectedFile && (
              <div className="bg-surface-container-low p-space-md rounded-xl flex items-center justify-between border border-surface-container-highest/60">
                <div className="flex items-center gap-space-md">
                  <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[22px]">description</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md font-semibold text-on-surface font-mono">
                      {selectedFile.name}
                    </span>
                    <span className="text-[11px] text-on-surface-variant font-mono">
                      {selectedFile.size} {selectedFile.profileName ? `• ${selectedFile.profileName}` : '• ISO-8601 UTC'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-space-sm">
                  <button
                    type="button"
                    onClick={() => downloadSampleCsv(rawFile)}
                    title="Download this file to your computer"
                    className="h-8 px-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary hover:text-primary-container font-label-sm text-label-sm font-semibold flex items-center gap-1 transition-colors border border-surface-container-highest/60 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">download</span>
                    <span className="hidden sm:inline">Download CSV</span>
                  </button>
                  <span className="px-2 py-0.5 rounded bg-primary-container text-on-primary-container font-label-sm text-label-sm font-semibold">
                    Ready
                  </span>
                  <button 
                    onClick={() => setSelectedFile(null)}
                    className="text-on-surface-variant hover:text-on-surface p-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
              </div>
            )}

            {/* Run Pipeline Button */}
            <div className="flex items-center justify-end gap-space-sm">
              <button 
                onClick={startPipeline}
                disabled={isProcessing}
                className={`h-11 px-space-xl rounded-lg font-body-md text-body-md font-semibold flex items-center gap-space-sm transition-all shadow-sm ${
                  isProcessing 
                    ? 'bg-surface-container text-on-surface-variant cursor-not-allowed' 
                    : 'bg-primary text-on-primary hover:bg-primary-container'
                }`}
              >
                {isProcessing ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                    Processing Telemetry Stream...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[20px]">play_arrow</span>
                    Start Telemetry Processing Pipeline
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Progress & Real-time Execution Pipeline */}
          {(isProcessing || progress > 0) && (
            <div className="bg-surface-container-lowest p-space-xl rounded-xl shadow-sm border border-surface-container-highest/40 flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                  Processing Ingestion Pipeline
                </span>
                <span className="font-telemetry-sm text-telemetry-sm font-mono font-bold text-primary">
                  {progress}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary-container transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>

              {/* 4 Pipeline Stages Indicator */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                <div className={`p-2.5 rounded-lg border text-center ${
                  currentStage >= 1 ? 'border-primary/40 bg-primary/5 text-primary' : 'border-surface-container-highest text-on-surface-variant'
                }`}>
                  <span className="font-label-sm text-[11px] font-semibold block">STAGE 1</span>
                  <span className="text-[12px] font-medium">Ingestion & Checksum</span>
                </div>
                <div className={`p-2.5 rounded-lg border text-center ${
                  currentStage >= 2 ? 'border-primary/40 bg-primary/5 text-primary' : 'border-surface-container-highest text-on-surface-variant'
                }`}>
                  <span className="font-label-sm text-[11px] font-semibold block">STAGE 2</span>
                  <span className="text-[12px] font-medium">Anomaly Screening</span>
                </div>
                <div className={`p-2.5 rounded-lg border text-center ${
                  currentStage >= 3 ? 'border-primary/40 bg-primary/5 text-primary' : 'border-surface-container-highest text-on-surface-variant'
                }`}>
                  <span className="font-label-sm text-[11px] font-semibold block">STAGE 3</span>
                  <span className="text-[12px] font-medium">ML Degradation Fit</span>
                </div>
                <div className={`p-2.5 rounded-lg border text-center ${
                  currentStage >= 4 ? 'border-primary/40 bg-primary/5 text-primary' : 'border-surface-container-highest text-on-surface-variant'
                }`}>
                  <span className="font-label-sm text-[11px] font-semibold block">STAGE 4</span>
                  <span className="text-[12px] font-medium">RUL & Forecast</span>
                </div>
              </div>

              {/* Console log box */}
              <div className="bg-inverse-surface text-inverse-on-surface rounded-xl p-space-md font-mono text-[12px] h-40 overflow-y-auto flex flex-col gap-1 border border-surface-container-highest/20 mt-2">
                {processingLogs.map((log, index) => (
                  <div key={index} className="leading-relaxed">
                    {log}
                  </div>
                ))}
              </div>

              {/* Error banner */}
              {errorMessage && (
                <div className="px-space-md py-space-sm rounded-lg bg-error-container/30 border border-error-container text-error font-body-sm text-body-sm">
                  {errorMessage}
                </div>
              )}

              {/* Completed Result Card */}
              {completedResult && (
                <div className="p-space-lg rounded-xl bg-secondary-container/20 border border-secondary-container flex flex-col sm:flex-row items-center justify-between gap-space-md animate-in fade-in duration-300">
                  <div className="flex items-center gap-space-md">
                    <div className="w-12 h-12 rounded-xl bg-primary text-on-primary flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-[28px]">check</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                        Analysis Complete for {activeVeh.name}
                      </span>
                      <div className="flex flex-wrap items-center gap-space-sm font-mono text-body-sm mt-1 text-on-surface-variant">
                        <span>Calculated SOH: <strong className="text-primary font-bold">{completedResult.soh}%</strong></span>
                        <span>•</span>
                        <span>RUL: <strong className="text-on-surface">{completedResult.rul} cycles</strong></span>
                        <span>•</span>
                        <span>Confidence: <strong className="text-on-surface">{completedResult.confidence}</strong></span>
                        {completedResult.modelName && (
                          <>
                            <span>•</span>
                            <span className="text-primary font-semibold flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px]">psychology</span>
                              {completedResult.modelName}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => selectVehicleForReport(activeVeh.id)}
                    className="h-10 px-space-lg bg-primary text-on-primary hover:bg-primary-container rounded-lg font-label-md text-label-md font-semibold flex items-center gap-1.5 shadow-sm transition-all whitespace-nowrap"
                  >
                    View Diagnostic Report →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
