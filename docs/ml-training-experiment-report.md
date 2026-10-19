# Protocol-separated ML training experiment

Executed 2026-10-19 on `voltsense`, starting from clean commit `a733c7e`. **Production inference remains disabled. Both new candidates are unapproved; neither was selected for release.** No frontend/backend source, database/API contract, scientific threshold, deployment gate, existing model, raw data, or original split was changed.

## Decision and scope

The unified CSV is an observation catalogue, not one interchangeable training population. Its dense-history flag alone does not establish protocol compatibility. Auditing the accepted NASA rows reveals different discharge rates, ambient temperatures, and cutoff voltages. This experiment therefore **does not repeat the earlier mixed-protocol 14-cell fit**.

The only strictly protocol-matched NASA stratum containing both a frozen training cell and a frozen test cell is **B0006 / B0018**: G1, 24 °C ambient, documented 2-A constant-current discharge to 2.5 V, shared 1.5-A CC / 4.2-V CV charging protocol. The bundled NASA README was inspected directly in `data/hstu/1. BatteryAgingARC-FY08Q4.zip`. B0005 and B0007 have different cutoffs and were not added to fill training/validation slots. Ambient temperature describes the protocol, not a constant measured cell temperature.

**No protocol-matched validation cell exists.** Two already-defined, fixed estimators were fitted and evaluated as exploratory experiments; there was no hyperparameter search, winner selection, validation score, refitting on test, or release selection. The existing production training CLI correctly requires nonempty train/validation/test partitions. It was left unchanged. A new offline runner reuses its candidate definitions, feature/target code, metrics, baselines, and terminal policy, while explicitly recording the incomplete experimental design. These artifacts are research outputs, not a completed deployment-validation run.

B0018 was already inspected in previous V1–V3 evaluation. Its results below are **reused-test exploratory evidence**, not a fresh independent final evaluation. No future tuning should present it as untouched.

## Input and label audit

The master CSV hash is `24023cc3db3ff776ba9e72f63760b3f8a65bf9302df981de0e63ca94513a934e`. All **59 source-file hashes** in its manifest were checked. The accepted NASA CSV hash remains `6b8bbdbffcf0218b6ab173920ce25010735e025c664a60ab420f978b7c55e825`.

| Source | Master observations | Action in this experiment |
|---|---:|---|
| NASA aging ARC | 2,750 | Match exactly 929 accepted complete-discharge prefix records; retain 300 protocol-matched cycles for this experiment; do not fit other protocols |
| NASA randomized usage | 423,810 | Exclude: partial/load-step observations, sparse reference measurements, unsupported dense aging-cycle axis |
| XJTU | 13,206 | All 13 Batch 1–2 dense cells reserved; **zero fitting, selection, or scoring rows**. Other batches excluded for rate/partial/sparse incompatibility |
| Oxford degradation | 1,038 | Exclude: sparse characterization checkpoints, different protocol/form factor; no fabricated dense cycles |
| Oxford unidentified example | 1 | Diagnostic only; no supported lifetime target |

The NASA quality release contains 14 cells, 929 cycles and 845 feature rows. Nine cells are censored; five have observed crossings. Its original exclusions remain in force: 20 of the 34 raw NASA batteries, plus all records after a rejected discharge in retained prefixes. The 1,821 additional positive NASA capacities in the master are diagnostic observations outside the accepted prefixes, not newly eligible training data. The raw quality report counts 1,865 excluded records including 44 invalid capacities absent from the positive-capacity master.

The runner matched every accepted master row to its validated CSV counterpart, including battery identity, source operation ordinal/member hash, original discharge ordinal, exact double-precision capacity, first reference, SOH, RUL, censoring, cutoff, protocol, and frozen role. Labels were recomputed independently from capacity histories. Early cycles 1–6 remain available as history even though they cannot themselves produce feature rows. No rows were interpolated, renumbered after a gap, or replaced with later/max/nominal references.

Label rules remain:

- SOH = `min(100, 100 * capacity_Ah / first_credible_completed_discharge_Ah)`; raw Ah remains uncapped.
- EOL is the first observed SOH **≤80%** in the uninterrupted accepted prefix.
- Target-cycle RUL is `max(0, EOL_cycle - t)`, in subsequent completed-discharge cycles.
- No observed crossing means an unknown/censored RUL target, never zero or an invented lifetime.
- RUL fitting uses strictly pre-EOL targets only. Terminal zeros are assessed separately with the existing observed-history guard.

NASA's source text describes scalar Capacity “till 2.7 V” despite differing discharge cutoffs. Existing sample-completeness and capacity-integral screens support the retained operational measurements, but cannot resolve that documentation ambiguity or independently certify instrumentation. This experiment conservatively matches protocols rather than harmonizing those quantities. Neither the source nor this experiment establishes EV-pack validity.

## Frozen roles and protocol separation

The complete original `split-manifest.json` was copied byte-for-byte into the new experiment. No cell was reassigned. A separate `experiment_partitions` field records the subset actually fitted/scored; it does not replace the original split or pretend the missing validation partition is populated.

| Protocol / ambient / cutoff | Accepted cells, with original role | Decision |
|---|---|---|
| G1 / 24 °C / 2.2 V | B0007 validation | Separate; no matching train/test |
| G1 / 24 °C / 2.5 V | **B0006 train; B0018 previously inspected test** | Fixed exploratory fits only; no validation |
| G1 / 24 °C / 2.7 V | B0005 train | Separate |
| G2 / 24 °C / 2.0, 2.5, 2.7 V | B0025, B0027, B0028 train, respectively | Three separate strata, not pooled |
| G3 / 43 °C / 2.0, 2.2, 2.5, 2.7 V | B0029 train, B0030 validation, B0031 test, B0032 test, respectively | Four separate strata, not pooled |
| G7 / 4 °C / 2.2, 2.5, 2.7 V | B0046 train, B0047 train, B0048 validation, respectively | Three separate strata, not pooled |

Across the 13 strata, none has all three original partitions represented. Group identifiers retain documented loading protocols; the partition key also separates ambient and cutoff. A filename, equal nominal capacity, or equal relative SOH does not establish compatibility.

All 13 reserved cell UIDs are recorded in `external-reservation.json`: Batch 1 `2C_battery-2, -3, -4, -6, -7`; Batch 2 `3C_battery-1, -2, -3, -4, -6, -8, -10, -11`. Batch-qualified UIDs prevent repeated filename suffixes from becoming shared identities. Their 4,092 dense cycles and 4,014 potential feature rows were **not** used for experiments. They have been quality-inspected previously, so “reserved” means not fitted/selected/scored here, not that nobody has seen their raw measurements. Four have candidate observed crossings; nine are censored. Initial low-rate reference versus subsequent discharge-rate effects still need review before external interpretation.

| Actual experiment population | Capacity/SOH | Strictly pre-EOL RUL | Known terminal histories |
|---|---:|---:|---:|
| B0006 training: 168 cycles, first crossing 61 | 162 target rows, cycles 7–168 | 54 rows, cycles 7–60 | 108; excluded from RUL fit |
| Validation | **Unavailable** | **Unavailable** | — |
| B0018 reused test: 132 cycles, first crossing 75 | 126 target rows, cycles 7–132 | 68 rows, cycles 7–74 | 58, cycles 75–132 |

Neither of these two cells is censored. The other nine censored NASA histories remain identified in `label-audit.json`; they were not relabeled to manufacture RUL evidence.

## Features, preprocessing and fixed configurations

Ordered existing 13-feature contract, unchanged: `cycle_idx`, `log_cycle`, `cycle_squared`, `cycle_sqrt`, `cap_lag1`, `cap_lag2`, `cap_lag5`, `cap_roll3`, `cap_roll5`, `deg_rate`, `deg_rate5`, `initial_cap`, `cap_drop_pct`.

For target `t`, capacity-derived features use only `Q[1]` through `Q[t−1]`. Current capacity is required as an observation/target but is not an estimator feature. The audit perturbed each current capacity and confirmed feature invariance. No current SOH, future capacity, EOL position, battery ID, whole-life summary, source metadata, or optional signal mean enters a regressor. Test histories can use earlier measured capacities from the same held-out cell: this is rolling one-step observation-conditioned evaluation, **not** a forecast of its entire life from cycle 7 without further measurements.

The first reference is observed history, not target-derived normalization. The separate terminal guard legitimately examines the supplied history through current cycle `t` and does not feed that current observation into the estimator. Approval remains mandatory before any public prediction.

Both estimators use a separate `StandardScaler` fitted only on the corresponding B0006 fitting rows; no validation/test/external cell reaches `fit()`. Scaling is retained for parity with existing sklearn pipelines, not claimed necessary for trees. Two combined capacity/RUL bundles were fitted with seed 42:

- RandomForest: 200 estimators, maximum depth 12, one job, existing defaults.
- GradientBoosting: 100 estimators, maximum depth 3, learning rate 0.08, existing defaults.

All complete estimator parameters and package versions are saved as JSON; whole-number floating parameters such as `max_features: 1.0` retain their JSON floating representation. Capacity predictions are converted to capped relative SOH using the same first reference; a separate direct-SOH model was not introduced. Baselines are previous-capacity persistence and the **training-only** pre-EOL RUL mean (27.5 cycles). The served RUL comparison rounds candidate and baseline to integer cycles with the same terminal policy.

## Actual reused-test results

These are measured B0018 results. Aggregate and per-battery scores are identical because there is **only one test battery**. JSON preserves full precision and explicit sample counts. `R²` is the coefficient of determination; `Pearson R` is correlation. They are not interchangeable. A constant RUL baseline has undefined Pearson correlation, recorded as `null`.

| Model / baseline | Target, units | n | MAE | RMSE | R² | Pearson R |
|---|---|---:|---:|---:|---:|---:|
| RandomForest | Capacity, Ah | 126 | 0.055462023 | 0.066072571 | 0.792213 | 0.978835 |
| GradientBoosting | Capacity, Ah | 126 | 0.057884259 | 0.067659387 | 0.782112 | 0.977346 |
| Persistence | Capacity, Ah | 126 | 0.014474088 | **0.023006926** | 0.974806 | 0.987870 |
| RandomForest | SOH, percentage points | 126 | 2.903688 | 3.482648 | 0.801351 | 0.976546 |
| GradientBoosting | SOH, percentage points | 126 | 2.868286 | 3.326049 | 0.818814 | 0.975439 |
| Persistence | SOH, percentage points | 126 | **0.780272** | **1.240263** | 0.974806 | 0.987870 |
| RandomForest, raw regressor | Pre-EOL RUL, cycles | 68 | 14.777794 | 15.809559 | 0.351221 | 0.986796 |
| GradientBoosting, raw regressor | Pre-EOL RUL, cycles | 68 | 15.263942 | 16.441021 | 0.298359 | 0.985050 |
| Training mean, raw | Pre-EOL RUL, cycles | 68 | 17.720588 | 20.838666 | −0.127190 | undefined |
| RandomForest, integer policy | Pre-EOL RUL, cycles | 68 | 14.735294 | 15.755485 | 0.355651 | 0.987221 |
| GradientBoosting, integer policy | Pre-EOL RUL, cycles | 68 | 15.294118 | 16.463864 | 0.296408 | 0.984942 |
| Training mean, integer policy | Pre-EOL RUL, cycles | 68 | 17.617647 | 20.676073 | −0.109669 | undefined |

For **each** candidate, the 58 observed-terminal B0018 histories produced zero RUL: MAE/RMSE 0 cycles, R²/Pearson undefined because actuals and outputs are constant. These deterministic cases are not additional independent RUL forecast evidence. Blended scores including them are available in JSON and intentionally not used to advertise forecasting performance.

The models have strong trend correlation but substantial absolute bias. Training on one compatible cell provides little between-cell variability; tree models cannot establish capacity-scale or lifetime transfer from this experiment. High correlation does not counteract the worse capacity errors. The larger 14-cell V3 numbers are not directly comparable because this experiment deliberately excludes its other protocols.

## Deployment and compatibility decision

Both bundles fail the unchanged numerical capacity gate: candidate pooled capacity RMSE must be **≤** persistence RMSE on the same rows, with zero tolerance. This cohort's exact ceiling is **0.023006925739351557 Ah**; RF yields **0.0660725705846309 Ah**, GB **0.06765938661500395 Ah**. The earlier V3 ceiling is not transplanted onto a different cohort.

Both also lack a compatible validation battery, reuse an inspected test cell, and have only one observed-EOL test battery instead of the existing minimum three independent batteries. No model is selected. Existing `review_candidate.py` was not bypassed or modified: its complete three-partition dataset contract is not fulfilled by this restricted experiment, so a formal eligible deployment review cannot be claimed. Individual numerical/compatibility checks are saved separately, not substituted for that review.

Offline checks passed for ordered fitted feature names, serialization prediction parity, manifest/bundle hashes, target units, exact feature/terminal-policy metadata, and training-only scaler means. The strict loader rejects both actual new manifests with `Model is not approved`. Both preserve `approved: false`; no environment file or active model configuration was changed. The terminal guard returned zero for all 58 known-terminal test rows under both models. The backend real-FastAPI integration separately confirms that even observed EOL cannot bypass approval and failed inference creates no false predictions.

## Saved outputs and reproducibility

New, local versioned directory: [`ml-service/runs/nasa-protocol-dense-20261019-v1/`](../ml-service/runs/nasa-protocol-dense-20261019-v1/). Like existing runs, it is intentionally Git-ignored; preserve/copy this directory separately if handing off a checkout. The report and runner are reviewable source additions.

- `config.json`: fixed model configurations, seed, base commit, packages/platform, explicit no-selection decision; saved before fitting/scoring.
- `validated_cycles.csv`, `battery-quality-manifest.json`, `split-manifest.json`: exact original inputs/assignments, copied unchanged. These retain all accepted NASA rows for provenance; each model manifest separately names the only cells actually fitted/scored.
- `label-audit.json`: source-hash verification, inclusion/exclusion counts, all accepted per-cell labels/censoring, 13 separate protocol strata.
- `external-reservation.json`: exact 13 XJTU UIDs; zero fit/scored rows.
- `RandomForest/` and `GradientBoosting/`: `bundle.joblib`, unapproved `manifest.json` with per-battery/aggregate evaluation, `compatibility.json`.
- `results.json`: both candidates, matching baselines, continuous/served metrics, failed gates and limitations.
- `source/`: exact source snapshots; `artifact-index.json`: SHA-256 index of experiment files.
- `preservation.json`: **144 pre-existing files** hashed before/after, all unchanged, including existing artifacts, application source, strict loader, gates, accepted dataset and splits. All 59 master source files also matched their recorded hashes.

Candidate bundle hashes:

| Candidate | SHA-256 |
|---|---|
| RandomForest | `d67fccf4de9ad74f0f0fe69d5ed3dcadb7ea2455a6471fe05c9bcc804c2886b3` |
| GradientBoosting | `9530226d22f5907cc2cc88cc588cd79be74b8039d55fe4b9baed5aad1ed01764` |

From `ml-service`, reproduce using a **new** output name (existing names are rejected):

```powershell
python -B dense_experiment.py --output runs/nasa-protocol-dense-20261019-v2
python -B -m pytest tests -q --tb=short -p no:cacheprovider
```

Use the recorded environment: Python 3.11.9, numpy 2.4.0, pandas 2.3.3, scipy 1.16.3, scikit-learn 1.6.1, joblib 1.6.0, FastAPI 0.141.1, pytest 8.4.2, httpx 0.28.1. No dependencies were installed or upgraded. To inspect hashes without unpickling, use PowerShell `Get-FileHash -Algorithm SHA256 <file>` and compare the index. Only trusted locally generated bundles should be unpickled.

## Executed tests

| Check | Actual result |
|---|---|
| New master-label/protocol audit tests | **15 passed**; bad labels/references, nonfinite capacity, fabricated censored RUL, source/role/protocol drift, duplicate/missing records and unsafe output location are rejected |
| Full Python suite: `python -B -m pytest tests -q --tb=short -p no:cacheprovider` | **74 passed**; includes causal features, targets, missing inputs, EOL guard, censoring, manifest/cache, conversion and training workflow |
| Backend: real-ML journey, pipeline and ML client suites, `RUN_REAL_ML_TESTS=1` | **3 suites / 43 tests passed**; disposable MongoDB, real ephemeral FastAPI, upload/status/refresh/retry and no false prediction persistence |
| Frontend: `node node_modules/vitest/vitest.mjs run` | **2 suites / 22 tests passed; 1 opt-in real-upload test skipped** because its separately started port-8000 service was not supplied for this ML-only run |
| Frontend: `node node_modules/vite/bin/vite.js build` | **Passed**, 70 modules; existing >500-kB bundle warning |
| Candidate offline compatibility | Both round-trip and feature-order checks passed; both strict-loader rejections passed; **0 positive terminal outputs** |

Initial sandbox execution could not create the run directory or replace existing frontend cache/build outputs. Permission was granted for those commands and they then completed. The first Python focused run passed with a cache-write warning; the full run used pytest's cache provider disabled. Frontend jsdom reports its existing unsupported canvas warnings. No application changes were made to suppress these warnings. The opt-in frontend network journey was not claimed as executed; the backend real-service journey did run. No production database was used.

Reviewable additions: [offline runner](../ml-service/dense_experiment.py), [focused tests](../ml-service/tests/test_dense_experiment.py), and this report; generated experiment files are under the new ignored directory.

## Next blocking issue

**There are too few compatible, independent dense histories to conduct validation-based selection and defensible final evaluation while preserving the split and external reservation.** Do not solve this by mixing protocols, splitting rows, moving old test cells, spending the reserved XJTU cohort on tuning, or changing deployment gates.

The smallest useful next data step is to obtain additional cells under a documented, consistent complete-discharge protocol with credible first references and sufficient observed 80% crossings. Freeze their battery-level roles before scoring: provide compatible validation data and at least three genuinely unused observed-EOL final-test batteries, plus enough independent training cells to learn between-cell variability. Keep censored batteries for SOH and explicitly unobserved RUL; event count alone does not establish adequate power.

Before any prospective XJTU external evaluation, freeze the NASA-developed candidate and separately review first-reference/rate compatibility and label provenance; retain all 13 cells as external-only. That future evaluation may reveal domain shift and cannot retrospectively validate or tune these experiments. A candidate must also beat matched persistence RMSE and satisfy every unchanged deployment check. Until then, demonstrate ingestion and truthful `MODEL_UNAVAILABLE` in the application and present these results offline. **Inference stays disabled.**
