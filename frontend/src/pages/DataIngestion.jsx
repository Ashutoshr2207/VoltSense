import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import useVehicleDetail from '../hooks/useVehicleDetail';
import {
  uploadDataset,
  triggerProcessing,
  fetchDatasetsForVehicle,
  waitForProcessing,
  deleteDataset
} from '../api/datasetApi';
import CsvUploadPanel from '../components/common/CsvUploadPanel';
import DatasetStatusPanel from '../components/common/DatasetStatusPanel';
import { Card, PageHeader, EmptyState, ErrorState, Btn, Badge, ConfirmDialog } from '../components/common/ui';
import { formatTimestampIST } from '../utils/mappers';

export default function DataIngestion() {
  const { setCurrentTab, refreshVehicles, refreshPredictions, setIsAddVehicleModalOpen } = useApp();
  const { vehicle: v, loading, error, retry } = useVehicleDetail();

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [uploadStage, setUploadStage] = useState('');
  const [latestDs, setLatestDs] = useState(null);
  const [datasetsList, setDatasetsList] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [pipelineRunId, setPipelineRunId] = useState(null);
  const [datasetToDelete, setDatasetToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const onFileChange = () => {
    setUploadError('');
    setUploadSuccess('');
  };

  const loadDatasets = useCallback(async () => {
    if (!v?.id) return;
    setLoadingList(true);
    try {
      const res = await fetchDatasetsForVehicle(v.id);
      const list = res?.datasets || [];
      setDatasetsList(list);
      if (list.length > 0 && !latestDs) {
        setLatestDs(list[0]);
      }
    } catch (err) {
      console.warn('Failed to fetch vehicle datasets:', err);
    } finally {
      setLoadingList(false);
    }
  }, [v?.id, latestDs]);

  useEffect(() => {
    loadDatasets();
  }, [v?.id, loadDatasets]);

  const onSavedStatus = useCallback((state) => {
    setLatestDs((previous) =>
      previous?.id === state.datasetId && previous.status !== state.status
        ? { ...previous, status: state.status }
        : previous
    );
  }, []);

  const handleAnalyze = async (file) => {
    if (!file || !v?.id) return;
    setUploading(true);
    setUploadError('');
    setUploadSuccess('');
    setPipelineRunId(null);
    try {
      setUploadStage('Verifying file format…');
      const dataset = await uploadDataset(v.id, file, 'user_upload');
      setUploadStage('Validating schema and telemetry headers…');
      setLatestDs(dataset);
      const run = await triggerProcessing(dataset.id);
      setPipelineRunId(run.pipelineRunId);
      await waitForProcessing(dataset.id, {
        pipelineRunId: run.pipelineRunId,
        onStatus: (state) => {
          const active = Object.entries(state.pipelineRun?.stages || {}).filter(([, stage]) => stage.status === 'processing');
          setUploadStage(active.length ? active.map(([name]) => name.replace(/([A-Z])/g, ' $1')).join(', ') : 'Processing dataset…');
        }
      });
      setUploadStage('Refreshing battery models…');
      if (refreshVehicles) await refreshVehicles();
      if (retry) retry();
      if (refreshPredictions) refreshPredictions();
      await loadDatasets();
      setUploadStage('');
      setUploadSuccess(`Successfully ingested and processed "${file.name}". SOH, RUL, and anomaly metrics are updated.`);
    } catch (err) {
      await loadDatasets();
      setUploadStage('');
      setUploadError(err?.message || 'Failed to process battery dataset.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDataset = async () => {
    if (!datasetToDelete) return;
    setDeleting(true);
    try {
      await deleteDataset(datasetToDelete.id || datasetToDelete._id);
      setDatasetToDelete(null);
      await loadDatasets();
      if (refreshVehicles) await refreshVehicles();
      if (retry) retry();
      if (refreshPredictions) refreshPredictions();
      setUploadSuccess('Dataset removed successfully. Vehicle metrics have been recalibrated.');
      setTimeout(() => setUploadSuccess(''), 4000);
    } catch (err) {
      setUploadError(err?.message || 'Failed to remove dataset.');
    } finally {
      setDeleting(false);
    }
  };

  if (!loading && !v?.id) {
    return (
      <div className="space-y-space-xl pb-16">
        <PageHeader title="Dataset Ingestion" />
        <Card>
          <EmptyState
            title="Add a vehicle before ingesting telemetry"
            text="Create your vehicle profile, then upload battery cycle logs."
            actionLabel="Add vehicle"
            onAction={() => setIsAddVehicleModalOpen(true)}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-space-xl pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-on-surface-variant font-mono text-[11px] uppercase tracking-wider mb-1">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse"></span>
            <span>Data Pipeline</span>
            <span>/</span>
            <span className="text-primary font-semibold">CSV Telemetry Ingestion</span>
          </div>
          <PageHeader
            title="Dataset Ingestion"
            subtitle="Upload EV battery telemetry logs, monitor automated validation stages, and manage ingested files."
          />
        </div>

        <div className="flex items-center gap-2">
          <Btn
            variant="secondary"
            size="sm"
            onClick={() => setCurrentTab('analysis')}
            className="flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px] text-primary">speed</span>
            View SOH & RUL
          </Btn>
          <Btn
            variant="secondary"
            size="sm"
            onClick={() => setCurrentTab('anomalies')}
            className="flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px] text-amber-600">warning</span>
            Check Anomalies
          </Btn>
        </div>
      </div>

      {error && <ErrorState onRetry={retry} />}

      {/* CSV Upload Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">
        <div className="lg:col-span-8 space-y-space-md">
          <CsvUploadPanel
            key={v?.id}
            onAnalyze={handleAnalyze}
            onFileChange={onFileChange}
            uploading={uploading}
            stage={uploadStage}
            error={uploadError}
            success={uploadSuccess}
            disabled={!v?.id}
            serverReport={latestDs?.analysisReport?.length ? latestDs.analysisReport : null}
          />
          <DatasetStatusPanel dataset={latestDs} pipelineRunId={pipelineRunId} onStatus={onSavedStatus} />
        </div>

        {/* Guidance and Format Specs */}
        <div className="lg:col-span-4 space-y-space-md">
          <Card title="Supported CSV Columns" subtitle="Standard EV battery logging format">
            <div className="space-y-3 text-xs">
              <p className="text-on-surface-variant leading-relaxed">
                VoltSense accepts multi-channel telemetry logs. The pipeline parses and aligns:
              </p>
              <ul className="space-y-2 text-on-surface font-mono">
                <li className="flex items-center justify-between p-2 rounded-lg bg-surface-container-low border border-surface-container-highest/60">
                  <span>time / timestamp</span>
                  <span className="text-primary font-bold">Required</span>
                </li>
                <li className="flex items-center justify-between p-2 rounded-lg bg-surface-container-low border border-surface-container-highest/60">
                  <span>voltage / pack_voltage</span>
                  <span className="text-primary font-bold">Required</span>
                </li>
                <li className="flex items-center justify-between p-2 rounded-lg bg-surface-container-low border border-surface-container-highest/60">
                  <span>current / pack_current</span>
                  <span className="text-primary font-bold">Required</span>
                </li>
                <li className="flex items-center justify-between p-2 rounded-lg bg-surface-container-low border border-surface-container-highest/60">
                  <span>temperature</span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Recommended</span>
                </li>
                <li className="flex items-center justify-between p-2 rounded-lg bg-surface-container-low border border-surface-container-highest/60">
                  <span>soc, capacity</span>
                  <span className="text-on-surface-variant">Optional</span>
                </li>
              </ul>
              <div className="pt-2 border-t border-surface-container-highest/60 text-[11px] text-on-surface-variant space-y-1.5">
                <p className="font-semibold text-on-surface">Longitudinal Multi-Period Tracking:</p>
                <p>
                  To track a vehicle's battery health evolving over time across successive uploads, use the sequential 150-day datasets in <code>sample_data/</code>:
                </p>
                <ul className="list-disc pl-4 space-y-0.5 font-mono text-[10px]">
                  <li><code>sample_data/tesla/first.csv</code> (Cycles 1–30, Baseline SOH ~98.5%)</li>
                  <li><code>sample_data/tesla/second.csv</code> (Cycles 31–60, Day 151–300 update)</li>
                  <li><code>sample_data/tesla/third.csv</code> (Cycles 61–90, Day 301–450 update)</li>
                </ul>
                <p className="text-[10px]">
                  Also available for <code>byd_atto/</code>, <code>tata_nexon/</code>, and <code>hyundai_ioniq/</code>. Successive uploads merge seamlessly without resetting baseline capacity.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Ingested Datasets History Table */}
      <Card
        title="Ingested Datasets for this Vehicle"
        subtitle="Manage and review previously uploaded CSV records"
      >
        {loadingList ? (
          <div className="p-8 text-center text-sm text-on-surface-variant font-medium">
            Loading ingested datasets…
          </div>
        ) : datasetsList.length === 0 ? (
          <EmptyState
            icon="folder_open"
            title="No datasets uploaded yet"
            text="Use the upload area above to upload your first EV battery telemetry CSV file."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container-low border-b border-surface-container-highest/80 text-on-surface-variant uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">File Name</th>
                  <th className="py-3 px-4">Uploaded At</th>
                  <th className="py-3 px-4">Records</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Anomalies</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-highest/60">
                {datasetsList.map((ds, idx) => {
                  const dsId = ds.id || ds._id || `${ds.originalFileName || 'dataset'}-${idx}`;
                  const isSuccess = ds.status === 'processed';
                  const isFail = ds.status === 'failed';
                  const unresolved = ds.anomalies?.unresolvedCount || 0;
                  return (
                    <tr key={dsId} className="hover:bg-surface-container-low/50 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-on-surface flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px] text-primary">description</span>
                        <span>{ds.originalFileName || 'telemetry.csv'}</span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-on-surface-variant">
                        {formatTimestampIST(ds.uploadedAt)}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-on-surface">
                        {ds.recordCount ? `${ds.recordCount.toLocaleString()} rows` : '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge tone={isSuccess ? 'good' : isFail ? 'bad' : 'warn'}>
                          {ds.status || 'unknown'}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        {unresolved > 0 ? (
                          <span className="text-amber-700 dark:text-amber-400 font-semibold">{unresolved} flagged</span>
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-400">0 anomalies</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Btn
                          variant="secondary"
                          size="sm"
                          onClick={() => setDatasetToDelete(ds)}
                          className="text-error hover:bg-error/10 hover:border-error/30 text-[11px] py-1 px-2.5"
                        >
                          Delete
                        </Btn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(datasetToDelete)}
        title={`Remove ${datasetToDelete?.originalFileName || 'Dataset'}?`}
        message="This will delete this dataset file and automatically recalibrate your vehicle's health predictions and anomaly logs."
        confirmLabel="Remove File"
        tone="critical"
        onConfirm={handleDeleteDataset}
        onCancel={() => setDatasetToDelete(null)}
      />
    </div>
  );
}
