import React, { useEffect, useState } from 'react';
import { getProcessingStatus } from '../../api/datasetApi';
import { Card, Btn } from './ui';

export default function DatasetStatusPanel({ dataset, pipelineRunId, onStatus }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const id = dataset?.id;
  useEffect(() => {
    let active = true;
    let timer;
    setState(null);
    setError('');
    if (!id) return;
    const read = async () => {
      try {
        const saved = await getProcessingStatus(id);
        if (!active) return;
        if (pipelineRunId && saved.pipelineRun?.id !== pipelineRunId) {
          setError('A different processing attempt is now active. Reopen SOH & RUL to view its saved status.');
          return;
        }
        setState(saved);
        onStatus?.(saved);
        setError('');
        if (saved.status === 'processing' || ['queued', 'processing'].includes(saved.pipelineRun?.status)) {
          timer = setTimeout(read, 1000);
        }
      } catch (err) {
        if (active) setError(err.message || 'Could not load saved processing status.');
      }
    };
    read();
    return () => { active = false; clearTimeout(timer); };
  }, [id, dataset?.status, pipelineRunId, refresh, onStatus]);

  if (!id) return null;
  const run = state?.pipelineRun;
  const failures = run?.errors || [];
  const unavailable = failures.some((message) => message.includes('service_error_503:MODEL_UNAVAILABLE'));
  return (
    <Card title="Saved upload & processing status" subtitle={dataset.originalFileName}>
      <div className="space-y-3 text-body-sm" aria-live="polite">
        <p>{dataset.recordCount ?? 'Unknown'} source records · {dataset.cycleCount ?? 'Unknown'} discharge cycles</p>
        {error ? <p role="alert" className="text-error">{error}</p>
          : !state ? <p>Loading saved status…</p>
          : <p>Dataset: <strong>{state.status}</strong>. Processing attempt: <strong>{run?.status || 'not started'}</strong>.</p>}
        {unavailable && <p role="status">Model predictions unavailable: no approved model is available. No prediction was created for this attempt.</p>}
        {failures.length > 0 && <ul role="alert" className="text-error">{failures.map((message, i) => <li key={i}>{message}</li>)}</ul>}
        {run && <ul aria-label="Saved pipeline stages" className="space-y-1">
          {Object.entries(run.stages || {}).map(([name, stage]) => (
            <li key={name}>{name.replace(/([A-Z])/g, ' $1')}: {stage.status}</li>
          ))}
        </ul>}
        {(dataset.analysisReport || []).length > 0 && <ul aria-label="Saved analysis results" className="space-y-1">
          {dataset.analysisReport.map((item) => <li key={item.id}>{item.name}: {item.status}. {item.reason}</li>)}
        </ul>}
        <Btn variant="secondary" onClick={() => setRefresh((n) => n + 1)}>Refresh saved status</Btn>
      </div>
    </Card>
  );
}
