# Implementation and verification report — 2026-10-16

Work stayed on voltsense, based on 120f811. No commits, merges, migrations, production database operations or model training were performed. The externally supplied Battery_DataSet directory and root metadata.csv remain unmodified/untracked. AGENTS.md is unchanged.

## Delivered behavior by batch

1. Authorization/configuration: anomaly ownership enforced, upload authorization runs before file parsing, ML configuration uses the shared environment object, external test fetches blocked, and invented Groq performance benchmarks removed. Later tests also verify invalid JWT rejection and concurrent single-vehicle creation.
2. Ingestion: separate CSV/XLS/XLSX decoding, quote/encoding/format validation, strict finite numeric tokens and headers, exact deduplication, conflict rejection and first-discharge reference. Missing optional signals remain missing; no telemetry-to-capacity fabrication or parser RUL fallback. Identical uploads to one vehicle reuse their dataset.
3. Orchestration: atomic processing claim, actual stage events, missing-file failure, skipped ineligible ML stages, explicit retries, useful failure records and startup reconciliation. No simulated delay. Gap failures identify validation and poor quality.
4. ML: causal 13-feature shared contract, first-reference capped SOH and 80% RUL target, strict approved/hash/version/feature/target artifact loading, response validation and null unverified metrics/confidence. Legacy files stay disabled and unchanged.
5. Persistence: idempotent per-run upserts; only committed predictions, explanations and completion notifications are visible. Failure compensation and in-flight publication guards protect retry/deletion. Owned cascades unlink only bounded exact file references, repair summaries and preserve unrelated data. One worker remains the explicit deployment limit.
6. Training/integration: explicit inspect/split/train/evaluate CLI with train-only preprocessing, battery groups and duplicate-trajectory protection, validation selection, separate final-test reports and baselines. Outputs cannot overwrite existing runs or production models. The frontend polls real status, surfaces failures and separates measured/model values. Lockfile dependencies restored without upgrading manifests.
7. Dataset discovery: the supplied 34-battery raw MAT corpus was inspected read-only; invalid capacities and reference uncertainty are documented. The developer explicitly chose inspection only, leaving native MAT training and reference/exclusion decisions gated.

## Final executed verification

| Check | Result |
|---|---|
| Backend npm test -- --json --outputFile=../.cache/backend-jest.json, with TEST_MONGODB_URI empty and MONGOMS_RUNTIME_DOWNLOAD=false | 17 suites, 101 tests passed |
| Python python -B -m pytest tests -q -p no:cacheprovider | 24 tests passed; no estimator fit |
| Frontend node node_modules/vitest/vitest.mjs run --reporter=dot | 2 suites, 14 tests passed |
| Frontend node node_modules/vite/bin/vite.js build | Passed using locked Vite 5.4.21 |
| Python training.py --help | Passed; no data loading/training |
| Read-only inspect_raw.inspect_directory on the supplied directory | 34 batteries; 44 invalid capacities across 13 batteries; no reversed operation timestamps |
| git diff --check | Passed |
| Git diff for backend/src/models, ml-service/models, frontend/package.json and frontend/package-lock.json | Empty |

Backend verification used disposable in-memory MongoDB, not the configured database. A Windows random-port EACCES interrupted an earlier run; the test harness now requests an OS-selected loopback port and skips disconnected cleanup. Final runs used permitted temporary listeners. A new polling test initially lacked jsdom and was corrected. Both issues were rerun successfully.

Existing jsdom canvas warnings remain in smoke tests; the production build reports the existing large application bundle. No visual browser/hardware test or provider-account integration was performed. Tests simulate approved inference with explicit untrained doubles; these results are not scientific model metrics.

The initial npm ci encountered a locked Rolldown native DLL. The old dependency directory was preserved at .cache/frontend-node-modules-20261016; a second npm ci restored the exact lockfile versions successfully. No unrelated process was terminated.

## Preservation evidence

All original files beneath ml-service/models matched SHA-256 values captured before implementation:

| File | SHA-256 |
|---|---|
| capacity_model.pkl | ca985c14e3a5108e49a29cf961209467ab9b432e6b7d157c40e29fd5bafc7411 |
| capacity_model_comparison.csv | 2c4cb58b6934d23f62694e65efe9bbdfc1a927939a767df6c70fc83881d09081 |
| feature_importance.csv | 98e70e855f22d2b517799a047a473a89ad93844e4c8b7a363c9827e46f3d09d7 |
| model_config.json | ef665c3ef5d61730c1882cece961085985acbb4c76843bf510b1abe6285f9dce |
| rul_model.pkl | 1f68785bca8ec1e2dc9593b886d4ba945d215d99572d7aad345610f8faf6fcf3 |
| rul_model_comparison.csv | a37f1ff06ca747e39fe7171b87809b181f1d332175db177214a5a987c0dce82d |
| soh_model.pkl | 909f08986e2b3f921124b207e5a485364a7d74b7ebfea97410a4639eec892947 |
| soh_model_comparison.csv | b6036c5aa5c319cae55fd0778d65cb6d7d75b584c057c69f8bb8eddb9a13712f |

No .env contents were read into reports or modified. No collection/field definitions or public endpoint paths/shapes changed. The intentional semantic corrections include no fabricated lifetime values, truthful failure/eligibility states, strict legacy-model rejection and the explicitly approved target/feature contract.

## Remaining gates and next step

Use docs/rebuild-contract.md for boundaries and ml-service/README.md for commands. Supply a validated cycle metadata CSV/ZIP before using the training workflow. For the supplied MAT corpus, first review completion criteria, invalid-cycle treatment, battery exclusions and reference validity; no automatic cleanup or reference substitution is implemented. The root protocol metadata.csv is not a cycle table. Original group stop criteria are not substituted for the approved 80% target.

Train and evaluate candidates yourself. Review held-out battery metrics and baselines, then explicitly approve a compatible release manifest before configuring ML_MODEL_MANIFEST. The service intentionally returns MODEL_UNAVAILABLE until that happens. No accuracy or EV-pack generalization is claimed.

Persistence uses compensation/reconciliation, not an atomic transaction across files and MongoDB. Use one backend worker and a persistent configured MongoDB for durable operation; development in-memory fallback remains temporary. Native MAT upload, manufacturer adapters and multi-worker job leasing require separate specifications.

## Changed files

### backend

- backend/src/controllers/datasetController.js
- backend/src/routes/anomalyRoutes.js
- backend/src/routes/vehicleRoutes.js
- backend/src/server.js
- backend/src/services/analysisPersistenceService.js
- backend/src/services/analysisPipelineService.js
- backend/src/services/csvParserService.js
- backend/src/services/datasetService.js
- backend/src/services/deletionService.js
- backend/src/services/groqService.js
- backend/src/services/insightService.js
- backend/src/services/mlClient.js
- backend/src/services/notificationService.js
- backend/src/services/predictionService.js
- backend/src/services/resourceLock.js
- backend/src/services/storageService.js
- backend/src/services/telemetryFileService.js
- backend/src/services/vehicleService.js
- backend/tests/authorization.test.js
- backend/tests/deletion.test.js
- backend/tests/explanations.test.js
- backend/tests/journey.test.js
- backend/tests/mlClient.test.js
- backend/tests/parserContract.test.js
- backend/tests/pipeline.test.js
- backend/tests/setup.js

### frontend

- frontend/smoke/processing.test.jsx
- frontend/src/api/datasetApi.js
- frontend/src/context/AppContext.jsx
- frontend/src/pages/BatteryHealth.jsx
- frontend/src/utils/mappers.js

### ml

- ml-service/ML_LEAKAGE_AUDIT.md
- ml-service/README.md
- ml-service/app.py
- ml-service/audit_pipeline.py
- ml-service/dataset.py
- ml-service/features.py
- ml-service/inspect_raw.py
- ml-service/model_loader.py
- ml-service/tests/test_dataset.py
- ml-service/tests/test_inference.py
- ml-service/tests/test_raw_inspection.py
- ml-service/training.py

### documentation

- .gitignore
- README.md
- docs/README.md
- docs/dataset-baseline.md
- docs/rebuild-contract.md
- docs/rebuild-verification.md

## Executed complete data-to-model workflow — latest result

This section supersedes the earlier no-training/read-only gates. The user explicitly authorized conversion, candidate fitting, held-out evaluation and conditional integration. The workflow executed; no candidate met the deployment review, so inference remains disabled. See [quality](battery-quality-report.md), [evaluation](nasa-evaluation-report.md), and [machine-readable results](nasa-evaluation-results.json).

### Files and behavior in this batch

- Added ml-service/convert_nasa.py: explicit offline protocol-aware MATLAB conversion, conservative reference/completeness checks, uninterrupted prefixes, immutable provenance and per-record audit.
- Updated ml-service/dataset.py: preserve/validate explicit discharge ordinals, reject gaps/rebased histories, verify quality-manifest binding and full floating-point round trips, support event-availability stratified grouped splits.
- Updated ml-service/training.py: opt-in stratification, per-battery/sample counts, exact model settings, training counts, leakage and baseline metadata; existing validation selection and held-out evaluation retained.
- Added ml-service/review_candidate.py: offline hash/serialization/feature/preprocessing and post-EOL checks; never approves a model.
- Added converter and synthetic training-boundary tests; extended inference consistency tests; added backend/tests/realMlJourney.test.js as an opt-in real-FastAPI integration.
- Added data/validated/nasa-20261016/ CSV, quality manifest, summary, frozen split and README; versioned candidate/evaluated artifacts remain in ignored ml-service/runs/.
- Updated ML README, dataset baseline, documentation index, synthetic-demo README and reports. Explicitly declared scipy (already installed and already a sklearn dependency) because MATLAB conversion directly imports scipy.io; no packages were installed or upgraded in this workflow.

### Executed checks

| Check | Actual result |
|---|---|
| python -B convert_nasa.py against all supplied MAT files | 34 batteries / 2,794 discharges audited; 14 batteries / 929 cycles retained; 20 batteries excluded |
| Existing Python suite plus new converter/training/serving tests: python -B -m pytest -q | 37 passed |
| Existing backend Jest suite, runInBand/detectOpenHandles/forceExit, TEST_MONGODB_URI empty, MONGOMS_RUNTIME_DOWNLOAD=false | 17 suites / 101 tests passed |
| RUN_REAL_ML_TESTS=1 realMlJourney.test.js against spawned local FastAPI and disposable MongoDB | 1 additional suite / test passed |
| Frontend Vitest smoke | 2 suites / 14 tests passed |
| Frontend Vite production build | Passed |
| Actual evaluated manifest configured in FastAPI TestClient | health models_loaded=false; predict 503 MODEL_UNAVAILABLE, Model is not approved |
| Every exported capacity compared with exact source-audit scalar and record identity | All 929 equal; no cycle/source-ID duplicates; partitions cover all batteries without overlap |
| Candidate artifact/preprocessing review | SHA-256 / feature order / sklearn version valid; both scaler means match training-only features; 58 post-EOL output violations |
| Raw corpus and all eight legacy model-directory files | Hashes unchanged; raw MAT fingerprint matches prior baseline |
| git diff --check; protected schemas/artifacts/package lock diffs | Passed; protected diffs empty; branch remains voltsense |

Commands ran in the existing environment using direct Node entry points equivalent to npm scripts. Frontend smoke initially exceeded a 5 KB output buffer due to jsdom canvas warnings; it was rerun with a larger output buffer and all 14 tests passed. The existing canvas and large-bundle warnings remain. No dependency versions, schemas, routes, API bodies, production data or environment files were changed.

### Real integration coverage and limits

The additional API test spawns actual Python FastAPI with an unapproved local manifest, registers an account in a disposable MongoDB, creates a vehicle, uploads the existing 40-cycle synthetic CSV using sourceType=user_upload, processes twice, verifies real MODEL_UNAVAILABLE errors and stage failure, logs in again, and verifies persisted failed status and empty prediction history. It allows HTTP only to that local Python service and kills its own child on completion. The actual trained candidate was independently checked through FastAPI TestClient and rejected by the same approval gate.

Existing backend tests cover successful persistence/history/insights using explicitly labeled inference fixtures, authorization, deletion, failures and explanations. Frontend component tests cover data/empty states and polling semantics. A live browser-to-Atlas or external Groq-account session was not run; these checks do not certify that deployment or hardware visualization. No real approved-model success journey is possible for this rejected candidate, and none is claimed.

### Demonstrate in the frontend

1. In a terminal under ml-service, leave ML_MODEL_MANIFEST unset and run python -m uvicorn app:app --host 127.0.0.1 --port 8000. Prediction remains disabled under strict mode.
2. In separate terminals, start the normally configured backend with npm run dev and the frontend with npm run dev from their respective directories. MongoDB and JWT settings must already be configured for normal authenticated persistence.
3. Open the displayed Vite URL, register/log into a dedicated demo account, and create/select its owned vehicle. Label it Synthetic cycle demo; keep the optional pack-kWh field blank rather than entering cell Ah. This build permits one vehicle per account.
4. Open SOH & RUL → Choose CSV / Excel → select sample-data/demo_battery_cycles.csv → confirm the 40-cycle preview and synthetic battery ID → Upload & analyze. The UI automatically sends sourceType=user_upload; there is no source selector or manufacturer adapter.
5. Validation/schemaMapping/cleaning/missingValueHandling/outlierDetection should finish. With FastAPI running but no approved model, featureEngineering fails with service_error_503:MODEL_UNAVAILABLE; overall processing is failed. This is an honest model-availability failure, not a malformed demo file. No SOH/RUL prediction/history/AI-insight record is created.
6. Refresh/re-login: the uploaded dataset and failed attempt remain available. Retrying creates a new failed run without duplicate predictions. Existing results from other data are not replacement demo predictions; use a dedicated account.
7. For reset, use authenticated DELETE /api/datasets/:datasetId after verifying the demo dataset ID, or Vehicle Profile → Remove only in this disposable demo account. Active processing blocks deletion. Do not delete raw NASA files or database collections manually.

### Remaining scientific work

Improve the RUL formulation/constraints using fresh development evidence, obtain more defensible observed-EOL batteries and reserve a new independent final test. Investigate the Capacity/cutoff and cold-start protocols before expanding exclusions or changing reference choices. More validation is needed before EV-pack claims. Do not enable the candidate by toggling approved=true: it has documented serving-contract violations and insufficient held-out RUL evidence.


## V3 RUL consistency and retraining verification

See [V3 report](rul-consistency-v3.md) and [machine-readable results](rul-consistency-v3-results.json). The approved 80% EOL definition and causal 13-feature contract remain unchanged. Shared serving/evaluation policy now returns observed terminal zero only after normal validation and model approval. Censored labels remain unobserved, and regressor fitting/selection uses strictly pre-EOL rows. Existing EOL persistence fields retain the first observed crossing.

Executed: Python 54 tests passed; backend 18 suites / 123 tests passed with RUN_REAL_ML_TESTS=1; frontend 3 suites / 22 tests passed with RUN_REAL_UPLOAD_TESTS=1; production build passed. Known terminal held-out rows: 58, invalid served positive RUL: 0. Raw estimator positives on those terminal rows remain 58 and are separately disclosed. Source/artifact/hash/manifest checks passed; actual unapproved V3 requests before/at/after EOL all returned 503 MODEL_UNAVAILABLE. All earlier candidate/legacy/data/split/raw file hashes were preserved.

V3 inference remains disabled: only one previously inspected held-out battery supplies RUL labels, and capacity RMSE still fails the existing persistence comparison. No production records, environment settings, API shapes or schemas changed; no candidate was approved.

## Final stabilization and verified review — 2026-10-19

See [complete handover](final-stabilization.md) for the current implemented contract, each verified/stale review lead, changed files, exact startup/demo commands and limitations. Full verification: 59 system-Python tests,18 backend suites/127 tests with real FastAPI integration,3 frontend suites/23 tests including real upload-client integration; production build passed. The serving .venv lacks pytest, but V3 serialization/feature/policy/hash checks ran there and strict loading still rejects the unapproved model. No NASA retraining, artifact approval, schema/API changes, dependency installation or production database writes. Raw MATLAB directory is absent from this checkout and was not rehashed.
