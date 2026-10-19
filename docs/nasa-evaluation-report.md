# NASA held-out evaluation and deployment decision

This is the preserved historical V2 evaluation. See [V3 RUL consistency correction and retraining](rul-consistency-v3.md) for the current terminal-state policy, forecast-only metrics and remaining blockers. The V2 values below are unchanged evidence.

**Executed result: candidate retained for analysis; inference remains disabled.** No legacy artifacts, service contracts or database schemas were changed.

## Dataset and frozen partitions

The validated export has 929 discharge records from 14 batteries. It produces 845 capacity/SOH examples and 349 observed pre-EOL RUL examples; nine batteries are RUL-censored. Seed 42 grouped whole batteries and identical trajectories, stratified by availability of an eligible observed crossing before fitting. The 8/3/3 allocation is approximately 57%/21%/21%. Censoring was used only to populate evaluation partitions, never as an inference feature.

| Partition | Batteries | Capacity/SOH examples | RUL examples / batteries |
|---|---|---:|---:|
| Train | B0005, B0006, B0025, B0027, B0028, B0029, B0046, B0047 | 442 | 162 / 3 |
| Validation | B0007, B0030, B0048 | 209 | 118 / 1 |
| Final test | B0018, B0031, B0032 | 194 | 69 / 1 |

The [frozen manifest](../data/validated/nasa-20261016/split-manifest.json) binds the precise dataset hash. Assignments were frozen before first fitting. A later CSV precision correction preserved the exact same batteries and settings, without test-driven tuning. The initial and final outputs remain separately versioned. Do not redraw this final test set after examining results.

## Features, fitting and selection

The unchanged capacity-history-v2 contract uses target index t and only valid completed discharges strictly before t. At least seven consecutive cycles from original cycle 1 are required. Current capacity supplies the evaluation target, not a feature.

`cycle_idx, log_cycle, cycle_squared, cycle_sqrt, cap_lag1, cap_lag2, cap_lag5, cap_roll3, cap_roll5, deg_rate, deg_rate5, initial_cap, cap_drop_pct`

Cycle transforms are known at t. Capacity lags/rolling means use only preceding observations; degradation rates compare preceding capacities to the first reference. initial_cap is Q[1], available from historical observations, not a whole-history maximum. cap_drop_pct uses Q[t-1]. No current SOH, current/future capacity, EOL position, full-life length, battery ID, impedance, manufacturer or whole-history statistic enters the feature matrix. The exact formulas are saved in both candidate manifests and [features.py](../ml-service/features.py). Tests change current/future capacities and confirm unchanged features for t.

Both tasks compared RandomForest (200 trees, max_depth=12) and GradientBoosting (100 estimators, max_depth=3, learning_rate=0.08), with seed 42. Each sklearn Pipeline fits StandardScaler and the estimator using training batteries only. Validation selects minimum mean per-battery MAE (SOH for the capacity task); ties break by algorithm name. Selected pipelines are not refitted with validation/test data. The offline review independently verifies scaler means against training-only features. Full configurations and exact versions are recorded in the JSON report.

| Task / validation criterion | RandomForest | GradientBoosting | Selected |
|---|---:|---:|---|
| SOH macro battery MAE, percentage points | 0.515857 | 0.485344 | GradientBoosting |
| RUL macro battery MAE, cycles | 20.096568 | 22.461802 | RandomForest |

## Final held-out results

MAE/RMSE use Ah, SOH percentage points, or discharge cycles as labeled. R² is the coefficient of determination; Pearson R is a distinct correlation measure. Undefined statistics are null, not zero. Samples within a battery are correlated, so 194 rows are not 194 independent battery trials.

| Outcome | Method | Rows / batteries | MAE | RMSE | R² | Pearson R |
|---|---|---:|---:|---:|---:|---:|
| Capacity (Ah) | Selected candidate | 194 / 3 | 0.012435 | 0.020779 | 0.981235 | 0.990677 |
| Capacity (Ah) | Previous-capacity persistence | 194 / 3 | 0.013903 | 0.020661 | 0.981446 | 0.991151 |
| SOH (pp) | Selected candidate | 194 / 3 | 0.508888 | 1.049906 | 0.989138 | 0.994600 |
| SOH (pp) | Previous-capacity persistence | 194 / 3 | 0.549217 | 1.018637 | 0.989776 | 0.994998 |
| RUL (cycles) | Selected candidate | 69 / 1 | 8.637233 | 10.854320 | 0.702984 | 0.886262 |
| RUL (cycles) | Training-mean RUL | 69 / 1 | 17.390589 | 20.161843 | -0.024790 | null |

Persistence predicts current capacity from the immediately preceding completed capacity. The RUL baseline predicts the row-weighted mean RUL from observed training labels only; it never uses test crossing times or censored pseudo-labels. It is a limited baseline, not evidence that the candidate outperforms stronger survival/physics methods.

## Per-battery held-out performance

| Battery | Outcome | Rows | Candidate MAE / RMSE | Baseline MAE / RMSE | Candidate R² / Pearson R |
|---|---|---:|---:|---:|---:|
| B0018 | capacity | 126 | 0.013577 / 0.023798 | 0.014474 / 0.023007 | 0.973044 / 0.986680 |
| B0031 | capacity | 34 | 0.008968 / 0.012484 | 0.012072 / 0.015296 | 0.895462 / 0.957172 |
| B0032 | capacity | 34 | 0.011671 / 0.014452 | 0.013615 / 0.015500 | 0.935204 / 0.970233 |
| B0018 | soh | 126 | 0.731909 / 1.282917 | 0.780272 / 1.240263 | 0.973044 / 0.986680 |
| B0031 | soh | 34 | 0.000000 / 0.000000 | 0.000000 / 0.000000 | null / null |
| B0032 | soh | 34 | 0.191284 / 0.436099 | 0.242172 / 0.469008 | 0.841578 / 0.921504 |
| B0018 | rul | 69 | 8.637233 / 10.854320 | 17.390589 / 20.161843 | 0.702984 / 0.886262 |

The [machine-readable results](nasa-evaluation-results.json) contain all global and per-battery candidate/baseline metrics, sample counts, validation results, model parameters, dataset/source hashes, split assignments, code hashes and package versions.

## Why the candidate is not approved

1. RUL has only three training batteries, one validation battery and one final-test battery with observed labels. Censored batteries cannot validate RUL error. Generalization across protocols or EV packs is unproven.
2. Capacity MAE improves modestly over persistence, but RMSE is worse. SOH is capped at 100%; B0031 has zero SOH error and undefined correlation because all its evaluated SOH values are capped. This does not mean perfect capacity prediction.
3. The safety review finds **58 held-out rows at/after observed EOL with positive model RUL**. Those outputs violate the existing inference consistency contract. The model is not silently clipped to zero or replaced with extrapolation.
4. Mixed protocols, conservative prefix exclusion, nominal-reference envelope, coarse sampling and unresolved Capacity/cutoff semantics limit interpretation. No calibration, confidence interval, external EV dataset, or pack-unit adapter has been established.

These are deployment-review reasons, not claims of a pre-registered accuracy threshold. Neither final-test results nor this review were used to select or tune a replacement. Further model development should treat these test batteries as previously inspected and reserve genuinely fresh battery evidence for a new final test.

## Candidate artifacts and approval gate

- Training candidate: `ml-service/runs/nasa-20261016-candidate-v2/bundle.joblib` and `manifest.json`.
- Evaluated copy: `ml-service/runs/nasa-20261016-evaluated-v2/bundle.joblib`, `manifest.json`, and `approval-review.json`.
- Bundle SHA-256: `f18bb95a837e8d70f9d5308b749a64935878820a47c884df0c1641abd2030712`. Both manifests retain `approved=false`.
- Prior v1 outputs are preserved; all eight files in `ml-service/models/` are unchanged.
- Runs are Git-ignored generated artifacts. They exist locally; archive the candidate/evaluated directories with their manifests and hashes when sharing results. The validated data and frozen manifest are in the reviewable `data/validated/nasa-20261016/` directory.

The strict loader continues to require explicit approval, exact units/targets/features/order, matching sklearn version, contained local path, SHA-256 and fitted pipelines. Nothing was configured in environment files. Configuring this unapproved manifest still returns 503 MODEL_UNAVAILABLE; no legacy fallback is enabled.

## Reproduce using the delivered split

From `ml-service`, with the existing environment (numpy 2.4.0, pandas 2.3.3, scikit-learn 1.6.1, joblib 1.6.0; additional versions in the review JSON). Choose new output names because commands refuse overwrites:

~~~powershell
python -B training.py inspect --dataset ../data/validated/nasa-20261016/validated_cycles.csv
python -B training.py train --dataset ../data/validated/nasa-20261016/validated_cycles.csv --split-manifest ../data/validated/nasa-20261016/split-manifest.json --output runs/reproduction-candidate
python -B training.py evaluate --dataset ../data/validated/nasa-20261016/validated_cycles.csv --split-manifest ../data/validated/nasa-20261016/split-manifest.json --manifest runs/reproduction-candidate/manifest.json --output runs/reproduction-evaluated
python -B review_candidate.py --dataset ../data/validated/nasa-20261016/validated_cycles.csv --manifest runs/reproduction-evaluated/manifest.json --output runs/reproduction-evaluated/approval-review.json
python -B -m pytest -q
~~~

For a genuinely new dataset, the CLI can create a seed-42 split with `training.py split --dataset NEW_CSV --stratify-rul --output NEW_SPLIT.json`. For this published experiment, reuse the delivered frozen manifest; do not regenerate assignments. Metrics can be reproduced in the recorded environment; serialized file byte identity across package/platform changes is not promised.
