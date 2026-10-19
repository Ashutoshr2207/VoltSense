# Final stabilization and verified review findings — 2026-10-19

Branch voltsense; initial working tree clean. This batch fixes confirmed implementation issues and documentation. No NASA retraining, threshold/split changes, model approval, schema migration, API path/body changes, dependency installs or production database writes.

## Review decisions

| Finding | Verified decision |
|---|---|
| Backend quick-start / README status | Fixed broken command/comment chain; environment setup outside commands. V3 trained/evaluated but unapproved, legacy inactive, EV-pack validation absent. |
| Quoted final CSV field retains NUL marker | Confirmed/fixed: strip the internal closing marker at end of final field, as at delimiters. Tests cover numeric final field, escaped quotes and battery identity. |
| Supported uploads pass null to quality | Confirmed/fixed: .xls now parsed before quality/storage, alongside CSV/XLSX. Both workbook formats exercise API ingestion and processing to truthful disabled inference. |
| Dataset without raw reference cannot delete | Confirmed/fixed: call deleteRaw only for present rawUrl. Unsafe present/cross-vehicle/traversal/symlink protections remain. |
| Documentation drifts from runtime | Corrected listed contract/architecture/setup documents and index. Local storage, Express ownership, Python inference, 80% target, ordered 13-feature history boundary and actual envelopes/statuses replace unsupported claims. Machine-specific file URI links removed. |
| Polling can report another attempt | Stale: both upload and switchBattery already pass pipelineRunId; waitForProcessing rejects mismatches before onStatus/completion. No new endpoint needed. Added regression for another completed attempt. |
| Approved loader omits inference policy | Confirmed/fixed: exact RUL_POLICY equality now mandatory before deserialization; updated approved fixtures, rejection tests. Existing candidates/flags untouched. |
| Repeated model deserialization | Confirmed/fixed: successful loads cached by resolved manifest and bundle paths, nanosecond mtimes and sizes. Reload on either change; missing/corrupt/revoked files clear stale cache. Lock serializes refresh; pre/post load keys reject changes during load. |
| Whole-number floats serialized as ints | Confirmed/fixed in historical V2 report: model_configurations copied from original manifest using Python JSON serialization, preserving max_features=1.0, subsample=1.0 and float zeros. Metrics and original manifest untouched. |
| Markdown delimiter counts | Fixed seven-column outcome tables in historical NASA and V3 reports. |
| Generic primary id forbidden / S3 examples | Naming allows serialized primary id strings and explicit foreign keys. Storage examples use local provider; cloud/adapters are proposals only. |

## Files changed

Runtime: backend/src/services/csvParserService.js, datasetService.js, deletionService.js; ml-service/app.py, model_loader.py.

Tests: backend/tests/parserContract.test.js, datasets.test.js, deletion.test.js; frontend/smoke/processing.test.jsx; ml-service/tests/test_inference.py.

Documentation: root README.md; ml-service/README.md; docs/README.md, api-reference.md, api-specification.md, architecture.md, data-flow.md, development-workflow.md, error-handling.md, frontend-backend-contract.md, ml-architecture.md, ml-backend-contract.md, ml-communication-fix.md, naming-conventions.md, project-structure.md, system-context.md, validation-rules.md, rebuild-contract.md, rebuild-verification.md, nasa-evaluation-results.json, nasa-evaluation-report.md, rul-consistency-v3.md and this handover. Historical reports remain labeled; no artifact replaced.

## Executed verification

| Check | Actual result |
|---|---|
| Focused backend parser/workbook/deletion suites | 3 suites /32 passed |
| Full system-Python suite: python -B -m pytest tests -q --tb=short | 59 passed, 2.59s; includes small synthetic workflow fitting only |
| Full backend, RUN_REAL_ML_TESTS=1 | 18 suites /127 passed, 28.789s |
| Frontend, RUN_REAL_UPLOAD_TESTS=1 | 3 suites /23 passed, 1.95s |
| Production Vite build | Passed; existing >500kB chunk warning |
| Existing serving .venv compatibility check | V3 deserializes, hashes/features/policy match; strict load rejects Model is not approved |
| Serving .venv pytest invocation | Could not run: No module named pytest. No packages installed; full59 tests ran in existing system test environment. |
| Original artifacts | All8 legacy hashes match earlier preservation report; all6 candidate/evaluated bundles match own manifest SHA256 and remain approved=false; validated CSV hash matches V3 provenance |
| Protected Git paths | No changes to models, schemas, routes, features.py, rul_policy.py or validated dataset/split files |
| Whitespace / portability | git diff --check passed; no file:/// links remain in docs Markdown |

The first new workbook test used an incorrect quality expectation (good versus actual excellent), then incorrectly assumed successful inference in a strict no-model test. Both fixture expectations were corrected: complete ingestion followed by explicitly unavailable inference, zero predictions. Final focused and full suites passed without weakening production validation.

The real frontend JavaScript-client test starts disposable Express/MongoDB and uploads the actual 40-cycle synthetic file, captures the actual backend request to FastAPI, checks JSON503 MODEL_UNAVAILABLE after five completed Node stages, reimports clients/relogs in to simulate refresh and confirms one dataset/run and zero predictions. Backend real-service tests also exercise retry. Existing success/insight tests use explicit untrained approved doubles in disposable databases, not production candidates. No visual browser-to-Atlas or provider-account test is claimed. Existing jsdom canvas warnings and deliberate offline Groq fallback warnings remain.

Raw MATLAB directory is absent from the current checkout; no raw rehash/conversion was claimed this turn. Retained validated data and versioned artifacts are present and untouched. Final Git/provenance/hash checks above verify retained schemas, datasets and model artifacts. Raw source hashes remain recorded in historical quality reports.

## Exact regression commands

Use the existing Python test interpreter (system Python here), from ml-service:

~~~powershell
python -B -m pytest tests -q --tb=short
~~~

From backend, with cached MongoDB binary and disposable database only:

~~~powershell
$env:TEST_MONGODB_URI = ''
$env:MONGOMS_RUNTIME_DOWNLOAD = 'false'
$env:RUN_REAL_ML_TESTS = '1'
npm test -- --json --outputFile=../.cache/stabilization-backend-passed.json
~~~

From frontend, while strict/unapproved FastAPI is reachable on127.0.0.1:8000:

~~~powershell
$env:RUN_REAL_UPLOAD_TESTS = '1'
npm run test:smoke
npm run build
~~~

Recorded runs invoked the existing direct Node entry points equivalent to these npm scripts. No dependency upgrade or application database connection was used. A temporary owned Uvicorn was started only because /health refused connection; it is stopped after verification so the user can run the startup command without a duplicate-port conflict.

## Startup and demonstration

Configure backend/.env privately: MONGODB_URI, JWT_SECRET, optional MONGODB_DATABASE, ML_SERVICE_URL=http://127.0.0.1:8000, CORS_ORIGIN=http://localhost:5173. Use persistent MongoDB and one backend worker. Existing startup may prompt for optional provider keys; these do not enable model inference. Leave ML_MODEL_MANIFEST unset or keep an unapproved candidate; never toggle approval for a demo.

Each terminal starts at repository root:

~~~powershell
# Terminal1
cd ml-service
.\.venv\Scripts\Activate.ps1
python -m uvicorn app:app --host 127.0.0.1 --port 8000
~~~

~~~powershell
# Terminal2
cd backend
npm run dev
~~~

~~~powershell
# Terminal3
cd frontend
npm run dev
~~~

Check Invoke-RestMethod http://127.0.0.1:8000/health (HTTP200, models_loaded=false expected). Open http://localhost:5173 → register/log into dedicated demo account → create/select single vehicle (Synthetic cycle demo; optional pack kWh blank) → SOH & RUL → Choose CSV / Excel → sample-data/demo_battery_cycles.csv → Upload & analyze. UI sends sourceType=user_upload. Expect preview/parsed 40 cycles, five completed ingestion stages, failed ML stages with service_error_503:MODEL_UNAVAILABLE, persisted failed analysis after refresh and no prediction/history/insight. Connectivity failure instead reports unreachable/timeout; malformed responses remain distinct. Reset only idle demo dataset with authenticated DELETE /api/datasets/:datasetId or remove its disposable vehicle. Never sweep local files or collections.

## Remaining blockers and scientific result

V3 remains disabled: pooled 194-row capacity RMSE 0.020778746896882725 Ah is worse than same-cohort persistence 0.020661328542490476 Ah. Pre-EOL integer RUL MAE 8.735294117647058/RMSE 10.896572585801788 cycles covers 68 rows from only one previously inspected test battery (B0018). The 58 observed terminal histories return zero offline; this is policy correctness, not forecasting generalization. Censored labels remain unobserved. The 80% threshold, first credible reference and causal features are unchanged.

No unused eligible observed-EOL cohort exists in current NASA evidence. The shortest honest demonstration is real ingestion/status/failure plus offline evaluation. Live success still requires defensible new evidence including at least three independent observed-EOL test batteries, a candidate meeting the existing persistence gate and all other review checks, followed by explicit approval. No EV-pack validation is claimed. See [exact gates](v3-deployment-decision.md) and [V3 results](rul-consistency-v3.md).
