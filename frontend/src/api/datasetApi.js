import apiRequest from "./api";

export async function uploadDataset(vehicleId, file, sourceType = "user_upload") {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("sourceType", sourceType);

  const response = await apiRequest(`/vehicles/${vehicleId}/datasets`, {
    method: "POST",
    body: formData
  });
  return response.data.dataset;
}

export async function triggerProcessing(datasetId, options = {}) {
  const response = await apiRequest(`/datasets/${datasetId}/process`, {
    method: "POST",
    body: JSON.stringify(options),
    headers: { "Content-Type": "application/json" }
  });
  return response.data; // { pipelineRunId, datasetId, status, startedAt }
}

export async function getProcessingStatus(datasetId) {
  const response = await apiRequest(`/datasets/${datasetId}/status`);
  return response.data; // { datasetId, status, pipelineRun }
}

export async function fetchDatasetsForVehicle(vehicleId) {
  const response = await apiRequest(`/vehicles/${vehicleId}/datasets`);
  return response.data; // { datasets, total }
}

// Poll actual persisted state; waiting never implies successful processing.
export async function waitForProcessing(datasetId, { pipelineRunId, onStatus, intervalMs = 500, timeoutMs = 60000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const state = await getProcessingStatus(datasetId);
    if (pipelineRunId && state.pipelineRun?.id !== pipelineRunId) throw new Error('A different processing attempt is now active. Refresh the dataset status.');
    onStatus?.(state);
    if (state.status === 'failed' || state.pipelineRun?.status === 'failed') {
      throw new Error(state.pipelineRun?.errors?.join('; ') || 'Dataset processing failed.');
    }
    if (state.status === 'processed' && state.pipelineRun?.status === 'completed') return state;
    if (Date.now() >= deadline) throw new Error('Processing is still running. Refresh to check its status.');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
