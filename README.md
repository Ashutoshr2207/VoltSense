# VoltSense — Battery Health and Remaining Life

VoltSense is a college project with React/Vite, Express/Mongoose and FastAPI. It ingests CSV/XLS/XLSX, records real processing status and diagnostics, and supports strict approved-model inference. Express owns local files, parsing, aggregation and database writes; Python owns causal features and inference. See [runtime contract](docs/rebuild-contract.md) and [final handover](docs/final-stabilization.md).

**V3 was trained and evaluated but remains unapproved.** Legacy artifacts are preserved and inactive. No EV-pack validation has been performed. Live predictions remain disabled; the demo honestly reaches MODEL_UNAVAILABLE rather than fabricating SOH/RUL.

## Setup

Use the existing project environment/locked dependencies. Node18+ is required; the recorded Python artifact runtime is Python3.11.9 with scikit-learn1.6.1. Install Python requirements in a virtual environment if not already installed. Use npm ci in backend and frontend when dependencies are absent; no root package script exists.

Configure backend/.env locally before startup: MONGODB_URI (local or Atlas), MONGODB_DATABASE (default voltsense), JWT_SECRET (required; >=32 characters in production), ML_SERVICE_URL=http://127.0.0.1:8000 and CORS_ORIGIN=http://localhost:5173. Keep credentials outside commands/documentation/commits. GROQ_API_KEY and OCM_API_KEY are optional backend-only provider keys. Durable demos need persistent MongoDB; tests use disposable databases.

Start each service in a separate PowerShell terminal from the repository root:

~~~powershell
# Terminal 1 (use the existing ML virtual environment)
cd ml-service
.\.venv\Scripts\Activate.ps1
python -m uvicorn app:app --host 127.0.0.1 --port 8000
~~~

~~~powershell
# Terminal 2
cd backend
npm run dev
~~~

~~~powershell
# Terminal 3
cd frontend
npm run dev
~~~

Do not start a second FastAPI process on port8000. Check with Invoke-RestMethod http://127.0.0.1:8000/health. HTTP200 with {status:"error",models_loaded:false} means reachable but unapproved/not ready. Leave ML_MODEL_MANIFEST unset or pointing to the existing unapproved candidate; never toggle approval to resolve communication errors. The Node backend does not start Python.

## Manual demo

1. Open http://localhost:5173 and register/log into a dedicated demo account. Create/select its single owned vehicle; label it Synthetic cycle demo. Leave optional pack-kWh metadata blank rather than entering cell Ah.
2. Open SOH & RUL → Choose CSV / Excel → select [sample-data/demo_battery_cycles.csv](sample-data/demo_battery_cycles.csv) → Upload & analyze. Its 40 cycles are explicitly synthetic; never NASA training evidence. The UI sends sourceType=user_upload automatically; no manufacturer adapter/source selector is needed.
3. Preview/ingestion should show parsed cycles and quality. Five Node stages complete. With the reachable unapproved service, inference fails with ML inference unavailable: service_error_503:MODEL_UNAVAILABLE. A stopped service instead reports unreachable; timeout/invalid JSON remain distinct.
4. Refresh/re-login: the dataset and failed analysis report remain; no prediction/history/AI insight is invented. Explicit retry creates a new attempt; identical upload bytes reuse the dataset. Existing unrelated predictions are not results for this failure.
5. Reset only the idle demo dataset through authenticated DELETE /api/datasets/:datasetId, or remove its vehicle in the dedicated disposable account. Active processing blocks deletion. Do not delete collections/raw NASA data manually.

See [sample instructions](sample-data/README.md) and [API reference](docs/api-reference.md). Groq explanation fallback and charging discovery do not substitute for unavailable model inference. A visualizer/virtual telemetry stream is software demonstration, not validated EV hardware data.

## Actual scientific status

The validated NASA export contains929 cycles from14 batteries (20 excluded); frozen train/validation/test split8/3/3. V3 pooled held-out capacity RMSE 0.020778746896882725 Ah exceeds persistence 0.020661328542490476 Ah. Integer pre-EOL RUL MAE 8.735294117647058 and RMSE 10.896572585801788 cycles cover68 rows from only one previously inspected test battery. Known terminal58 histories return zero under offline policy, separate from forecasting accuracy. No untouched eligible observed-EOL cohort remains in this corpus.

The 80% SOH EOL threshold, first credible discharge reference and causal 13-feature contract are unchanged. Censored histories have no fabricated training labels. Approval also requires adequate independent evidence (at least three independent observed-EOL test batteries), compatibility and existing safety gates. See [V3 report](docs/rul-consistency-v3.md), [exact deployment decision](docs/v3-deployment-decision.md), [quality report](docs/battery-quality-report.md) and [ML workflow](ml-service/README.md). A live successful prediction demo remains blocked by these scientific gates.

## Verification

From ml-service: python -B -m pytest tests -q. From backend: npm test. From frontend: npm run test:smoke then npm run build.

For real-service integration, set RUN_REAL_ML_TESTS=1 for backend and RUN_REAL_UPLOAD_TESTS=1 for frontend. The frontend integration needs the unapproved/no-model FastAPI running on 127.0.0.1:8000; backend integration spawns its own local service. Use TEST_MONGODB_URI empty and MONGOMS_RUNTIME_DOWNLOAD=false with the existing cached MongoDB binary. Never use a production test database.

The existing system Python test environment has pytest; the project serving .venv currently does not. Run tests with the test interpreter, not an assumption that every environment contains pytest.

Latest executed results: **59 Python tests, 127 backend tests, 23 frontend tests passed; production build passed**. Exact regression commands are recorded in [final stabilization](docs/final-stabilization.md). Tests use explicit doubles for approved success and tiny synthetic fits for training-workflow checks; they do not retrain NASA candidates or prove scientific accuracy. Existing jsdom canvas and large-bundle warnings are documented.
