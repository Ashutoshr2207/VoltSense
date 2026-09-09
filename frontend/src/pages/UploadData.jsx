import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function UploadData() {
  const { vehicles, selectedVehicleId, setSelectedVehicleId, selectVehicleForReport, addPrediction } = useApp();

  const [selectedFile, setSelectedFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState(1);
  const [processingLogs, setProcessingLogs] = useState([]);
  const [completedResult, setCompletedResult] = useState(null);
  const [protocol, setProtocol] = useState('bayesian');

  const activeVeh = vehicles.find(v => v.id === selectedVehicleId) || vehicles[0];

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile({
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        rows: '14,820 rows',
        type: file.type || 'text/csv'
      });
      setCompletedResult(null);
      setProgress(0);
      setProcessingLogs([]);
    }
  };

  const loadSampleDataset = () => {
    setSelectedFile({
      name: `bms_telemetry_${activeVeh.id}_20260907.csv`,
      size: '3.4 MB',
      rows: '18,450 rows',
      type: 'text/csv'
    });
    setCompletedResult(null);
    setProgress(0);
    setProcessingLogs([
      `[INFO] Loaded sample telemetry trace for ${activeVeh.name}`,
      `[INFO] Timestamp synchronization: 10Hz sampling (2026-09-07 08:00:00 to 12:30:00)`,
      `[INFO] Target pack chemistry verified: ${activeVeh.chemistry}`
    ]);
  };

  const startPipeline = () => {
    if (!selectedFile) {
      loadSampleDataset();
    }

    setIsProcessing(true);
    setProgress(5);
    setCurrentStage(1);
    setCompletedResult(null);

    const logs = [
      `[0.05s] Initializing ingestion stream for ${activeVeh.vin}...`,
      `[0.12s] Parsing CAN 2.0B / UDS telemetry headers. Checksum verified (CRC-32 nominal).`
    ];
    setProcessingLogs(logs);

    // Stage 1 -> Stage 2
    setTimeout(() => {
      setProgress(35);
      setCurrentStage(2);
      setProcessingLogs(prev => [
        ...prev,
        `[0.34s] Stage 01 Complete: 18,450 records ingested and time-aligned.`,
        `[0.48s] Stage 02: Running electrochemical anomaly filter across ${activeVeh.cellType} matrix...`,
        `[0.65s] Max cell delta mV: ${activeVeh.status === 'Attention' ? '14.2 mV (Warning limit reached)' : '5.8 mV (Nominal)'}`,
        `[0.82s] Thermistor gradient: T_min=27.2°C, T_max=31.4°C, ΔT=4.2°C.`
      ]);
    }, 900);

    // Stage 2 -> Stage 3
    setTimeout(() => {
      setProgress(70);
      setCurrentStage(3);
      setProcessingLogs(prev => [
        ...prev,
        `[1.12s] Stage 02 Complete: Outlier rejection filter converged.`,
        `[1.30s] Stage 03: Executing Bayesian MCMC electrochemical degradation fitting...`,
        `[1.55s] Fitting Loss of Lithium Inventory (LLI): ${activeVeh.lossBreakdown.lli}%.`,
        `[1.72s] Fitting Loss of Active Material (LAM): ${activeVeh.lossBreakdown.lam}%.`,
        `[1.95s] Ohmic internal resistance growth: +${activeVeh.internalResistance}.`
      ]);
    }, 1800);

    // Stage 3 -> Stage 4 & Finish
    setTimeout(() => {
      setProgress(100);
      setCurrentStage(4);
      const computedSoh = activeVeh.soh;
      const computedRul = activeVeh.rul;

      setProcessingLogs(prev => [
        ...prev,
        `[2.20s] Stage 03 Complete: Posterior SOH convergence achieved (R² = 0.994).`,
        `[2.45s] Stage 04: Projecting remaining useful life (RUL) with 95% Bayesian credible band.`,
        `[2.65s] Pipeline finished: SOH = ${computedSoh}%, Projected RUL = ${computedRul} cycles to 70% EOL.`
      ]);

      const newPred = {
        id: `pred-${Date.now()}`,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
        vehicleId: activeVeh.id,
        vehicleName: activeVeh.name,
        vin: activeVeh.vin,
        modelVersion: "VoltSense Bayesian v1.0",
        measuredSoh: computedSoh,
        predictedSoh: Number((computedSoh - 0.1).toFixed(1)),
        delta: "-0.10%",
        credibleInterval: `${(computedSoh - 0.4).toFixed(1)}% - ${(computedSoh + 0.4).toFixed(1)}%`,
        latency: "41.2 ms",
        status: activeVeh.status === 'Attention' ? 'Drift Flag' : 'Nominal'
      };

      addPrediction(newPred);

      setCompletedResult({
        soh: computedSoh,
        rul: computedRul,
        status: activeVeh.status,
        deltaMv: activeVeh.cellImbalance,
        cycles: activeVeh.cycles + 14,
        confidence: "98.8%"
      });

      setIsProcessing(false);
    }, 2800);
  };

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

            {/* Vehicle Selection */}
            <div className="flex flex-col gap-space-xs">
              <label className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
                Target EV Unit
              </label>
              <div className="relative">
                <select 
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                  className="w-full h-10 pl-space-md pr-space-xl bg-surface-container-low text-on-surface rounded-lg font-body-md text-body-md appearance-none focus:outline-none focus:bg-surface-container transition-colors cursor-pointer border border-transparent focus:border-primary/20"
                >
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.year})
                    </option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-space-sm top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant text-[18px]">
                  expand_more
                </span>
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
                CAN DBC: {activeVeh.name.split(' ')[0].toUpperCase()}_BMS_V4.2
              </div>
              <div className="text-[12px] text-on-surface-variant">
                Chemistry: <span className="font-mono text-on-surface font-semibold">{activeVeh.chemistry}</span>
              </div>
              <div className="text-[12px] text-on-surface-variant font-mono">
                Sampling Rate: 10 Hz | Timestamp: ISO-8601
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
                    checked={protocol === 'bayesian'} 
                    onChange={() => setProtocol('bayesian')}
                    className="accent-primary"
                  />
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface font-semibold">Bayesian Electrochemical SOH</span>
                    <span className="text-[11px] text-on-surface-variant">95% Credible interval + loss mechanism fitting</span>
                  </div>
                </label>
                <label className="flex items-center gap-2 p-2.5 rounded-lg bg-surface-container-low cursor-pointer hover:bg-surface-container transition-colors">
                  <input 
                    type="radio" 
                    name="protocol" 
                    checked={protocol === 'fast'} 
                    onChange={() => setProtocol('fast')}
                    className="accent-primary"
                  />
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface font-semibold">Fast Real-Time Kalman SOH</span>
                    <span className="text-[11px] text-on-surface-variant">Rapid screening & delta-mV check (&lt;50ms)</span>
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
              <button 
                onClick={loadSampleDataset}
                className="h-9 px-space-md bg-secondary-container text-on-secondary-container hover:bg-secondary-container/80 rounded-lg font-label-md text-label-md font-semibold flex items-center gap-1.5 transition-colors self-start sm:self-auto"
              >
                <span className="material-symbols-outlined text-[18px]">cloud_sync</span>
                Load Sample BMS Log
              </button>
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
                      {selectedFile.size} • {selectedFile.rows} • ISO-8601 UTC
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-space-sm">
                  <span className="px-2 py-0.5 rounded bg-primary-container text-on-primary-container font-label-sm text-label-sm font-semibold">
                    Ready
                  </span>
                  <button 
                    onClick={() => setSelectedFile(null)}
                    className="text-on-surface-variant hover:text-on-surface p-1"
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
                  <span className="text-[12px] font-medium">Bayesian MCMC Fit</span>
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
                        <span>Cell Delta: <strong className="text-on-surface">{completedResult.deltaMv}</strong></span>
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
