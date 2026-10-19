# RUL consistency correction, retraining and validation — V3

**Result: observed-EOL consistency is fixed; V3 remains unapproved and inference remains disabled.** The 80% threshold, first credible reference discharge, cycle numbering, 13 estimator features, public API fields and MongoDB schemas are unchanged. The strict model loader was not modified.

## Confirmed root cause

The prior converter/loader preserved consecutive discharge chronology and Q[1] reference capacity correctly. B0018 first crosses relative 80% SOH at discharge 75. The V2 target was EOL−t up to that crossing, with post-EOL rows omitted from RUL fitting. The forest therefore learned predominantly positive values; its leaf averages were not constrained to zero at observed EOL. Lag-only features exclude Q[t], so an at-cycle-t crossing cannot be guaranteed from the estimator features alone. The raw model returned 2.27 cycles at B0018 discharge 75 and positive values for all 58 evaluated histories at/after that crossing.

The old service detected that contradiction and returned INVALID_MODEL_OUTPUT. It was correctly rejecting an unsafe result, but did not implement an explicit terminal-state rule. This was not a changed 70/80% target, reordered cycles, a later reference, a network failure or evidence that adding current capacity to estimator inputs would be legitimate.

## Corrected target and serving behavior

For an observed first crossing E, RUL(t)=max(0,E−t). Before E it counts subsequent discharges to the crossing. At/after E the terminal outcome is already known and remains zero even if capacity subsequently recovers. Censored histories retain unobserved NaN labels; they are never assigned invented EOL or zero targets. No gaps or missing capacities are bridged.

The shared rul_policy.py checks only the validated supplied prefix through t. If it contains an observed crossing, it returns zero **without invoking the RUL regressor**. Otherwise it validates and rounds a nonnegative finite model forecast. The latest observed capacity is used only for this terminal-state decision, not in any estimator feature. The same policy is used in API serving, validation reporting, final evaluation and safety review.

Input/history validation and strict artifact approval still run first. No approved artifact means MODEL_UNAVAILABLE even for a known terminal history. Invalid capacity-model output still fails; the rule is not a fallback for loading, communication or prediction errors. The response shape is unchanged and its factor explanation discloses the rule.

Backend persistence now retains the first observed EOL cycle in the existing estimatedEOLCycle/predictedEOLCycle fields, instead of incorrectly moving it to currentCycle when RUL=0. Dataset reports and deterministic insight summaries identify observed EOL. Tests cover recovery and persisted zero values. No collection, relation, field type, request or endpoint changed.

## Training and fixed data partitions

The validated source remains 929 cycles / 14 batteries, with five observed-crossing batteries and nine censored batteries. Data hash: `6b8bbdbffcf0218b6ab173920ce25010735e025c664a60ab420f978b7c55e825`. Original seed-42 partitions and file bytes were reused unchanged:

| Partition | Battery IDs | Capacity/SOH rows | Pre-EOL RUL forecasts | Known terminal rows |
|---|---|---:|---:|---:|
| Train | B0005, B0006, B0025, B0027, B0028, B0029, B0046, B0047 | 442 | 159 / 3 batteries | 178 |
| Validation | B0007, B0030, B0048 | 209 | 117 / 1 battery | 45 |
| Held-out test | B0018, B0031, B0032 | 194 | 68 / 1 battery | 58 |

Capacity/SOH fitting is unchanged. RUL fitting now uses only strictly pre-EOL rows from observed-crossing batteries. Known terminal rows are labeled zero for state evaluation but excluded from regressor fitting/selection. This keeps a deterministic state rule separate from an unknown-future forecasting task. In all, there are 344 pre-EOL forecasts and 281 known terminal rows; 220 censored capacity/SOH rows have no RUL accuracy label.

Each fitted estimator still receives exactly: cycle_idx, log_cycle, cycle_squared, cycle_sqrt, cap_lag1, cap_lag2, cap_lag5, cap_roll3, cap_roll5, deg_rate, deg_rate5, initial_cap, cap_drop_pct. All capacity-derived features use observations strictly before t. observed_eol is evaluation/state metadata, explicitly excluded from FEATURES. Current/future capacity, current SOH, future EOL position and full-history statistics are not regressor inputs.

The same RandomForest and GradientBoosting configurations and seed 42 were retained, without hyperparameter tuning. StandardScaler is fit only on training rows. Validation macro per-battery MAE selects capacity/SOH GradientBoosting and RUL RandomForest; neither is refitted with validation/test data. Validation RUL MAE is 20.226197 cycles for RandomForest and 22.630794 for GradientBoosting (117 rows, B0007 only).

**These held-out batteries were already inspected in V2.** This is a fixed-split regression/confirmation evaluation, not a new prospective final test. The manifest records previously_inspected_test=true. No partition was redrawn and no held-out score selected a candidate.

## Measured held-out performance

R² and Pearson R are distinct statistics; undefined values are null. Ah, SOH percentage points (pp), and completed discharge cycles are explicit below. Serially correlated rows do not substitute for independent batteries.

| Outcome | Method | Rows / batteries | MAE | RMSE | R² | Pearson R |
|---|---|---:|---:|---:|---:|---:|
| Capacity (Ah) | Selected candidate | 194 / 3 | 0.012435 | 0.020779 | 0.981235 | 0.990677 |
| Capacity (Ah) | Capacity persistence | 194 / 3 | 0.013903 | 0.020661 | 0.981446 | 0.991151 |
| SOH (pp) | Selected candidate | 194 / 3 | 0.508888 | 1.049906 | 0.989138 | 0.994600 |
| SOH (pp) | Capacity persistence | 194 / 3 | 0.549217 | 1.018637 | 0.989776 | 0.994998 |
| Pre-EOL RUL (cycles) | Serving integer forecast | 68 / 1 | 8.735294 | 10.896573 | 0.691797 | 0.884130 |
| Pre-EOL RUL (cycles) | Training-mean, same rounding | 68 / 1 | 17.176471 | 19.937402 | -0.031798 | null |

The capacity baseline is the preceding completed capacity. The RUL baseline is the mean strictly pre-EOL training label, rounded for serving comparison; both candidate and baseline receive the same observed-history terminal rule. The primary RUL forecasting comparison excludes at/post-EOL zero cases. Raw continuous model RUL on the same 68 pre-EOL rows has MAE 8.703971, RMSE 10.867815, R² 0.693421, Pearson R 0.884690. Raw continuous training-mean MAE is 17.162042.

All 58 known terminal held-out histories return zero with zero MAE/RMSE for both candidate policy and baseline policy; their correlations are undefined. Combining these deterministic cases with the 68 forecasts yields candidate MAE 4.714286 and RMSE 8.004959 over 126 rows. This blended score is **not** evidence of improved future-life prediction and is not the model-selection criterion.

The raw regressor still returns positive values on all 58 terminal histories, now explicitly outside its fit/forecast population. The shared policy, not learned monotonicity, resolves them. The safety review records both raw diagnostics (58) and invalid served terminal outputs (**0**). V2 RUL scores used 69 rows including crossing-cycle zero; do not compare those directly with V3’s 68 strictly pre-EOL forecasts.

## Per-battery results

| Battery | Outcome | Rows | Candidate MAE / RMSE | Baseline MAE / RMSE | Candidate R² / Pearson R |
|---|---|---:|---:|---:|---:|
| B0018 | capacity | 126 | 0.013577 / 0.023798 | 0.014474 / 0.023007 | 0.973044 / 0.986680 |
| B0031 | capacity | 34 | 0.008968 / 0.012484 | 0.012072 / 0.015296 | 0.895462 / 0.957172 |
| B0032 | capacity | 34 | 0.011671 / 0.014452 | 0.013615 / 0.015500 | 0.935204 / 0.970233 |
| B0018 | soh | 126 | 0.731909 / 1.282917 | 0.780272 / 1.240263 | 0.973044 / 0.986680 |
| B0031 | soh | 34 | 0.000000 / 0.000000 | 0.000000 / 0.000000 | null / null |
| B0032 | soh | 34 | 0.191284 / 0.436099 | 0.242172 / 0.469008 | 0.841578 / 0.921504 |
| B0018 | pre-EOL RUL (integer cycles) | 68 | 8.735294 / 10.896573 | 17.176471 / 19.937402 | 0.691797 / 0.884130 |

B0031 and B0032 have censored RUL and are not scored as if they had zero remaining life. B0031 SOH remains capped at 100% for all evaluated rows, giving zero SOH error and undefined correlation despite nonzero Ah error. No EV-pack generalization, calibrated confidence or independent-sample precision claim is made.

## Artifacts and readiness

- `ml-service/runs/nasa-20261016-candidate-v3/`: new bundle.joblib and manifest.json.
- `ml-service/runs/nasa-20261016-evaluated-v3/`: evaluated bundle.joblib, manifest.json, approval-review.json.
- Bundle SHA-256: `d0c845dccd6524850618ccc37503b92a8753b512e013b24d3c52725b4f59ff46`. Both V3 manifests remain approved=false.
- [Complete machine-readable results](rul-consistency-v3-results.json) include sample counts, per-battery/baseline scores, policy and target definitions, package versions, source-code hashes, data provenance and frozen splits.
- Earlier V1/V2 runs, validated data, split files, raw corpus and all legacy artifacts were hash-verified unchanged. Runs remain Git-ignored generated files; archive them with manifests/hashes when sharing.

Readiness checks passed feature order/definitions, serialization runtime, artifact/data/code hashes, units, target convention, policy parity and training-only scaler means. Strict approved-fixture API tests preserve the existing response schema. Configuring the actual unapproved V3 manifest yields JSON 503 MODEL_UNAVAILABLE before, at and after EOL; no candidate was enabled or approval check bypassed.

Exact remaining deployment blockers:

1. Only B0018 provides held-out RUL outcomes, and it was previously inspected. The existing review requires at least three independent held-out observed-EOL batteries; a fresh, pre-frozen prospective evaluation cohort is needed rather than repartitioning/tuning on these batteries.
2. Capacity RMSE remains 0.020779 Ah versus persistence 0.020661 Ah. It fails the existing baseline review gate; the small difference is not claimed statistically significant.

Minimum eligibility work: obtain/validate a fresh independent observed-EOL test cohort meeting that three-battery minimum, reserve it before further model development, and use separate training/validation evidence to achieve the existing capacity-baseline criterion. Then perform the new held-out evaluation, policy/schema/hash/serialization checks and explicit approval. More data does not guarantee acceptable scores. Do not toggle approved=true on V3.

## Executed commands

From ml-service (new output paths; existing ones are never overwritten):

~~~powershell
python -B training.py train --dataset ../data/validated/nasa-20261016/validated_cycles.csv --split-manifest ../data/validated/nasa-20261016/split-manifest.json --previously-inspected-test --output runs/nasa-20261016-candidate-v3
python -B training.py evaluate --dataset ../data/validated/nasa-20261016/validated_cycles.csv --split-manifest ../data/validated/nasa-20261016/split-manifest.json --manifest runs/nasa-20261016-candidate-v3/manifest.json --output runs/nasa-20261016-evaluated-v3
python -B review_candidate.py --dataset ../data/validated/nasa-20261016/validated_cycles.csv --manifest runs/nasa-20261016-evaluated-v3/manifest.json --output runs/nasa-20261016-evaluated-v3/approval-review.json
python -B -m pytest -q --tb=short
~~~

These commands ran in the recorded existing environment. Choose new output directory names to reproduce them; the delivered V3 paths already exist. No dependencies were installed/upgraded.

## Verification and changed files

- Python: **54 passed**. Includes pre-EOL, exact crossing, post-EOL, capacity recovery, censored prefixes, missing/invalid capacity, future-feature cutoff, mixed batch prediction, serialization fixtures, strict approval and preprocessing/selection tests.
- Backend: **18 suites / 123 passed**, including real local FastAPI, disposable MongoDB, zero/positive terminal response validation, persisted original EOL, retry/re-login and no false prediction records.
- Frontend: **3 suites / 22 passed** with real frontend API-client integration enabled; zero remains numeric and first EOL is preserved in mapped history.
- Production frontend build: **passed**; existing canvas-test and bundle-size warnings remain.
- Artifact/data/raw preservation and source/hash/manifest parity passed. No live database records, environment files or running service ownership were changed.

Backend verification enabled RUN_REAL_ML_TESTS=1 with TEST_MONGODB_URI empty and MONGOMS_RUNTIME_DOWNLOAD=false. Frontend verification enabled RUN_REAL_UPLOAD_TESTS=1 and used the existing unapproved/no-model FastAPI listener on 127.0.0.1:8000; application persistence used disposable MongoDB. Successful terminal persistence tests use explicitly labeled untrained inference fixtures, not an approved production candidate. No visual browser success or real approved-candidate deployment is claimed.

Production/code changes: ml-service/rul_policy.py, dataset.py, training.py, app.py, review_candidate.py; backend/src/services/analysisPipelineService.js. The strict model_loader.py and FEATURES contract are unchanged. Tests: ml-service/tests/test_rul_policy.py, test_inference.py, test_training_workflow.py; backend/tests/mlClient.test.js, pipeline.test.js, realMlJourney.test.js; frontend/smoke/processing.test.jsx. Documentation: this report/results, ML README, historical report pointers, quality/contract wording and verification appendix.

The manual demo remains unchanged: start FastAPI/backend/frontend, log into a demo vehicle, upload sample-data/demo_battery_cycles.csv through SOH & RUL. Ingestion completes its five real stages, then inference reports MODEL_UNAVAILABLE because no defensible candidate is approved. Refresh/re-login retains failure and creates no predictions.
