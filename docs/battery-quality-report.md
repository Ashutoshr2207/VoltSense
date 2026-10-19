# Battery quality report — executed NASA conversion

The complete supplied corpus was audited locally: **34 batteries, 2,794 discharge operations**. The conservative completed-discharge policy retained **929 cycles from 14 batteries**. Twenty batteries and 1,865 discharge records were excluded from this training export. Exclusion means unsupported for this particular capacity-history workflow, not proof that the physical battery is defective.

## Deliverables

- [Validated cycle CSV](../data/validated/nasa-20261016/validated_cycles.csv)
- [Machine-readable per-record quality manifest](../data/validated/nasa-20261016/battery-quality-manifest.json)
- [Conversion summary and exclusions](../data/validated/nasa-20261016/conversion-summary.json)
- [Frozen split manifest](../data/validated/nasa-20261016/split-manifest.json)
- [Training and evaluation report](nasa-evaluation-report.md)

Dataset SHA-256: `6b8bbdbffcf0218b6ab173920ce25010735e025c664a60ab420f978b7c55e825`. Raw MAT fingerprint remains `02ddf0beffdecd2c3b8eac040d271ea30783d8e77b6f2665450b60c06dac6827`, matching the prior read-only baseline. Every raw file and all eight legacy model-directory files were hash-verified unchanged.

## Fixed conversion policy

The converter uses supplied group metadata and protocol READMEs. It requires a positive finite scalar Capacity, at least 20 aligned finite time/voltage/current/measured-temperature samples, strictly increasing sample time, a 4.0–4.3 V initial reading consistent with full charge, and an observed loaded endpoint at or below the documented group cutoff + 0.15 V. The endpoint is the last sample with measured current below -0.1 A; the later rest-voltage rebound is not used as evidence of an incomplete discharge. Broad physical range screens reject unsupported measurements. Calendar start times must be valid and strictly increasing across source operations. Unsupported protocol mappings and conflicting metadata are rejected.

Independently integrated negative measured current must agree with supplied Capacity within max(0.03 Ah, 5% of Capacity). This is a conservative consistency screen, not a correction. The READMEs describe Capacity till 2.7 V despite group cutoffs between 2.0 and 2.7 V. That unresolved semantic difference motivates rejection of disagreements; integrated Ah never substitutes for the supplied target. Coarse sampling, pulse loading and cold operation can cause false exclusions.

The original first discharge must pass these screens. Additionally, a first capacity outside 1.4–2.4 Ah is outside the conservative fresh-reference envelope for the documented nominal 2 Ah cells. The lower bound is a quality applicability rule, **not a change of EOL from 80% to 70%**. It can exclude legitimate low-temperature behavior and should not be generalized to arbitrary batteries. In particular B0040 is excluded for its 0.6735 Ah initial reference even though its sample-level checks pass. No later or maximum capacity is selected.

Only an uninterrupted prefix starting at original discharge ordinal 1 is exported. At the first rejected discharge, all subsequent records are excluded, even if their measurements later appear valid. This prevents both feature and RUL labels from crossing unresolved gaps. A battery needs at least seven retained cycles. B0026 and B0042–B0044 have only five valid initial cycles, so the entire battery is excluded. B0046 retains 11 cycles, B0047 and B0048 retain 19 each. Later recovery is never used to justify an earlier reference.

These evidence-based screens do not independently certify laboratory protocols or complete CC/CV charging. Remote authenticity, calibration and acquisition details have not been independently verified. Reference-envelope and consistency exclusions bias the cohort toward supported histories; retained cells do not establish EV-pack generalization.

## Per-battery decision

| Battery | Raw discharges | Exported cycles | First 80% crossing | Exclusion / first prefix interruption |
|---|---:|---:|---:|---|
| B0005 | 168 | 168 | 101 | Full valid prefix |
| B0006 | 168 | 168 | 61 | Full valid prefix |
| B0007 | 168 | 168 | 124 | Full valid prefix |
| B0018 | 132 | 132 | 75 | Full valid prefix |
| B0025 | 28 | 28 | unobserved | Full valid prefix |
| B0026 | 28 | 0 | unobserved | fewer_than_seven_uninterrupted_valid_discharges |
| B0027 | 28 | 28 | unobserved | Full valid prefix |
| B0028 | 28 | 28 | unobserved | Full valid prefix |
| B0029 | 40 | 40 | unobserved | Full valid prefix |
| B0030 | 40 | 40 | unobserved | Full valid prefix |
| B0031 | 40 | 40 | unobserved | Full valid prefix |
| B0032 | 40 | 40 | unobserved | Full valid prefix |
| B0033 | 197 | 0 | unobserved | start_voltage_not_consistent_with_full_charge, capacity_integral_disagreement, questionable_initial_reference_capacity, fewer_than_seven_uninterrupted_valid_discharges |
| B0034 | 197 | 0 | unobserved | start_voltage_not_consistent_with_full_charge, capacity_integral_disagreement, questionable_initial_reference_capacity, fewer_than_seven_uninterrupted_valid_discharges |
| B0036 | 197 | 0 | unobserved | start_voltage_not_consistent_with_full_charge, questionable_initial_reference_capacity, fewer_than_seven_uninterrupted_valid_discharges |
| B0038 | 47 | 0 | unobserved | capacity_integral_disagreement, questionable_initial_reference_capacity, fewer_than_seven_uninterrupted_valid_discharges |
| B0039 | 47 | 0 | unobserved | capacity_integral_disagreement, questionable_initial_reference_capacity, fewer_than_seven_uninterrupted_valid_discharges |
| B0040 | 47 | 0 | unobserved | questionable_initial_reference_capacity, fewer_than_seven_uninterrupted_valid_discharges |
| B0041 | 67 | 0 | unobserved | questionable_initial_reference_capacity, fewer_than_seven_uninterrupted_valid_discharges |
| B0042 | 112 | 0 | unobserved | fewer_than_seven_uninterrupted_valid_discharges |
| B0043 | 112 | 0 | unobserved | fewer_than_seven_uninterrupted_valid_discharges |
| B0044 | 112 | 0 | unobserved | fewer_than_seven_uninterrupted_valid_discharges |
| B0045 | 72 | 0 | unobserved | capacity_integral_disagreement, questionable_initial_reference_capacity, fewer_than_seven_uninterrupted_valid_discharges |
| B0046 | 72 | 11 | unobserved | Stop before discharge 12: capacity_integral_disagreement |
| B0047 | 72 | 19 | 18 | Stop before discharge 20: invalid_capacity, documented_discharge_cutoff_not_observed, capacity_integral_disagreement |
| B0048 | 72 | 19 | unobserved | Stop before discharge 20: invalid_capacity, documented_discharge_cutoff_not_observed, capacity_integral_disagreement |
| B0049 | 25 | 0 | unobserved | start_voltage_not_consistent_with_full_charge, capacity_integral_disagreement, questionable_initial_reference_capacity, fewer_than_seven_uninterrupted_valid_discharges |
| B0050 | 25 | 0 | unobserved | start_voltage_not_consistent_with_full_charge, capacity_integral_disagreement, questionable_initial_reference_capacity, fewer_than_seven_uninterrupted_valid_discharges |
| B0051 | 25 | 0 | unobserved | start_voltage_not_consistent_with_full_charge, capacity_integral_disagreement, questionable_initial_reference_capacity, fewer_than_seven_uninterrupted_valid_discharges |
| B0052 | 25 | 0 | unobserved | start_voltage_not_consistent_with_full_charge, questionable_initial_reference_capacity, fewer_than_seven_uninterrupted_valid_discharges |
| B0053 | 56 | 0 | unobserved | capacity_integral_disagreement, questionable_initial_reference_capacity, fewer_than_seven_uninterrupted_valid_discharges |
| B0054 | 103 | 0 | unobserved | start_voltage_not_consistent_with_full_charge, capacity_integral_disagreement, questionable_initial_reference_capacity, fewer_than_seven_uninterrupted_valid_discharges |
| B0055 | 102 | 0 | unobserved | start_voltage_not_consistent_with_full_charge, capacity_integral_disagreement, questionable_initial_reference_capacity, fewer_than_seven_uninterrupted_valid_discharges |
| B0056 | 102 | 0 | unobserved | start_voltage_not_consistent_with_full_charge, questionable_initial_reference_capacity, fewer_than_seven_uninterrupted_valid_discharges |

## Target and provenance contract

SOH = min(100, 100 × raw Capacity / first credible reference Capacity). The CSV retains original double-precision Ah values (17 significant decimal digits); it does not replace capacities with capped SOH. EOL is the first observed SOH ≤80% within the retained uninterrupted history. RUL at target cycle t is max(0, EOL discharge ordinal minus t), including zero at/after the crossing. Histories with no crossing are censored and supply no RUL targets. Under the [V3 terminal-state policy](rul-consistency-v3.md), the RUL regressor is fitted only on strictly pre-EOL examples; known terminal zeros are evaluated separately. This updates label/serving handling without changing the validated CSV, source quality rules or frozen split.

Observed crossings: B0005=101, B0006=61, B0007=124, B0018=75, B0047=18. Nine retained batteries have unobserved RUL, including prefixes stopped at a quality failure. These are not fabricated EOL labels or assumed healthy endings.

Each CSV row retains battery_id, original all-operation ordinal test_id, original discharge ordinal cycle, source_record_id, source_file, source SHA-256, and the MATLAB operation start time. Timestamps have no source timezone, so none is invented. Time-series summaries are mean_voltage (V), mean_current (A, negative discharge), mean_temperature (measured °C), discharge_duration (s); ambient temperature, protocol group and cutoff are separate. These optional summaries are not model features. Source charge and impedance measurements remain in raw MAT files and are not causally mapped into features.

The manifest records every discharge, its measurements, exact rejection reasons, and whether it was exported. It hashes every supplied source file, including protocol descriptions and metadata. The local source.md attributes the corpus to NASA PCoE; this attribution is preserved without asserting remote provenance verification. The root and raw metadata.csv files remain battery-level tables and must not be passed to the cycle loader.

## Reproduction

From ml-service, choose a new output directory (existing outputs are never overwritten):

~~~powershell
python -B convert_nasa.py --source ../Battery_DataSet/Battery_DataSet --output runs/nasa-conversion-reproduction
python -B -m pytest tests/test_conversion.py tests/test_raw_inspection.py -q
~~~

The initial v1 exploratory export used 15-digit CSV formatting. The final v2 export preserves all double precision. Battery partitions were frozen before training and copied unchanged to v2; no features, hyperparameters or partitions were adjusted using held-out scores. Both earlier artifacts and final candidates remain under runs/. Use the delivered frozen split manifest for reproduction.
