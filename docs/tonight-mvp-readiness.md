# Tonight's MVP readiness

Verified 2026-10-19 on branch `voltsense`.

**Ready for an honest ingestion/status/persistence demonstration. Not ready for live model SOH/RUL predictions. Production inference remains disabled.** No model was trained, approved, deployed or replaced in this task. No XJTU holdout was scored or used for fitting. No API path/method/envelope, database schema/relationship, threshold or deployment gate changed.

## Starting state and scope

Read `AGENTS.md`, the [latest experiment report](ml-training-experiment-report.md), current Git status and full tracked diff before editing. Preserved the user's existing `AGENTS.md` changes and the untracked experiment report, `dense_experiment.py` and its tests. Those are earlier work, not additions from this stabilization batch.

The failed protocol-matched experiment remains unchanged: B0006 training, previously inspected B0018 evaluation; capacity RMSE 0.0661/0.0677 Ah versus persistence 0.0230 Ah. Missing compatible validation cells and independent observed-EOL evidence remain scientific blockers. Completing the application flow does not resolve them.

## Confirmed defects fixed

| Priority | Confirmed defect | Small correction |
|---|---|---|
| 1 | Dashboard called dataset hooks below its no-vehicle early return; adding/deleting the first vehicle changed React hook order | Execute hooks consistently, including the no-vehicle state |
| 1 | A failed upload showed its error during that session, but detailed status/stages were not independently rendered after refresh without a newly chosen file | Add a saved-status panel that reads the existing authenticated status endpoint on mount and shows persisted errors, stages and analysis results |
| 1 | Vehicle-detail fetch errors were caught in context, so the existing hook's error state never activated | Propagate failure to the hook; render the error/retry control in the empty-analysis branch too |
| 2 | Vehicle-list and prediction-history fetch failures could resemble genuinely empty data | Expose local loading/error state with retry; history failures do not display a successful empty-history message |
| 2 | Network failures and HTML/non-JSON API responses exposed vague browser/parser errors | Show actionable connection/configuration or unexpected-response messages; preserve existing 401 token clearing |
| 2 | Vehicle setup silently prefilled an unknown 75-kWh pack capacity and promised calculations regardless of model availability | Leave optional capacity blank; explain kWh versus Ah and the approved-model requirement |
| 2 | An uploaded-but-not-processed dataset was labelled processing; SOH upload without a vehicle was merely disabled | Use the actual uploaded state and provide a vehicle-creation action |

The saved-status panel resumes **read-only** polling for queued/processing runs. It never calls process/upload/predict on mount or refresh. During an initiated upload it checks the returned `pipelineRunId`; another attempt cannot be reported as that run's outcome. Refresh/reopening the page reads the latest persisted attempt. It stops polling terminal states and cancels on unmount. Communication/input errors remain distinct from a valid `MODEL_UNAVAILABLE` response.

## Verified journey and contracts

| Step | Evidence and expected outcome |
|---|---|
| Register/login | Existing auth tests exercise registration/login/JWT, unauthorized access and ownership. Real upload integration registers and reauthenticates a disposable test account. No credentials are embedded in the new UI code |
| Create/select vehicle | Existing backend permits **one vehicle per account**. UI regressions exercise no vehicle → first vehicle → no vehicle without a hook crash. Optional capacity/SOH are not invented |
| Select upload | CSV/XLS/XLSX remain supported. Choose the separate synthetic 40-record demo file, not raw MAT/ZIP or the unified research catalogue |
| Upload | Existing `POST /api/vehicles/:vehicleId/datasets`, multipart `file` and `sourceType=user_upload`. Backend checks ownership, extension, parsing and quality. Parser/Excel/authorization tests pass |
| Process | Existing `POST /api/datasets/:datasetId/process` returns a run identifier; UI uses it while waiting. No artificial progress or success |
| Status | Existing `GET /api/datasets/:datasetId/status` provides actual dataset/run/stage state. Five Node stages complete for the demo CSV |
| Inference | Express sends 40 validated cycle rows to real FastAPI `POST /predict`. With the current unavailable model, FastAPI responds HTTP 503 JSON `MODEL_UNAVAILABLE`. Feature engineering fails; downstream normalization is not claimed complete |
| Refresh/re-login | Real frontend API-client integration reimports clients, clears/reestablishes auth, and retrieves the saved failed dataset/run. New rendered-component tests verify saved errors/stages survive remount without selecting a file |
| History/predictions | Real backend/frontend integration verifies empty predictions and **zero false prediction documents**, including repeated attempts. A failed run is not a new health report |
| Explanations | Existing backend explanation/ownership/fallback tests pass. With no prediction for this upload, no model explanation is invented. Existing unrelated historical reports must not be presented as this upload's result |

ML transport failures retain their actual reasons: `unreachable`, `timeout`, `invalid_response_content_type`, `invalid_json`, invalid response/error schemas, HTTP 422 input failures, or HTTP 503 `MODEL_UNAVAILABLE`. The friendly no-approved-model notice appears only for the corresponding valid 503 model response, alongside the saved technical reason.

## Files changed in this batch

- [`frontend/src/pages/Dashboard.jsx`](../frontend/src/pages/Dashboard.jsx): stable hook order, vehicle-fetch retry, truthful uploaded status.
- [`frontend/src/pages/BatteryHealth.jsx`](../frontend/src/pages/BatteryHealth.jsx): saved status in both analysis branches, run binding, no-vehicle action and visible detail errors.
- [`frontend/src/components/common/DatasetStatusPanel.jsx`](../frontend/src/components/common/DatasetStatusPanel.jsx): new persisted-status/stages/errors panel using the existing endpoint.
- [`frontend/src/context/AppContext.jsx`](../frontend/src/context/AppContext.jsx): visible vehicle/history errors, history loading state, detail-error propagation.
- [`frontend/src/pages/Insights.jsx`](../frontend/src/pages/Insights.jsx): history loading/error/retry instead of a misleading empty result.
- [`frontend/src/api/api.js`](../frontend/src/api/api.js): clear connection/non-JSON errors; existing JWT/multipart/envelope behavior retained.
- [`frontend/src/components/common/AddVehicleModal.jsx`](../frontend/src/components/common/AddVehicleModal.jsx): no assumed pack capacity; honest unit/model guidance.
- [`frontend/smoke/mvp.test.jsx`](../frontend/smoke/mvp.test.jsx): 15 focused component/API regressions.
- [`frontend/smoke/context.test.jsx`](../frontend/smoke/context.test.jsx): 2 context-level failure/retry regressions.
- This readiness document.

Backend and Python application code needed no change. Existing model artifacts, strict loader, target/gate definitions and datasets were preserved. SHA-256 verification matched **44 protected pre-existing ML/data files** and **all 22 indexed latest-experiment files**. Existing API/database compatibility is additionally exercised by the backend and real upload-client suites. No production database records were created or deleted by these verification runs.

## Actual verification results

| Verification | Result |
|---|---|
| Python suite excluding estimator-fitting workflow test | **73 passed**, 5.23 s; no estimators fitted |
| Full backend suite, real ML test enabled | **18 suites / 127 tests passed**, 26.54 s |
| Full frontend suite, real upload-client test enabled | **5 suites / 40 tests passed**, no skips, 4.14 s |
| Final frontend production build | **Passed**, 71 modules, 4.76 s |
| Git whitespace check | `git diff --check` passed; existing LF/CRLF notices are informational |
| Live FastAPI | HTTP 200 `/health`, `status: error`, `models_loaded: false`: reachable and inference unavailable |
| Live Express | HTTP 200 `/api/health`, database connected |
| Live Vite | HTTP 200 at `http://localhost:5173` |

Backend tests use disposable in-memory MongoDB and ephemeral/local FastAPI; external provider traffic is blocked. The opt-in frontend upload-client integration uses another disposable MongoDB, an ephemeral Express listener and the already-running unapproved FastAPI at port 8000. It uses the real frontend API modules rather than mocked ML responses. Existing user services were not restarted or stopped.

The initial build could not replace existing `dist` files inside the sandbox. The approved build outside the sandbox passed; no source workaround or dependency change was needed. Existing jsdom WebGL/canvas warnings and Vite's >500-kB chunk warning remain. Browser automation reported no available browser surfaces, so a real browser click-through/screenshot/mobile/WebGL inspection is **not claimed**.

### Re-run verification

From `ml-service` using the interpreter with the existing test dependencies:

```powershell
python -B -m pytest tests --ignore=tests/test_training_workflow.py -q --tb=short -p no:cacheprovider
```

The excluded test intentionally fits tiny synthetic estimators. All remaining Python tests were run; NASA experiments were not rerun.

From `backend`:

```powershell
$env:TEST_MONGODB_URI = ''
$env:MONGOMS_RUNTIME_DOWNLOAD = 'false'
$env:RUN_REAL_ML_TESTS = '1'
npm test
```

From `frontend`, with the unapproved FastAPI reachable at port 8000:

```powershell
$env:TEST_MONGODB_URI = ''
$env:MONGOMS_RUNTIME_DOWNLOAD = 'false'
$env:RUN_REAL_UPLOAD_TESTS = '1'
npm run test:smoke -- --no-cache
npm run build
```

Equivalent direct Node entry points were used for the recorded backend/frontend runs. No dependencies were installed/upgraded. The cached MongoDB binary must already be available for these offline test commands; never point `TEST_MONGODB_URI` at the application database because tests clear their disposable collections.

## Exact startup and demonstration

All three services were already reachable at verification time. First check them; **do not start duplicate listeners**:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod http://localhost:5000/api/health
```

If a service is stopped, start it in its own terminal. From the repository root:

```powershell
# Terminal 1
cd R:\PP\VoltSense\ml-service
.\.venv\Scripts\Activate.ps1
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

```powershell
# Terminal 2
cd R:\PP\VoltSense\backend
npm run dev
```

If prompted for optional Groq/OCM keys, press Enter to skip. Neither is required for this unavailable-model upload demo. The actual Node startup still needs a working MongoDB connection and JWT configuration before accepting requests.

```powershell
# Terminal 3
cd R:\PP\VoltSense\frontend
npm run dev
```

Required local configuration: backend `MONGODB_URI`, `MONGODB_DATABASE`, `JWT_SECRET`, `ML_SERVICE_URL=http://127.0.0.1:8000`, `CORS_ORIGIN=http://localhost:5173`. Frontend `VITE_API_URL`, when set, must include `/api` (normally `http://localhost:5000/api`); otherwise that is its existing default. Restart Vite after changing its environment. Leave `ML_MODEL_MANIFEST` unset or pointing to an existing **unapproved** manifest. Do not edit approval flags.

Secret-safe inspection confirmed MongoDB/JWT configuration exists, the ML URL/CORS origin match those local addresses, and the live database reports connected. The existing JWT secret is shorter than the backend's 32-character production requirement; it was not revealed or changed. This is a local development demonstration, **not a production-readiness assertion**. Configure a suitable secret separately before using `NODE_ENV=production`.

If Windows rejects port 8000 with WinError 10013, use a free permitted port such as 8001 for FastAPI and set `$env:ML_SERVICE_URL='http://127.0.0.1:8001'` in the backend terminal **before startup**. Use the matching health URL. The opt-in frontend integration test currently expects 8000; a manual alternative-port demo does not change that test configuration. Do not kill another application or disable network protections.

### Demo script

1. Open **http://localhost:5173**. Register a dedicated fresh demo account and log in. Use a fresh account rather than seeded/shared demo history if you need a clean no-predictions demonstration.
2. On Dashboard choose **Add vehicle**. Enter `Synthetic cycle demo`. Leave unknown optional capacity, SOH and cycle values blank. Save. Existing accounts with a vehicle should select/use it; the current backend permits one vehicle per account.
3. Open **SOH & RUL**. Choose **CSV / Excel**, then `R:\PP\VoltSense\sample-data\demo_battery_cycles.csv`. This is **synthetic demo data**, not measured EV/NASA evidence. The preview should show **40 rows**, recognized cycle/capacity headers and preliminary eligibility. No model result is implied by eligibility.
4. Click **Upload & analyze** once. The app sends the existing source type automatically. In **Saved upload & processing status**, inspect actual stages. Five Node stages complete; inference fails honestly with `ML inference unavailable: service_error_503:MODEL_UNAVAILABLE`. The panel explains that model predictions are unavailable. There should be no invented SOH/RUL result.
5. Refresh the browser, log in again if needed, and reopen **SOH & RUL** (page selection itself is not persisted). The saved filename, counts, failed attempt, stages and reason remain visible **without choosing a file again**. **Refresh saved status** is read-only.
6. Open **Insight → Past Analyses**. In a fresh account there should be no battery evaluation records for the failed attempt. Select **Activity Timeline** for the persisted upload. An explanation of a nonexistent model result should not appear. History fetch errors, if any, show retry rather than an apparently successful empty history.
7. To demonstrate retry, select the same CSV again and use **Upload & analyze**. Identical bytes reuse the existing dataset; explicit processing creates a new attempt, still unavailable. Refresh alone must not create another run or prediction.

To reset, the simplest option is a separate dedicated account. If removing test uploads is necessary, use the existing authenticated dataset delete API for the **idle demo dataset only**, or the vehicle delete control in its dedicated disposable account. Do not delete collections, raw NASA files, models or unrelated user records; active processing blocks deletion.

## Remaining manual checks and limitations

- Perform the above visual click-through in a normal browser, including sign-out/sign-in and page refresh. Automated tests verified the React states and the real API-client journey, not browser layout/file-picker/WebGL rendering.
- Check the selected vehicle label, saved-status text wrapping, mobile navigation, and optional 3D illustration on the presentation machine. The 3D layout is illustrative, not measured per-module telemetry.
- Ensure the frontend opens exactly the CORS-allowed origin and that MongoDB remains available during the presentation. Service health was checked once, not monitored indefinitely.
- Existing previously saved or seeded predictions can remain in other accounts. They are not results from this failed upload. Do not run the demo seeder to manufacture apparent model success.
- Successful ingestion is demonstrable; approved live inference and explanations of new predictions are unavailable. Neither failed candidate beats persistence; one reused test cell is not independent generalization evidence. EV-pack validation has not been performed.
- This implementation supports one backend worker with startup reconciliation, local raw-file storage and persisted run state; it is not a distributed durable job service. Those architectural limits were left unchanged.

**Presentation boundary:** demonstrate a functioning authenticated data pipeline with transparent model gating and persisted errors. Present actual offline metrics separately. Do not claim a live predictive model has passed validation.
