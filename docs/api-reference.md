# Upload and status API examples

Examples below illustrate shape, not measured predictions. Complete [route inventory](api-specification.md); [frontend contract](frontend-backend-contract.md).

## Upload

POST /api/vehicles/:vehicleId/datasets with Bearer authentication, multipart file=demo_battery_cycles.csv and sourceType=user_upload. Browser FormData sets the boundary. CSV/XLS/XLSX are supported. An owned selected vehicle is required.

The synthetic file has battery_id,Cycle,Capacity,mean_voltage,mean_current,mean_temperature,discharge_duration,type. Units: capacity Ah, voltage V, current A, temperature C, duration seconds. It contains 40 consecutive discharges. See [sample README](../sample-data/README.md) for exact values and UI steps.

201 response is {success:true,data:{dataset:<serialized dataset>},message:"Telemetry file uploaded successfully",error:null}. Dataset fields include id,userId,vehicleId,originalFileName,fileType,fileSize,sourceType,recordCount,cycleCount,cycleTable,dataQuality,status,analysisReport and timestamps. Its storage field is:

~~~json
{"provider":"local","rawUrl":"/uploads/raw/68a02a11b7c4d81234567891/randomized.csv","processedUrl":null}
~~~

rawUrl is a validated backend-local reference, not a public download or S3 URI. schemaVersion is EV_BMS_Telemetry_V1.0. Upload performs parsing/quality assessment before storing the dataset. Invalid files return central errors; identical bytes reuse the existing owned dataset.

## Process and poll

POST /api/datasets/:datasetId/process, JSON {} or {"batteryId":"SYNTHETIC_DEMO_CELL_001"}.

~~~json
{"success":true,"data":{"pipelineRunId":"68a05d22b7c4d81234567893","datasetId":"68a04c11b7c4d81234567892","status":"queued","startedAt":"2026-10-19T10:00:00.000Z"},"message":"Data pipeline execution initiated","error":null}
~~~

GET /api/datasets/:datasetId/status returns {success:true,data:{datasetId,status,pipelineRun},message:null,error:null}. pipelineRun contains id, userId, vehicleId, datasetId, status, stages, errors and timestamps. Stages validation/schemaMapping/cleaning/missingValueHandling/outlierDetection reflect actual Node work; featureEngineering/normalization reflect Python execution. Compare its id with the returned pipelineRunId before rendering progress. The endpoint returns the latest attempt, not a historical requested run.

With an accessible unapproved service, status becomes failed; pipelineRun.errors includes "ML inference unavailable: service_error_503:MODEL_UNAVAILABLE". Five ingestion stages complete; ML stages fail. GET status itself remains 200. Refresh or re-login retrieves that persisted failure without creating predictions. A transport failure instead says unreachable/timeout; malformed JSON is distinct.

## History and explanations

GET /api/vehicles/:vehicleId/predictions returns data={predictions,total,page,pageSize}. After this failed upload in a fresh demo account, predictions=[] and total=0. GET /api/predictions/:predictionId returns data={prediction}; /analysis returns the structured analysis; /insights returns {insight}; POST /explain returns {explanation}. These require an existing committed owned result; none is invented for MODEL_UNAVAILABLE. Manufacturer chemistry, pack validation, calibrated confidence and forecast curves must not be inferred from illustrative payloads.

Delete only the idle demo dataset through DELETE /api/datasets/:datasetId, or remove its disposable vehicle. Owned dependent records and the bounded raw reference are cleaned; unrelated files/owners are preserved. No file reference is required for metadata-only records. Unsafe present references are rejected.
