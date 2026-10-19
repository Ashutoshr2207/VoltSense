# Implemented Express API

Base /api, local default http://localhost:5000/api. Protected endpoints require Authorization: Bearer <jwt>. JSON bodies use application/json; upload uses multipart. Public paths and shapes are unchanged. [Runtime contract](rebuild-contract.md), [upload examples](api-reference.md) and source routes/controllers define actual behavior. HTTPS termination is a deployment responsibility, not a local server feature.

Controller envelope: {success:true,data:...,message:string|null,error:null}; central errors: {success:false,data:null,message,error:{code,details}}. Existing rate-limit responses are a documented exception (see [errors](error-handling.md)). Entity primary keys serialize as id strings; foreign keys keep explicit names; dates are ISO UTC strings.

| Method/path | Body/query | Success data |
|---|---|---|
| POST /auth/register | {name,email,password} | {user,token}, 201 |
| POST /auth/login | {email,password} | {user,token} |
| POST /auth/demo | No body; controlled by DEMO_ACCOUNT_ENABLED | {user,token} |
| GET /auth/me | Auth | {user} |
| POST /auth/logout | Auth; client removes its token | null |
| GET /users/me | Auth | {user} |
| PATCH /users/me | Profile/preferences fields | {user} |
| GET /vehicles | Optional status/manufacturer/search | {vehicles,total} |
| POST /vehicles | Vehicle metadata, e.g. {manufacturer,model,nickname} | {vehicle}, 201; one vehicle/account |
| GET /vehicles/:vehicleId | Owned vehicle | {vehicle} |
| PATCH /vehicles/:vehicleId | Vehicle metadata | {vehicle} |
| DELETE /vehicles/:vehicleId | Idle owned vehicle | null; owned cascade |
| GET /vehicles/:vehicleId/datasets | Owned vehicle | {datasets,total} |
| POST /vehicles/:vehicleId/datasets | Multipart file + sourceType | {dataset}, 201 |
| GET /datasets/:datasetId | Owned dataset | {dataset} |
| DELETE /datasets/:datasetId | Idle owned dataset | null; owned cascade |
| POST /datasets/:datasetId/process | Optional {batteryId} | {pipelineRunId,datasetId,status:"queued",startedAt}, 202 |
| GET /datasets/:datasetId/status | Owned dataset | {datasetId,status,pipelineRun}; latest attempt |
| GET /vehicles/:vehicleId/predictions | page=1, pageSize=20 (max100); newest first | {predictions,total,page,pageSize} |
| GET /predictions/:predictionId | Committed owned result | {prediction}; includes structuredAnalysis |
| GET /predictions/:predictionId/analysis | Committed owned result | Structured analysis directly |
| GET /predictions/:predictionId/insights | Committed owned result | {insight} |
| POST /predictions/:predictionId/explain | Existing result | {explanation} |
| GET /vehicles/:vehicleId/anomalies | Owned vehicle | Aggregated anomaly data (anomalyRoutes.js) |
| GET /notifications | Optional read=true/false | {notifications,unreadCount,total} |
| PATCH /notifications/:notificationId/read | Owned notification | {notification} |
| GET /charging-stations | Location query; see chargingController.js | Provider results |
| GET /health | Public | Application/database status (healthController.js) |

Upload supports CSV/XLS/XLSX only, local storage, first Excel worksheet. sourceType defaults user_upload and also permits demo_dataset/synthetic_dataset. Node parses before quality assessment and persistence; malformed files fail rather than producing null parsed metadata. Manufacturer labels do not select a mapping adapter. No JSON/Parquet/MAT/image upload support. Dataset details include cycleTable, quality, analysisReport and local storage reference; these are not object-store URLs.

Processing status differs by entity: dataset uploaded/processing/processed/failed, run queued/processing/completed/failed. Stage names and statuses are in [runtime contract](rebuild-contract.md). There is no separate run-ID status route; clients compare returned pipelineRun.id against the initiated run. An active dataset cannot be processed/deleted again. Explicit retry creates a new attempt. Same-byte upload for one vehicle reuses its dataset.

Prediction documents contain model identity, nested prediction (soh/modelSoh/measuredSoh,currentCycle,rulCycles,estimatedEOLCycle,eolThreshold=80,mlStatus/mlReason and other existing fields), confidence, metrics, degradation, diagnostics and cycleTable. Historical arrays are measured; predicted curves are empty unless actually supplied. Confidence is uncalibrated/null. estimatedEOLCycle can precede currentCycle after observed EOL. Diagnostics-only committed results have null lifetime values; failed eligible inference creates no result. Only completed runs' results appear in history/insights.

V3 is trained/evaluated but unapproved. FastAPI's 503 MODEL_UNAVAILABLE is recorded as an asynchronous run failure; GET status still returns 200 with persisted errors. It is not a synchronous 422 from POST process. [ML response](ml-backend-contract.md) is a flat internal contract, not this public envelope. [Validation rules](validation-rules.md) and [final handover](final-stabilization.md) cover limitations and demonstration.
