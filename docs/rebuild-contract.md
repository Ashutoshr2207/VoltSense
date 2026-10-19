# Stabilized runtime contract

This document records the approved rebuild decisions. Existing runtime public APIs and Mongoose schemas remain the compatibility authority. The restored documentation describes an earlier proposed architecture and is not evidence of deployed cloud storage, manufacturer adapters, model accuracy, or EV-pack validation.

## Responsibilities and invariants

- React uses the existing Node /api endpoints, four-key response envelope, string IDs, ISO dates, and existing field names/types.
- Express owns authentication/authorization, raw local files, parsers, quality assessment, aggregation, operational MongoDB records, orchestration, notifications and explanations.
- FastAPI owns ML validation, shared causal features, approved model loading and inference. Training and evaluation are explicit offline commands. Python never writes the application database.
- No schema migration, new collection, new service, cloud storage requirement, or manufacturer-specific adapter is introduced.
- One backend worker process is supported. Run startup recovery before accepting requests. Multiple workers/replicas require a separately reviewed durable job/lease design; the in-process lifecycle lock is not a distributed lock.

## File and data boundaries

| Boundary | Owner | Required input | Output and units | Missing/error behavior |
|---|---|---|---|---|
| Upload | Node | Existing multipart file and sourceType, owned vehicle | Existing dataset envelope; local storage reference | One CSV/XLS/XLSX, configured size limit; unsupported/mismatched formats and empty files rejected. Existing 400 INVALID_FILE/VALIDATION_ERROR envelopes retained. |
| Decode and map | Node | Valid CSV or first Excel worksheet; documented header aliases | Typed source rows; original headers and battery selection retained | Comma, semicolon, tab; quoted/escaped fields and UTF-8/BOM supported. Legacy single-byte fallback retained. Duplicate/ambiguous key headers, invalid numeric tokens and row lengths fail. Unknown columns return the existing 422 mapping error, without guessing mappings. |
| Quality and aggregation | Node | Explicit cycle/capacity for lifetime analysis; time/voltage/SoC profiles can remain diagnostics-only | Per-cycle capacity Ah, time seconds or parsed UTC timestamp, current A, voltage V, temperature C; quality counts | Optional signals stay null. Exact duplicate rows removed. Conflicting capacities within one cycle rejected. No invented aging cycles, capacity imputation, or automatic Ah/kWh conversion. |
| ML features | Python | At least seven unique consecutive discharge cycles numbered 1..t; positive finite capacity Ah | Versioned ordered 13-feature row for cycle t | No sorting away errors, gap compression, missing-capacity substitution, temperature default, mixed batteries, or truncated histories. 422 INVALID_ML_INPUT. |
| Model execution | Python | Existing POST /predict body: cycleTable, eolThreshold=80, batteryId | Existing flat soh/rul/capacity/referenceCapacity/currentCycle/status/model/metrics/confidence/factors/recommendations response | No approved compatible bundle: 503 MODEL_UNAVAILABLE. Invalid model outputs: 503 INVALID_MODEL_OUTPUT. No extrapolation fallback. |
| Persistence | Node | Finite, contract-valid response | Existing predictions/history, dataset report and vehicle summary | Reject bad units/ranges/reference/threshold/cycle/model identity. Persist failures, never a substitute model result. |

Unadorned recognized aliases use the documented units above. Explicit incompatible units such as mAh/mV/mA/kWh are rejected rather than silently converted. Pack and cell signals are not interchangeable. Capacity columns must describe complete discharge capacity; cumulative within-cycle counters require a separately specified adapter.

For NASA training metadata, the provisional loader requires battery_id, test_id, type, Capacity. It filters explicit discharge rows, orders by numeric test_id within battery, retains test_id and assigns completed-discharge ordinal 1..n. test_id is not assumed to be a discharge cycle number. A directory must be supplied as its metadata.csv path; ZIPs use an explicitly named member and are never extracted. The subsequently supplied raw MAT corpus and battery-level protocol CSV are documented in [dataset-baseline.md](dataset-baseline.md). The initial read-only decision was superseded by the explicitly authorized offline conversion and candidate evaluation documented in [battery-quality-report.md](battery-quality-report.md) and [rul-consistency-v3.md](rul-consistency-v3.md). Validated exports and conservative exclusions exist; V3 remains unapproved. The cycle CSV/ZIP adapter remains distinct from web uploads.

## Target and feature contract

The latest completed discharge is cycle t. Q1 is its battery's first completed discharge from full history. SOH = min(100, 100 * Qt/Q1), in percentage points. Raw Ah capacities remain available; this cap is explicit and is not a model fallback. This is observed-reference relative capacity, not manufacturer-rated EV pack health.

RUL is the number of completed discharge cycles to the first observed SOH <= 80 crossing. Censored batteries have no RUL label; do not fabricate one by extrapolation. Observed-crossing batteries have max(0, crossing_cycle - target_cycle) labels; censored labels remain unobserved. Fit/select the RUL regressor only before the crossing. The explicitly authorized V3 observed-EOL policy returns zero at/after the first crossing in validated supplied history, including after capacity recovery, without calling the RUL regressor. This is observed terminal status, separate from estimator inputs and forecast metrics. Normal input validation and strict artifact approval still run first; no unavailable/invalid model is replaced by a fabricated prediction. See docs/rul-consistency-v3.md. Using 70% requires different labels, evaluation and approved models and is currently rejected.

The ordered feature list and exact formulas live in ml-service/features.py as FEATURE_CONTRACT. It contains cycle_idx, log_cycle, cycle_squared, cycle_sqrt, cap_lag1/2/5, cap_roll3/5, deg_rate, deg_rate5, initial_cap and cap_drop_pct. Every capacity-derived feature uses observations before t; initial_cap is Q1. Historical capacity is available information, while current capacity/SOH, future capacities, full-history maxima and EOL position are excluded from features. Temperature is excluded until ambient-versus-measured semantics are verified.

The replacement SOH pipeline predicts capacity in Ah and converts it to SOH once. The separate RUL pipeline predicts discharge cycles. Both retain fitted preprocessing. Existing legacy 14-feature pickle files and model_config.json are preserved and not loaded by the new service.

## Pipeline, retries and visibility

The existing seven stage keys are preserved:

- validation checks file decoding and headers;
- schemaMapping resolves supported aliases;
- cleaning deduplicates, validates records and orders cycles/samples;
- missingValueHandling assesses missing data without imputation;
- outlierDetection flags observed physical excursions for diagnostics, without manufacturing normal values;
- featureEngineering and normalization cover shared Python feature generation and the approved bundle's fitted transformation, and complete only when inference returns successfully.

Parser stages may finish together because parsing is synchronous; timestamps record actual operations. There are no progress delays. Diagnostics-only runs skip both ML stages and persist null lifetime values. Capacity histories with seven usable cycles but gaps are rejected. Failures mark active stages failed and leave downstream stages uncompleted. Reports use the actual model result, not parser extrapolation.

Upload of identical bytes to the same owned vehicle returns the existing dataset, preserving the response shape. Explicit processing retries create separate runs. An atomic dataset-status claim prevents simultaneous processing of that dataset. Lifecycle mutations are serialized per vehicle in the one supported worker.

Predictions are upserted by the existing unique pipelineRunId. Only completed-run results are published by retrieval endpoints. Before completion, failures compensate partial prediction/insight/notification writes and repair latest pointers. Startup marks interrupted runs failed, compensates incomplete results and repairs publication pointers; it never silently retries inference. Without cross-resource transactions, crashes can leave intermediate state until startup reconciliation.

Deletion is blocked while vehicle analysis is active. Dataset deletion cascades only its owned dependencies and raw reference; vehicle deletion cascades its owned data. Missing raw files are idempotent during deletion. Exact paths must remain inside the expected vehicle directory; traversal, symlinks and cross-vehicle references are rejected. No directory sweep occurs. A failure after unlinking may leave the dataset record for retry; filesystem and MongoDB operations are not one atomic transaction.

## Verification and outstanding gates

Use backend npm test, frontend npm run test:smoke and npm run build, and python -B -m pytest tests -q from ml-service. Python tests use synthetic fixtures/untrained serving doubles and one small synthetic training-workflow fit; they never retrain NASA candidates or overwrite existing artifacts. Mongo tests use temporary databases; TEST_MONGODB_URI must name a disposable test database because suites clear its collections.

Dataset identity against the historical training selection, complete-discharge/reference semantics and actual held-out accuracy remain gates. Local raw structure/units and observed chronology are recorded in dataset-baseline.md. The installed frontend dependencies were restored with npm ci from the unchanged lockfile; a Windows-locked old directory was preserved under .cache/. The UI polls actual processing state and distinguishes model and measured SOH. No real browser, production database, provider account, or real EV pack generalization was validated by unit tests.

See ../ml-service/README.md for the developer-run training/evaluation and model approval workflow.
