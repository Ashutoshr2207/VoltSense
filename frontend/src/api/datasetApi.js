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
