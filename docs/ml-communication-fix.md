# ML communication failure diagnosis and fix

## Confirmed root cause

At investigation time the frontend (5173) and backend (5000) were listening, but **no service was listening on port 8000**. Node requests to localhost, 127.0.0.1 and IPv6 ::1 all failed with ECONNREFUSED. The configured backend .env ML_SERVICE_URL was already http://127.0.0.1:8000. This was a stopped FastAPI service, not a model-approval rejection, timeout, bad CSV, wrong method, HTML response or request-schema mismatch.

The client catch block also combined fetch/connection failures and JSON decoding failures as unreachable_or_invalid_json. It additionally discarded non-JSON error bodies without identifying an unexpected response. Those classifications are now distinct. The default URL now uses IPv4 loopback to match the documented Uvicorn binding; an explicit ML_SERVICE_URL still takes precedence. No .env file was changed.

Historical process state is not current readiness evidence. Check /health before startup and do not launch a duplicate on the same port. Startup is a separate service responsibility; the Node backend does not launch Python automatically.

## Actual request path

BatteryHealth.handleAnalyze → CsvUploadPanel file selection → datasetApi.uploadDataset (POST /api/vehicles/:vehicleId/datasets, multipart file + sourceType=user_upload) → backend parsing/storage → datasetApi.triggerProcessing (POST /api/datasets/:id/process) → analysisPipelineService → mlClient.predict → POST FastAPI /predict. The payload is {cycleTable, eolThreshold:80, batteryId}, with 40 consecutive parsed cycles for SYNTHETIC_DEMO_CELL_001.

FastAPI validates the complete history and builds causal features before checking the approved artifact. With no approved manifest it returns JSON 503 with detail.code=MODEL_UNAVAILABLE. The backend persists the inference-stage/run failure. datasetApi.waitForProcessing polls GET /api/datasets/:id/status, throws the persisted run error, and BatteryHealth displays it through uploadError. Refresh loads the persisted dataset analysis report. No prediction is persisted for failed inference.

## Direct HTTP evidence after startup

| Request | Status | Content-Type | Response |
|---|---:|---|---|
| GET http://127.0.0.1:8000/health | 200 | application/json | {"status":"error","models_loaded":false} |
| POST http://127.0.0.1:8000/predict using the actual parser-generated demo payload | 503 | application/json | {"detail":{"code":"MODEL_UNAVAILABLE","message":"No approved model configured; legacy artifacts are disabled"}} |

The health status error describes model readiness; HTTP 200 proves the service is reachable. It is not a transport failure. Uvicorn startup/access logs confirmed application startup, GET /health 200 and POST /predict 503. No model flags or artifacts were changed.

## Error distinctions

| Condition | Backend ML reason (existing available/reason response structure retained) |
|---|---|
| Missing service / connection refusal / DNS failure | unreachable |
| Request or response-body deadline expired | timeout |
| HTML, plain text, or missing JSON content type | invalid_response_content_type |
| Invalid JSON despite a JSON content type | invalid_json |
| Invalid prediction schema / unexpected success status | invalid_response |
| Malformed error JSON or incompatible code/status pair | invalid_error_response |
| Valid 503 disabled-model response | service_error_503:MODEL_UNAVAILABLE |
| Valid invalid inference output | service_error_503:INVALID_MODEL_OUTPUT |
| Valid invalid feature/history input | service_error_422:INVALID_ML_INPUT |
| FastAPI request/body validation errors | service_error_422:REQUEST_VALIDATION_ERROR |
| Standard FastAPI wrong-endpoint error | service_error_404 |
| Malformed service base URL | invalid_configuration |

The frontend preserves these reasons; connectivity and malformed responses are never renamed MODEL_UNAVAILABLE. The 20-second default timeout remains configurable through ML_SERVICE_TIMEOUT_MS. Timers are cleared on every path, including response decoding failures.

## Files changed in this communication fix

- backend/src/services/mlClient.js: separate fetch and decoding errors, validate JSON content type and error envelopes/status codes, preserve valid service codes.
- backend/src/config/env.js: default ML endpoint matches IPv4 Uvicorn binding.
- backend/tests/mlClient.test.js: request contract, malformed predictions/errors, HTML/JSON failures, connection refusal, actual abort deadlines during headers/body, configuration/input failures.
- backend/tests/journey.test.js: make the existing successful ML fixture include real status/content-type metadata.
- backend/tests/realMlJourney.test.js: additionally verify every real ingestion stage completed before the inference failure.
- frontend/smoke/processing.test.jsx: verify distinct persisted ML error strings propagate unchanged to the upload display.
- frontend/smoke/upload.integration.test.jsx: opt-in actual frontend API modules → Express → real running FastAPI, with disposable MongoDB and re-login/re-import persistence checks.
- docs/ml-communication-fix.md and ML README: diagnosis, startup and reproduction.

## Executed verification

- Complete backend suite, including real local FastAPI integration: **18 suites / 116 tests passed**.
- Frontend with real upload integration enabled: **3 suites / 21 tests passed**.
- Frontend production build: **passed**. Existing jsdom canvas and bundle-size warnings remain.
- The frontend-client integration uploaded the real synthetic demo file, captured the exact 40-cycle inference payload and JSON 503, verified five completed ingestion stages, then re-imported the clients and logged in again. Persisted status remained failed; one dataset/run existed and zero prediction records existed.
- The backend real-service test separately verified retry creates a second failed attempt without predictions.
- All database integration used a disposable MongoDB, not the configured application database. No models were trained, scientific acceptance criteria altered, production records edited, dependencies installed, or public/database contracts changed.

The initial frontend integration harness needed the existing backend MongoDB binary cache path because it runs from frontend/. Its persistence assertion also needed to wait for worker compensation after the run error was published. Both were corrected and rerun. An initial Vitest invocation accidentally entered watch mode and was replaced with an explicit run command.

A visual browser upload could not be completed: the browser connector exposed no browser, and the native bridge repeatedly returned inconsistent/stale window inventories. The real frontend JavaScript client/API journey passed, but this is not a claim of a visual browser test.

## Exact startup and reproduction commands

Run each service in a separate PowerShell terminal starting at the repository root. Preserve the existing MongoDB/JWT configuration. Leave ML_MODEL_MANIFEST unset for the expected disabled-model demo; never approve a candidate to resolve a transport problem.

Terminal 1 (only when FastAPI is not already running):

~~~powershell
Set-Location ml-service
python -m uvicorn app:app --host 127.0.0.1 --port 8000
~~~

Terminal 2 (restart the existing backend if it is not watching source changes):

~~~powershell
Set-Location backend
$env:ML_SERVICE_URL = 'http://127.0.0.1:8000'
npm run dev
~~~

Terminal 3:

~~~powershell
Set-Location frontend
npm run dev
~~~

Check reachability (models_loaded=false is expected):

~~~powershell
Invoke-RestMethod http://127.0.0.1:8000/health
~~~

Open http://localhost:5173, log into the intended demo account, select its vehicle, then SOH & RUL → Choose CSV / Excel → sample-data/demo_battery_cycles.csv → Upload & analyze. The expected error after five completed ingestion stages is **ML inference unavailable: service_error_503:MODEL_UNAVAILABLE**. An old failed attempt retains its original error; retry/re-upload creates a fresh attempt after the previous worker finishes. Refresh should preserve the new failed state and no model prediction should appear.

The exact parser-generated request was saved for diagnosis at .cache/ml-demo-request.json. From the repository root, while FastAPI is running:

~~~powershell
curl.exe -i -H "Content-Type: application/json" --data-binary "@.cache/ml-demo-request.json" http://127.0.0.1:8000/predict
~~~

Regression commands (existing dependencies and cached MongoDB binary required; no runtime download):

~~~powershell
Set-Location backend
$env:TEST_MONGODB_URI = ''
$env:MONGOMS_RUNTIME_DOWNLOAD = 'false'
$env:RUN_REAL_ML_TESTS = '1'
npm test
Set-Location ../frontend
$env:RUN_REAL_UPLOAD_TESTS = '1'
npm run test:smoke
npm run build
~~~

The opt-in frontend integration requires the unapproved/no-model FastAPI service on 127.0.0.1:8000. It bypasses no approval checks and never connects to the application database. Without the opt-in flags, the real-service tests are skipped rather than requiring Python/services for ordinary smoke runs.

## Current handover

See [final stabilization](final-stabilization.md) for current verification results. The client already compares the returned pipelineRunId against every latest-status response; it never reports another attempt as successful. Node parses CSV/XLS/XLSX into validated histories; Python computes the ordered 13 features. Storage is local, V3 unapproved, legacy artifacts inactive.
