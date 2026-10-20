# VoltSense ML foundation

The service is strict by default. Legacy models in models/ are preserved but disabled. Without ML_MODEL_MANIFEST pointing to an explicitly approved, compatible bundle, /health returns models_loaded=false and /predict returns 503 MODEL_UNAVAILABLE. Nothing trains on startup or import.

## Run inference

Use the existing requirements.txt environment (scikit-learn 1.6.1 for the preserved legacy files). Candidate manifests record exact package versions; serving requires the matching scikit-learn version. Start with:

~~~powershell
python -m uvicorn app:app --host 127.0.0.1 --port 8000
~~~

Node calls POST /predict with the existing cycleTable/eolThreshold/batteryId JSON body. Supply complete 1-based discharge history, seven cycles minimum, capacity in Ah, one selected battery, threshold 80. Latest cycle capacity is an observation for measured SOH but is excluded from that cycle's feature row. See ../docs/rebuild-contract.md and features.py for precise formulas and units.

## Offline training workflow

The latest complete-workflow request explicitly authorized MATLAB conversion and training, superseding the earlier read-only decision. That workflow has now executed: see [quality report](../own_docs/battery-quality-report.md), [held-out evaluation](../own_docs/nasa-evaluation-report.md), and [verification](../own_docs/rebuild-verification.md). The final dataset and frozen split are under ../data/validated/nasa-20261016/. The latest RUL correction/retraining is documented in [V3 results](../own_docs/rul-consistency-v3.md). New artifacts are under runs/nasa-20261016-candidate-v3 and runs/nasa-20261016-evaluated-v3; both remain unapproved. Prior V1/V2 runs are preserved. The supplied raw directory is ../Battery_DataSet/Battery_DataSet. Its metadata.csv is battery-level protocol metadata, not cycle training data. inspect_raw.py remains read-only; convert_nasa.py writes a new quality-audited export. The generic workflow below accepts validated cycle CSV/ZIP. The old audit path referenced C:\Users\HP\Downloads\NASA kaggle dataset.zip; that path is not used automatically. Pass the real metadata CSV or ZIP. The ZIP member defaults to cleaned_dataset/metadata.csv; use --member to name a different actual member. The loader requires battery_id, test_id, type and Capacity. Verify capacity is Ah, the first row is a completed reference discharge, and test_id orders the full history before training. Do not pass the supplied battery-level protocol CSV to this cycle loader. Sensor/impedance fields are reported as available columns, not assumed to be model features.

Run from ml-service, using new output paths:

~~~powershell
python training.py inspect --dataset 'PATH_TO_METADATA_CSV_OR_ZIP'
python training.py split --dataset 'PATH_TO_METADATA_CSV_OR_ZIP' --output split.json
python training.py train --dataset 'PATH_TO_METADATA_CSV_OR_ZIP' --split-manifest split.json --output runs/candidate-001
python training.py evaluate --dataset 'PATH_TO_METADATA_CSV_OR_ZIP' --split-manifest split.json --manifest runs/candidate-001/manifest.json --output runs/evaluated-001
~~~

Commands refuse overwrites. Train/evaluate cannot write beneath models/. audit_pipeline.py is a compatibility entrypoint for this CLI; its old implicit training/report-rewrite behavior is removed.

Splits use seed 42 and approximately 60/20/20 battery groups. Identical full capacity trajectories stay together. Split files bind to the dataset SHA-256. At least four distinct trajectories and nonempty task-eligible partitions are required. No battery may cross partitions. Do not change test batteries after looking at their errors.

Random Forest and Gradient Boosting candidates use preprocessing fitted only on training batteries. Validation chooses each task by mean battery MAE; selected pipelines remain frozen. The evaluate command alone predicts final-test batteries. Use --previously-inspected-test during training when reusing a previously examined holdout; V3 records that limitation and is not a fresh final test. Integer serving-policy scores and same-policy baselines are saved separately from continuous pre-EOL estimator scores. It reports MAE, RMSE, R2 and Pearson R globally and per battery, plus capacity-persistence and training-mean RUL baselines. Capacity error is Ah; SOH error is percentage points; RUL error is discharge cycles. Undefined correlation/R2 is null. No acceptable-accuracy threshold or EV-pack validation is claimed.

RUL labels require an observed first 80% crossing: max(0, crossing_cycle - target_cycle). Censored histories have no RUL labels. Only strictly pre-EOL rows fit/select the RUL regressor; already observed EOL is a deterministic terminal state, evaluated separately. After normal input validation and strict model approval, the shared rul_policy.py returns zero for at/post-EOL supplied histories without calling the RUL regressor, including after capacity recovery. Before observed EOL, only the fitted model forecasts RUL. This is an explicit observed-state rule, not a fallback for missing models or invalid inputs. Forecast accuracy is reported separately from known zeros; neither establishes performance on censored batteries or EV packs.

## Approval and deployment

Both training and evaluation emit approved=false. Inspect provenance, feature/target contracts, split assignments, validation/final-test metrics, baselines and package versions yourself. No existing artifact is automatically approved or replaced.

Only after every existing deployment review gate passes and explicit deployment approval is given, copy the evaluated bundle and manifest together into a separate release directory, retain its hash, and set approved=true in the release manifest. Do not edit bundle bytes. Configure its absolute manifest path before starting FastAPI:

~~~powershell
$env:ML_MODEL_MANIFEST = 'ABSOLUTE_PATH_TO_APPROVED_RELEASE_MANIFEST'
python -m uvicorn app:app --host 127.0.0.1 --port 8000
~~~

Only trusted local pickle/joblib files may be configured. The loader checks approval, the exact feature/target contract and RUL_POLICY inference_policy, model identity, package compatibility, relative artifact containment, feature order and SHA-256. app.py caches successful loads using resolved manifest/bundle paths and the nanosecond modification time and size of both files; changes reload, and failed/revoked/missing releases clear the cache. Publish immutable versioned artifacts; do not mutate files while serving. Historical comparison CSVs and ML_LEAKAGE_AUDIT.md are not serving metrics. Only explicitly identified final-test metrics from the approved manifest are returned; confidence remains uncalibrated/null.

## Verification

~~~powershell
python -B -m pytest tests -q
python -B training.py --help
~~~

Tests use synthetic records, serialization doubles and small synthetic fitting fixtures to verify partition/preprocessing/selection boundaries. Test-fixture scores do not measure NASA accuracy. Real NASA evaluation is recorded separately in the executed report. pytest/httpx are test-environment tools; no new runtime dependency was added.

## ML service communication troubleshooting

The backend requires this FastAPI service to be running separately at the configured ML_SERVICE_URL (default http://127.0.0.1:8000). A stopped service produces unreachable; HTTP 200 health with models_loaded=false and JSON 503 MODEL_UNAVAILABLE from /predict indicate a reachable service with inference intentionally disabled. See [diagnosis, startup commands and real upload regression results](../own_docs/ml-communication-fix.md).

Current stabilization and executed regression results: [final handover](../own_docs/final-stabilization.md). V3 remains unapproved; no scientific acceptance gate changed. Historical raw MATLAB paths above describe provenance; the raw directory is not present in the current checkout, so this review did not re-hash raw files.
