# V3 deployment-gate decision

**Decision: V3 cannot pass the current deployment gates. Keep inference disabled.** This was a read-only audit of existing V3 predictions, manifests, source and data. No model was fitted, no approval flag or gate changed, no battery was reassigned and no artifact was overwritten.

## Exact capacity acceptance rule

The existing rule in [review_candidate.py](../ml-service/review_candidate.py) rejects when:

~~~python
evaluation['capacity']['rmse'] > evaluation['baselines']['capacity']['rmse']
~~~

Thus passing requires candidate capacity RMSE **≤** same-cohort persistence capacity RMSE. Equality passes. There is no numerical tolerance, allowed percentage regression, MAE exception, per-battery majority vote, or substitution of SOH RMSE. This audit leaves that rule unchanged.

[training.py](../ml-service/training.py) computes RMSE as sqrt(mean((predicted_capacity_Ah − observed_capacity_Ah)²)) across all held-out rows. Persistence predicts target capacity Q[t] using cap_lag1=Q[t−1]. The calculation uses raw Ah, not capped SOH. These are pooled row-weighted errors, not an equal-weighted average of battery RMSEs.

I loaded the unchanged V3 bundle offline, reconstructed features using the bound dataset and frozen split, and recomputed both scores. They match the stored evaluation within 1e−15 Ah. Correct cohort: **194 target-cycle examples**, cycles 7 onward, from **B0018 (126), B0031 (34), B0032 (34)**. No training or validation rows enter the comparison.

| Quantity | Recomputed value |
|---|---:|
| Exact persistence RMSE ceiling | **0.020661328542490476 Ah** |
| V3 capacity RMSE | **0.020778746896882725 Ah** |
| Excess | **0.00011741835439224926 Ah** |
| Relative excess | **0.5683001175397662%** |
| V3 capacity MAE | 0.012435190802068868 Ah |
| Persistence capacity MAE | 0.013902553722612253 Ah |
| Capacity gate | **FAIL** |

Better MAE does not pass this RMSE gate. Model selection used validation macro per-battery SOH MAE; the deployment rule uses pooled held-out capacity RMSE. They are different criteria, units and populations. The small RMSE difference is not claimed statistically significant; the implemented gate nevertheless has zero tolerance.

| Battery | Rows | V3 capacity RMSE, Ah | Persistence RMSE, Ah |
|---|---:|---:|---:|
| B0018 | 126 | 0.023798165920591665 | 0.023006925739351557 |
| B0031 | 34 | 0.012484452171761357 | 0.0152957313542611 |
| B0032 | 34 | 0.014451738823879418 | 0.015499515453358474 |

B0018’s larger error and greater row count outweigh the improvements on the other two batteries in the pooled calculation. This ceiling is cohort-dependent, not a universal 0.020661-Ah product specification. A future preregistered experiment must compute persistence on its own matching test rows without erasing this failed result.

## Available independent RUL evidence

The [quality manifest](../data/validated/nasa-20261016/battery-quality-manifest.json) contains 34 batteries. Fourteen meet the current quality rules; five have observed 80% crossings. Their credible references, retained histories and usage are:

| Battery | Reference, Ah | Retained discharges | First 80% crossing | Verified role in V1/V2/V3 |
|---|---:|---:|---:|---|
| B0005 | 1.8564874208181574 | 168 | 101 | train |
| B0006 | 2.035337591005598 | 168 | 61 | train |
| B0007 | 1.89105229539079 | 168 | 124 | validation |
| B0018 | 1.8550045207910817 | 132 | 75 | test |
| B0047 | 1.6743047446975208 | 19 | 18 | train |

The original [split manifest](../data/validated/nasa-20261016/split-manifest.json) is unchanged. Training/evaluation manifests were inspected across every V1/V2/V3 candidate/evaluated directory. Training and validation imply development use; test use is recorded only where an evaluation manifest exists. **There are zero unused, eligible observed-EOL batteries.**

The other eligible batteries are censored: B0025, B0027, B0028, B0029, B0030, B0031, B0032, B0046 and B0048. They were already assigned to training/validation/test for capacity/SOH. Their missing RUL outcomes cannot be replaced by an extrapolated crossing or a zero label.

Twenty raw batteries remain excluded under existing reference/completeness/contiguous-history rules. B0026 and B0042–B0044 have fewer than seven valid initial consecutive discharges; the other sixteen fail the initial-reference envelope and/or measurement screens. They are not an eligible untouched cohort merely because they did not enter V3 fitting. No later/maximum capacity reference, interpolation, gap compression or exclusion override was applied. The detailed per-battery reasons remain in the quality manifest and machine-readable audit.

Legacy model_config.json also reports 33 training-source batteries without enumerating IDs or partitions. It cannot prove which additional cells were historically untouched. No freshness claim is inferred from that incomplete provenance.

Current RUL testing has **68 pre-EOL forecast examples from one previously inspected battery, B0018**. The 58 terminal histories are known outcomes from the same battery, not 58 independent validation units. B0031/B0032 make the capacity test count three, but their censored labels do not meet the RUL requirement.

The existing review blocks observed RUL test battery_count <3 and separately blocks previously_inspected_test=true. Moving B0007 from validation or B0047/B0005/B0006 from training to a test list cannot make them fresh. Repartitioning these fourteen batteries, renaming cells or treating serial rows as independent batteries would not resolve the evidence gap.

## Candidate compatibility and approval

V3’s evaluated and training copies have identical bundle bytes. SHA-256: `d0c845dccd6524850618ccc37503b92a8753b512e013b24d3c52725b4f59ff46`. Bound CSV SHA-256: `6b8bbdbffcf0218b6ab173920ce25010735e025c664a60ab420f978b7c55e825`.

Offline checks passed: exact thirteen-feature order, fitted preprocessing/pipelines, target/unit definitions, first-discharge reference, 80% threshold, inference-policy parity, model identity, artifact containment/hash, dataset/split binding and recorded source-code hashes. The existing review also confirmed scaler means were fit on training rows only.

Serialization and feature parity were checked both in the audit environment and the actual project **ml-service/.venv**: Python 3.11.9 and scikit-learn 1.6.1. The V3 bundle deserializes and the observed-history terminal policy returns zero in that environment. No package was installed/upgraded.

Both real candidate manifests remain approved=false. Calling the unchanged strict load_approved function rejects them with **Model is not approved**. No approval bit was temporarily changed, even in a copied V3 manifest. Equivalent later loader-field checks were performed offline; this does not mean the strict loader accepted the artifact for serving.

The layers are distinct: review_candidate.py records evidence/rejection reasons and always emits approved=false; model_loader.py enforces explicit approval and structural/runtime compatibility. The loader does not independently recompute accuracy or create an untouched cohort. Toggling approval to bypass a failed scientific review is not a resolution. Even a future clear review requires an explicit deployment approval.

## Reverified behavior

- Actual V3 bundle, offline: all **58** held-out at/post-EOL supplied histories return zero through the shared policy; none returns positive served RUL. Censored batteries retain unobserved labels.
- Actual unapproved V3 manifest through FastAPI TestClient: pre-EOL, at-EOL and post-EOL/recovery requests all return **503 MODEL_UNAVAILABLE**. The known terminal rule does not bypass approval.
- Existing approved serialization-fixture tests verify the successful endpoint schema, zero at/post-EOL, recovery handling, pre-EOL forecasts and missing-capacity rejection. These fixtures are untrained test doubles and are not a production candidate.
- Real frontend upload/polling modules → Express → running FastAPI: the synthetic demo upload passes the five ingestion stages, fails honestly at the unavailable-model gate, persists failure across client refresh/re-login and creates zero predictions. The database is disposable MongoDB.
- Backend tests additionally cover retry, persisted original EOL cycle, numeric zero in vehicle/history data and no false predictions when unapproved. No live application database records were changed.

The distinction is essential: **known-terminal policy output is zero; the unapproved public prediction endpoint remains unavailable**. A public V3 success response would contradict the approval requirement. No visual browser session or approved-candidate deployment is claimed.

## Smallest defensible next experiment

The current corpus cannot supply the required untouched cohort under its existing eligibility rules. No evaluation was scheduled on invented/reserved IDs; the machine-readable plan explicitly has an empty untouched cohort and blocked status.

A future experiment requires the following, before any new final-cohort model outputs are inspected:

1. Obtain at least three genuinely independent, previously unused batteries with verifiable physical/source identities, units, credible first completed references, valid ordered discharge histories and observed relative 80% crossings after sufficient causal history. Screen provenance, aliases, duplicate trajectories and unresolved gaps using the established rules; do not cherry-pick by model error. Additional label counts alone do not establish independence.
2. Freeze raw hashes, quality decisions, cycle CSV and cohort membership before scoring. Preserve the original dataset/split as historical evidence; keep old test batteries B0018/B0031/B0032 out of new training/validation and never describe them as fresh. New experiment test membership must contain only the new cohort.
3. Address capacity-model development using training/validation evidence only if a replacement is needed. Do not retrain the identical setup simply to rerun the same failed comparison or tune against the inspected test set. Freeze any replacement before the prospective evaluation.
4. Evaluate once with the same causal features, target/policy rules and matched persistence baseline. Retain/report the current failed RMSE comparison and all negative results. A new cohort’s baseline is recomputed on that cohort; passing it cannot retroactively turn V3’s existing result into a pass.
5. Require every scientific/compatibility gate and explicit approval before activation. New data does not guarantee acceptable scores.

The current evaluator deliberately binds candidate provenance to a dataset and split SHA-256. A new cohort therefore requires a properly versioned dataset/split experiment, not editing the V3 hashes or pointing its existing manifest at unrelated data. No such experiment was fabricated or executed in this audit.

## Shortest honest demonstration now

Use the existing frontend with sample-data/demo_battery_cycles.csv in a dedicated demo account. Start FastAPI on 127.0.0.1:8000 only if not already running, plus the configured backend and frontend. In SOH & RUL, choose the CSV and Upload & analyze. Demonstrate parsed cycles, quality checks, five genuine ingestion stages, a clear MODEL_UNAVAILABLE inference failure and persisted failed state after refresh.

Alongside the UI, present the existing V3 offline evaluation and this read-only safety audit: actual candidate/baseline metrics, known terminal zeros, censored labels and the no-deploy decision. Do not present approved fixtures or synthetic data as predictive accuracy evidence. A successful live SOH/RUL demonstration cannot honestly use unapproved V3 today.

## Commands and actual verification results

From ml-service, reproduce the existing review without fitting or overwriting artifacts (choose a new output filename):

~~~powershell
python -B review_candidate.py --dataset ../data/validated/nasa-20261016/validated_cycles.csv --manifest runs/nasa-20261016-evaluated-v3/manifest.json --output ../.cache/v3-review-new-audit.json
python -B -m pytest tests/test_rul_policy.py tests/test_inference.py tests/test_dataset.py tests/test_conversion.py tests/test_raw_inspection.py -q --tb=short
~~~

The selected Python suites deliberately omit the synthetic training-workflow fit test: **53 passed, no estimators fitted**. The offline recomputation reused existing fitted artifacts.

From backend (existing cached MongoDB binary; disposable database only):

~~~powershell
$env:TEST_MONGODB_URI = ''
$env:MONGOMS_RUNTIME_DOWNLOAD = 'false'
$env:RUN_REAL_ML_TESTS = '1'
npm test -- tests/mlClient.test.js tests/pipeline.test.js tests/realMlJourney.test.js tests/journey.test.js
~~~

**4 selected backend suites / 44 tests passed.**

From frontend, with the existing no-model/unapproved FastAPI service on 127.0.0.1:8000:

~~~powershell
$env:RUN_REAL_UPLOAD_TESTS = '1'
npm run test:smoke
npm run build
~~~

**3 frontend suites / 22 tests passed; production build passed.** Existing jsdom canvas and large-bundle warnings remain. Direct Node entry points equivalent to these npm scripts were used for the recorded test runs.

Forty-four existing source/artifact/data files and all forty-seven supplied raw corpus files matched their captured/manifest SHA-256 values. No application source, API/database contract, split, threshold, environment file, candidate/legacy artifact or approval state changed. The only reviewable additions are this decision and [machine-readable gate audit](v3-deployment-gates.json); scratch audit helpers are under ignored .cache/.
