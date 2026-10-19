# VoltSense unified battery discharge observations

This master CSV contains **440805 discharge observations** from four supplied corpora. It is a research catalogue, **not a ready-to-fit pooled training matrix, model approval, or frontend upload file**. No model was trained. Raw files, original artifacts, existing public/API/database contracts and deployment gates are unchanged.

CSV SHA-256: `24023cc3db3ff776ba9e72f63760b3f8a65bf9302df981de0e63ca94513a934e`. UTF-8, comma-separated, RFC-compatible quoting; empty cells mean unavailable/not applicable, never zero. Numeric capacities are Ah; booleans are `true`/`false`.

## Scope and identity

- `nasa_aging_arc`: unique B-cells from `data/hstu` (this is NASA, not verified HUST). Exact duplicate archive copies suppressed. Positive supplied discharge-capacity observations retained, even when not accepted for training; previous quality-prefix labels preserved.
- `nasa_randomized_usage`: all D-type step observations from 28 RW cells, including partial/pulsed/other steps as diagnostics. Only exact reference-discharge tests can carry candidate full capacity/SOH; partial throughput is never health capacity. Most rows therefore have no targets.
- `xjtu`: all 27 supplied cell cycle records. Full/partial cycles explicitly distinguished. Batches1/2 are dense candidates, Batch3 is rate-confounded, Batches4–6 have sparse full tests/mixed partial cycles.
- `oxford_degradation`: both C1dc and OCVdc characterizations, separate protocols but the SAME eight physical grouping IDs. These are sparse drive-cycle checks, not dense aging cycles.
- `oxford_example`: one dc example with no verified physical-cell assignment; diagnostics only, not another independent battery.
- Charge/rest/impedance-only records are excluded from this discharge-level table and counted in the manifest. Raw sample waveforms are not flattened; sample count, aggregate signals and exact source pointers support later inspection. Ambient compensation channels and redundant R/derived CSV representations are not independent observations.

## Column definitions

The manifest's `columns` dictionary is the exhaustive definition of every CSV column. Main groups:

| Group | Columns / meaning |
|---|---|
| Identity | observation_id; dataset_id; battery_uid; native_battery_id; measurement_stream; observation_kind |
| Provenance | source_file/member plus both SHA256 values; original source_record_index; source_cycle_index/unit; capacity_check_ordinal |
| Time | source_time; source_timezone=unknown; no fabricated UTC conversion. Oxford main t uses serial days; example seconds; XJTU stage minutes are converted only within segments |
| Capacity | discharge_capacity_Ah (full-test/source capacity); discharge_throughput_Ah (may be PARTIAL); capacity_method; reference_capacity_Ah and reference source/status |
| Labels | soh_percent/status; eol_threshold_percent=80; eol_observation_status; first_observed_eol_source_cycle/record; rul_cycles/status; is_censored |
| Eligibility/use | dense_history_valid; current_contract_eligible; eligibility_reason; existing_partition; recommended_use; quality_flags |
| Protocol/signals | protocol; chemistry; nominal_capacity_Ah; ambient_temperature_C; discharge_cutoff_V; signal_count; duration_s; mean_voltage_V; mean_discharge_current_A; mean_temperature_C |

Time units: duration seconds; voltage V; mean current discharge-positive A; temperatures C. The original time string/index and documented sign mapping remain traceable to source. Blank duration for XJTU is intentional: relative time resets between stages, so a whole-record span is not guessed. Ambient settings and cell temperatures stay separate; unsupported MCOS-clock ambient records were not joined.

`source_cycle_unit` is essential. NASA and XJTU Batches1–3 count completed discharges, but Batch3 is rate-confounded and ineligible for the current model despite that unit. Other XJTU records mix partial experiments; Oxford keys count drive cycles starting at baseline0; RW steps have no validated aging-cycle axis. `capacity_check_ordinal` is an observation index, never a replacement cycle count.

## Labels and quality

SOH = min(100,100*Q/Q_first_full_same_stream). Raw capacities are never capped, imputed or overwritten. No nominal/max/later favorable reference replaces a bad initial full reference. Sparse references (including XJTU Batch5's first full test at original record21) retain their actual location and cannot become dense cycle1.

`rul_cycles` is populated ONLY for compatible dense histories with an observed first80% crossing: max(0,E-t). No crossing means empty RUL, not zero. At/after an observed crossing RUL is zero, including recovery. Sparse detection indices remain descriptive in source units; no sparse check-count or interpolated physical crossing is passed off as cycle-based RUL.

The first failed full test closes the contiguous EOL/dense prefix. Later independent SOH candidates can still exist, but they cannot bridge an unresolved history gap. Existing NASA labels apply only to previously exported quality prefixes; invalid/other NASA observations remain diagnostics. New screened labels are candidates needing review, not a new approved scientific release. Review quality_flags and reference/soh_status, not just nonempty numbers. In particular RW references still require charge-context review and XJTU protocols contain reference-rate/stitching caveats.

Additional source-quality findings: three RW rows have comment=reference discharge but type=R and zero current (RW17 source3383, RW18 source3150, RW19 source3374). They are excluded as mislabeled rest markers, not converted into zero-capacity tests. There are947 actual D-type reference checks. Some RW temperature values are finite but physically implausible (sensor-like values around -4099 C). Their raw diagnostic means remain traceable and are flagged `implausible_temperature_C_retained_raw` when outside -50..100 C; this is a diagnostic screen, not a revised model acceptance gate. Do not use them as valid thermal features. Capacity-based candidate SOH does not consume temperature. Missing XJTU source timestamps remain blank and flagged; no timestamp is invented.

## Safe future training/evaluation

1. Do NOT fit directly on this file or call dropna then renumber. Select ONE dataset/protocol/stream with compatible dense full-discharge semantics and reviewed quality. Keep all original history rows 1..t; current_contract_eligible marks target-row eligibility after seven cycles, not rows to remove before feature generation. Never treat partial throughput as complete capacity.
2. For classic NASA, preserve existing train/validation/test identities and the original quality prefix. New rows outside that prefix are not a reason to undo previous exclusions. The prior test has already been inspected.
3. New cells remain `existing_partition=unassigned`. `recommended_use=external_validation_candidate` is advisory: do not silently put them in training. In particular reserve the13 fixed-protocol XJTU cells prospectively unless a different battery-level plan is explicitly agreed. There are only four observed event cells there, insufficient for standalone RUL train+validation+three-event test partitions.
4. Group splits by battery_uid across ALL streams, windows, representations and derived data. Exclude unidentified_example from modeling. Freeze hashes/IDs with seed42 before fitting; never random-split rows, checkpoints or pulses.
5. Create feature rows using unchanged ml-service/features.py from capacities STRICTLY BEFORE target t. The current capacity is a label/observation, not a same-target feature. Never feed SOH/RUL/EOL/censor flags, whole-life/source-length information or contemporaneous summary signals to the estimator. Fit preprocessing on train batteries only; select on validation, evaluate held-out once with baselines and per-battery counts.
6. To use the current NASA metadata loader, explicitly export ONLY a reviewed dense cell history to battery_id,test_id,type=discharge,Capacity,cycle, retaining source pointers and without closing gaps. This master intentionally lacks that deceptively generic loader shape; MAT/ZIP/master CSV is not a web demo upload contract.
7. Sparse RW/Oxford/XJTU checks need a separately reviewed feature/target/cycle-unit design. Do not change existing targets, gates or validators to make them fit. Candidate artifacts and inference remain unapproved until every existing gate and explicit approval passes.

No source here demonstrates EV-pack performance. Chemistry/protocol differences remain: XJTU NCM523/2Ah room-temperature cells versus Oxford740mAh pouch/40C and NASA protocols with incompletely specified chemistry. Current features have raw-Ah terms; percentage SOH alone does not erase domain shift.

## Manifest and reproducibility

The JSON records all59 source-file hashes, original NASA archive member hashes, grouped exclusions with counts/examples, per-cell/stream counts, label definitions, validation and exact generator source with its hash. Counts of redundant representations are files, not extra battery records. All source-file hashes are checked again after generation. No archives are extracted over raw data.

Use the existing Python NumPy/SciPy environment. To reproduce in a COPY of the repository, restore manifest.reproduction.generator_source to `.cache/reproduce_unified.py`, verify its SHA256 against generator_sha256, and run `python -B .cache/reproduce_unified.py` from that copy's repository root. ALL THREE output paths must be absent: the generator refuses overwrites. Source hashes/source-code contracts must match; do not delete or overwrite the supplied outputs to experiment. Generation timestamps differ but deterministic CSV bytes should match under recorded packages and unchanged inputs. The manifest embeds the generator so reproduction does not depend on retaining ignored scratch scripts.

See `docs/battery-dataset-suitability-report.md` for source/PDF inspection, missing release files, sparse-EOL uncertainty and local licensing findings. Oxford's supplied README declares ODbL/DbCL; NASA/XJTU explicit licenses were not established locally. Confirm permissions before redistribution. Raw Rda duplicates and ambient MCOS datetime were not independently decoded/aligned. No interpolation or future-filled MATLAB example features were used.

## Complete data dictionary

| Column | Definition / units |
|---|---|
| `observation_id` | Stable dataset/native-cell/source-member-hash/record/stream identifier; primary row key. |
| `dataset_id` | nasa_aging_arc, nasa_randomized_usage, xjtu, oxford_degradation or oxford_example. |
| `battery_uid` | Dataset-scoped physical-cell grouping key; blank for the unidentified example. |
| `native_battery_id` | Original B/RW/Cell ID or batch-qualified XJTU filename stem. |
| `measurement_stream` | Capacity measurement protocol; never pool different streams as successive cycles. |
| `observation_kind` | Dense discharge, reference check, partial/other discharge operation, or example profile. |
| `source_file` | Repository-relative source ZIP or MAT path. |
| `source_file_sha256` | SHA-256 of original source container/file. |
| `source_member` | ZIP member, if applicable; blank for an unarchived MAT. |
| `source_member_sha256` | Hash of decoded member bytes, or same as file hash for direct MAT. |
| `source_record_index` | Original 1-based MATLAB operation/cycle/step index; never compressed. |
| `source_cycle_index` | Original completed-discharge ordinal (NASA), XJTU record index, or Oxford drive-cycle key; blank for RW steps. |
| `source_cycle_unit` | completed_discharge_cycles, mixed_experimental_cycles, drive_cycles, or unavailable. |
| `capacity_check_ordinal` | 1-based measurement-stream index; NOT an aging-cycle identifier. |
| `source_time` | Original/normalized source timestamp string; no fabricated timezone. |
| `source_timezone` | unknown: source clock is not asserted UTC. |
| `discharge_capacity_Ah` | Supplied complete-discharge capacity or full-test integral/counter delta, Ah; blank for partial/invalid measurements. Inspect quality/status before use. |
| `discharge_throughput_Ah` | Integrated delivered charge over this observed operation, Ah; partial throughput is NOT health capacity. |
| `capacity_method` | Source scalar, reference current integral, or signed mAh-counter delta. |
| `reference_capacity_Ah` | First credible/provisionally screened full discharge in the SAME stream, Ah; never a maximum/later replacement. |
| `reference_source_record_index` | Source record of reference; identifies sparse/noninitial references explicitly. |
| `reference_status` | existing_nasa_quality_manifest, screened_first_full_candidate, or unavailable. |
| `soh_percent` | min(100,100*discharge_capacity_Ah/reference_capacity_Ah); blank when measurement/reference is not acceptable. |
| `soh_status` | existing_dense_label, candidate_dense_label, candidate_rate_confounded_label, candidate_sparse_label, or unavailable. |
| `eol_threshold_percent` | 80; unchanged project relative SOH threshold. |
| `eol_observation_status` | observed_dense, censored_dense, observed_sparse, not_observed_sparse, or unavailable. |
| `first_observed_eol_source_cycle` | First observed crossing on original source cycle axis; NOT an estimator feature; blank if axis/unobserved outcome unavailable. |
| `first_observed_eol_source_record` | Source operation/step index of first observed crossing; sparse detection, not continuous physical crossing. |
| `rul_cycles` | max(0,E-t), ONLY for compatible dense completed-discharge histories with observed EOL. Blank for censored/sparse/invalid histories. |
| `rul_status` | observed_dense_label, censored_unobserved, sparse_units_not_compatible, rate_confounded_unreviewed, or unavailable. |
| `is_censored` | true/false for a usable label stream; blank when reference/quality prevents that assessment. Sparse true means no observed detection, not dense RUL eligibility. |
| `dense_history_valid` | true only for an uninterrupted screened 1..t complete-discharge history under the dense contract. |
| `current_contract_eligible` | true only for dense_history_valid and t>=7; prospective data suitability, NOT model approval or permission to train on a holdout. |
| `eligibility_reason` | Explicit compatibility/exclusion reason. |
| `existing_partition` | Original NASA train/validation/test or excluded; new corpora unassigned. Never overwrite existing split. |
| `recommended_use` | NASA development/validation/previously-inspected test, or external_validation_candidate; advisory, not a new split. |
| `quality_flags` | Pipe-separated per-observation/reference/prefix warnings. Empty does not imply production certification. |
| `protocol` | Source protocol/description; retain discharge rates and cutoff distinctions. |
| `chemistry` | XJTU NCM523 if documented; otherwise lithium_ion_subtype_unspecified. |
| `nominal_capacity_Ah` | 2.0 for documented NASA aging/XJTU cells; 0.740 Oxford; blank RW (not assumed). |
| `ambient_temperature_C` | Source-declared ambient/chamber setting, Celsius; blank unknown. Not measured cell temperature. |
| `discharge_cutoff_V` | Source protocol cutoff, V; blank where not a full test/unspecified. |
| `signal_count` | Number of samples in observation. |
| `duration_s` | Observed operation duration, seconds; blank for unresolved timing. |
| `mean_voltage_V` | Observation mean voltage, V; contemporaneous diagnostic, not a causal feature for the same target. |
| `mean_discharge_current_A` | Mean discharge-current magnitude, A; always discharge-positive after documented sign mapping. |
| `mean_temperature_C` | Mean cell temperature over observation, C; not substituted from ambient. |
