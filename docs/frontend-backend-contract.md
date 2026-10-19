# Frontend ↔ Express contract

The frontend uses real API clients, not mock AppContext fixtures. [API specification](api-specification.md) lists routes; [runtime contract](rebuild-contract.md) defines pipeline behavior.

JSON requests use Content-Type: application/json. Authenticated requests use Authorization: Bearer <token>. Multipart upload uses browser-generated Content-Type/boundary; fields are file (CSV/XLS/XLSX) and sourceType (default user_upload; also demo_dataset/synthetic_dataset). A selected owned vehicle is required. Manufacturer is a label, not an adapter selection.

Ordinary controller successes return {success:true,data:...,message:string|null,error:null}. Central errors return {success:false,data:null,message:string,error:{code,details}}. The existing rate-limit middleware is an exception: it returns {success:false,error:{code:"RATE_LIMITED",message}} with 429. Do not assume every error has data/message at the top level.

Serialized primary keys are strings named id. Foreign keys retain userId, vehicleId, datasetId, pipelineRunId and predictionId. Dates are ISO UTC strings. Values stay numeric or null; zero RUL is valid. Numeric output does not carry unit suffixes. Confidence is currently uncalibrated with value=null. Vehicle batteryCapacityKWh is pack metadata and never an Ah reference.

POST upload returns data.dataset with parsed metadata and uploaded status. POST process returns data={pipelineRunId,datasetId,status:"queued",startedAt}. GET status returns data={datasetId,status,pipelineRun}. Dataset statuses: uploaded/processing/processed/failed. Run statuses: queued/processing/completed/failed. Stages: waiting/processing/completed/failed/skipped.

waitForProcessing polls every 500 ms by default (60-second client deadline). Both BatteryHealth upload and AppContext.switchBattery pass the returned pipelineRunId. The existing dataset-status endpoint returns the latest attempt; the client rejects an ID mismatch before invoking onStatus or reporting completion. There is no separate run-specific HTTP endpoint. Success requires dataset=processed AND run=completed. Run errors surface unchanged; timeout says processing is ongoing. Refresh reads persisted state and never automatically retries.

Predictions list data={predictions,total,page,pageSize}; dataset list data={datasets,total}. Only committed predictions are returned. Measured SOH and model SOH remain distinct (measuredSoh/modelSoh within prediction; empirical/predicted in structuredAnalysis). An unavailable-model failure creates no prediction. Existing predictions from other runs must not be displayed as the failed upload's result.
