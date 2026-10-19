# Battery dataset suitability for VoltSense

Inspection date: 2026-10-19. Scope: local files, source documentation and current ML implementation; no training, prediction scoring, conversion to a training release, split changes or model approval.

## Decision

**Keep the corpora separate initially. Use the existing validated NASA export to reproduce the development baseline, and inspect/adapt XJTU Batches 1–2 first among the new data. Prefer reserving that entire 13-cell subset for a prospective external evaluation of a frozen NASA-developed candidate.** It is the closest new match to the existing consecutive completed-discharge capacity contract. It is not automatically an approved dataset or evidence that V3 passes its gates.

If the goal instead becomes an XJTU-trained model, obtain more complete-discharge cells before spending this small subset on development: only four of its thirteen cells show the approved relative 80% crossing. That cannot supply separate observed-EOL training and validation batteries and at least three observed-EOL test batteries simultaneously. Reserve NASA randomized-use and Oxford for subsequent, separately specified domain-shift evaluations; their sparse reference measurements cannot be passed directly through the present feature contract.

The request initially mentioned three datasets. Four raw folders were present and the user confirmed inclusion of all four. `data/validated/` is an existing derivative, not a fifth independent corpus. Folder names are not reliable dataset identities: **`data/hstu/` contains NASA Battery Aging ARC archives, not verified HUST data.**

## Concise comparison

Counts below describe the files actually supplied, not an advertised full release. Diagnostic crossings are observations from the inspection rules explained below, not deployment-approved labels.

| Local folder / verified identity | Supplied cells and measurements | SOH evidence | RUL / censoring | Existing 13-feature compatibility | Recommended role |
|---|---|---|---|---|---|
| `hstu/`: NASA Battery Aging ARC | 6 ZIPs, 38 MATLAB entries, **34 unique B-cells**, 2,794 discharge operations | Supplied discharge `Capacity` in Ah, plus raw signals and impedance | Existing quality rules retain 14 cells / 929 cycles: 5 observed crossings, 9 censored; 20 cells excluded | Existing validated CSV works; ZIP/MAT files are not web uploads. Four duplicate archive members must not be counted twice | Existing development/regression baseline; **no new independent batteries** |
| `Nasa dataset/`: NASA randomized battery usage | 7 ZIPs, **28 cells RW1–RW28**, 1,117,894 steps; 950 candidate reference discharges | Ah can be measured by integrating documented reference-discharge current; no scalar capacity label in step schema | 25 raw first-reference ratio crossings; RW26/27/28 show none. Reference quality, gaps and cycle interpretation remain unresolved | Not direct: reference checks are interleaved with many partial/current steps; 1-A and 2-A references differ | Reserve for later operational-profile external validation after a dedicated, reviewed adapter/feature contract |
| `XJTU dataset/`: XJTU six-protocol experiment subset | **27 cell MATs**, 1 temperature-compensation MAT, 10 MATLAB scripts, 3-page PDF. PDF describes 55 cells, so local release is incomplete | Explicit cycle summary discharge Ah and raw within-step capacity/current/voltage/temperature | Batches 1–2: **4/13 cross, 9 censored** under first-reference 80%; other batches require protocol-specific separation | Closest fit: Batches 1–2 provide 4,092 consecutive complete-discharge records; other batches mix rate effects/partial discharges/checkpoints | First new adapter and preferred prospective external cohort; expand before standalone XJTU RUL training |
| `oxford/`: Oxford Battery Degradation Dataset 1 | **8 pouch cells**, 519 characterization records, plus one example drive-cycle MAT and README | Signed cumulative `q` in mAh allows complete C1 discharge capacity measurement | All eight have a first **observed checkpoint** crossing; actual physical crossing is interval-observed between checkpoints | Not direct: characterization about every 100 drive cycles, with additional missing checkpoints; cannot renumber as consecutive aging cycles | Keep as a later external chemistry/form-factor/temperature/protocol challenge under an explicitly approved sparse-history design |

No supplied corpus is field telemetry from an EV battery pack. Drive-profile laboratory cycling is useful domain variation, not EV-pack validation.

## Existing code and scientific contract inspected

Read [runtime contract](rebuild-contract.md), [ML README](../ml-service/README.md), [V3 deployment decision](v3-deployment-decision.md), `features.py`, `dataset.py`, `training.py`, `convert_nasa.py`, and existing quality/split manifests. The working tree's prior stabilization changes were preserved.

- `features.validate_history` requires at least seven positive finite Ah capacities, one cell, and **consecutive discharge ordinals 1..t**. It does not accept missing cycles, missing capacities or a checkpoint series disguised as dense history.
- The ordered features are `cycle_idx`, `log_cycle`, `cycle_squared`, `cycle_sqrt`, `cap_lag1`, `cap_lag2`, `cap_lag5`, `cap_roll3`, `cap_roll5`, `deg_rate`, `deg_rate5`, `initial_cap`, `cap_drop_pct`. For target `t`, all capacity features precede `t`; current capacity/SOH and future EOL are not predictors. Initial capacity remains raw Ah, so capacity-scale differences remain a domain shift even when SOH targets are percentages.
- SOH = `min(100, 100*Q/Q_reference)`. The reference is the **first credible completed discharge**, not the maximum, rated capacity, a later favorable measurement, or a future-normalized value. Keep uncapped capacities.
- EOL is the first observed SOH `<=80%`; RUL is `max(0, EOL_cycle-target_cycle)` under the approved completed-discharge convention. No observed crossing means an unobserved/censored RUL label. The known-terminal zero guard uses supplied history only and does not bypass approval.
- `dataset.load_dataset` accepts a cycle metadata CSV or an explicitly selected ZIP member with `battery_id,test_id,type,Capacity`; it is not a generic MAT or arbitrary ZIP loader. An explicit `cycle` field must preserve uninterrupted original discharge ordinals. Synthesizing sequential IDs after dropping unavailable cycles would defeat its gap checks.
- Express web uploads accept CSV/XLS/XLSX, not these raw ZIP/MAT files. Node's parser aggregates supported files; Python builds features. A within-cycle cumulative charge counter is not directly a complete-discharge `Capacity` column.
- Existing deployment requirements, including capacity RMSE against matched persistence, adequate independent observed-EOL test batteries and strict approval/compatibility checks, stay unchanged. V3's failed existing comparison is not erased by adding data.

## 1. `hstu`: repackaged NASA Battery Aging ARC

### Identity, files and fields

The six archives contain B0005/B0006/B0007/B0018; B0025–B0028; the B0025–B0044 group with B0035/B0037 absent; B0045–B0048; B0049–B0052; and B0053–B0056. The B0025–B0028 files occur in two archives. All **38 MAT-member SHA-256 values match the corresponding hashes in the existing battery-quality manifest**, proving that these are the same 34 raw cell files previously audited, including the four repeated files.

MATLAB variables are named by battery ID and contain `cycle` operation structs. Fields are `type` (charge/discharge/impedance), `ambient_temperature` (C), `time` (six-component MATLAB date vector) and `data`. Discharge data contain `Time` (seconds), `Voltage_measured` (V), `Current_measured` (A), `Temperature_measured` (C), load-channel current/voltage fields, and scalar `Capacity` (Ah). Charge and impedance operations have different schemas. Impedance observations include `Re`, `Rct`, complex impedance and sense/battery currents; they are not guaranteed one-per-discharge or present at inference time.

The operation-array index is a source record ID, **not** the completed-discharge cycle count. Preserve both. The bundled README describes group-dependent current/cutoff/temperature protocols; for B0005/B0006/B0007/B0018 it states 2-A discharges and cutoff voltages 2.7/2.5/2.2/2.5 V. It also describes a historical 30% rated-capacity fade stopping rule and `Capacity` “till 2.7 V,” even where group cutoffs differ. That inconsistency is already handled conservatively in the existing audit; it is not permission to switch VoltSense to 70% EOL or reinterpret capacities.

### Suitability and independence

Reuse [quality decisions](battery-quality-report.md) and [validated export](../data/validated/nasa-20261016/README.md): 14 retained cells, 929 cycles, 5 observed relative crossings and 9 censored. Reference/completeness failures and interrupted prefixes exclude the other 20; do not reinstate them just to increase test counts.

Existing roles remain:

- Train: B0005, B0006, B0025, B0027, B0028, B0029, B0046, B0047.
- Validation: B0007, B0030, B0048.
- Previously inspected test: B0018, B0031, B0032.

Observed-EOL cells are B0005 (101), B0006 (61), B0007 (124), B0018 (75), B0047 (18). Only B0018 supplies RUL outcomes in the existing test. All fourteen retained batteries have already served development/evaluation roles. Archive copies, regenerated CSVs or renamed IDs cannot become a fresh cohort. The `hstu` spelling does not establish HUST provenance, chemistry or an additional dataset.

## 2. `Nasa dataset`: randomized battery usage

### Verified file organization and experimental groups

Each ZIP contains four `data/Matlab/RW*.mat` files, four corresponding `data/R/*.Rda` files, `MatlabSamplePlots.m`, and README HTML/R Markdown. The bundled README explicitly says R and MATLAB contain the same cell data; count them once. MATLAB was used for numerical inspection; the redundant R serialization was not independently decoded.

| Archive number | Cell IDs | Documented loading |
|---|---|---|
| 1 | RW9–RW12 | Room-temperature random charge/discharge, setpoints -4.5..4.5 A; reference testing after about 1,500 loading periods |
| 2 | RW3–RW6 | Room-temperature random discharge, 0.5..4 A; recharge between discharge episodes; reference checks about every 50 RW cycles |
| 3 | RW1/RW2/RW7/RW8 | Random discharge with variable recharge duration; reference checks about every 50 RW cycles |
| 4 | RW25–RW28 | Higher-current-skewed random discharge, approximately 40 C |
| 5 | RW17–RW20 | Higher-current-skewed random discharge at room temperature |
| 6 | RW21–RW24 | Lower-current-skewed random discharge, approximately 40 C |
| 7 | RW13–RW16 | Lower-current-skewed random discharge at room temperature |

The skewed protocols use 0.5..5 A load setpoints changed about every minute; a setpoint period is not a full charge/discharge cycle. Raw MATLAB has `data.procedure`, `data.description`, and `data.step`. Each step contains `comment`, `type` (C/D/R), `time`, `relativeTime` (seconds), `date`, `voltage` (V), `current` (A), and `temperature` (C). Positive current denotes discharge and negative charge here, opposite to classic NASA/XJTU traces inspected. Sample spacing varies by step; do not substitute setpoint duration for sampling interval or integrate with an assumed fixed rate.

### Capacity and label assessment

There is no supplied scalar `Capacity`, SOH or RUL field. The README's own capacity example integrates **reference discharge** current against relative time and divides by 3,600 to obtain Ah. This is evidence-supported measurement extraction, not the unsupported integration of arbitrary partial telemetry into invented lifetime labels. Before accepting a capacity, validate charge/rest context, complete endpoint, timing, sign, sampling gaps and protocol consistency.

Uniform-protocol reference discharges are documented at 2 A to 3.2 V; skewed protocols use 1-A reference discharges, plus separate 15-W power tests and pulsed tests. Do not mix those tests into a single reference-capacity series. Exact comment strings distinguish `reference discharge`, `reference power discharge`, low-current and pulsed profiles.

All 28 MATLAB files were parsed. A numerical scan found 950 exact-comment reference discharges. Three have non-strict relative time and were not integrated: RW17 reference 3, RW18 reference 3, RW19 reference 2. Other steps also contain repeated/nonincreasing relative timestamps; RW7 has a cross-step experiment-time reversal. No nonfinite/unequal-length signal-array flag was found in the scanned step fields. This is a numerical screen, not complete physical/protocol validation.

Using only integrable reference measurements and each first reference, **25 cells show a diagnostic 80% ratio crossing**. RW26/RW27/RW28 show none; last reference ratios are approximately 84.42/81.77/82.09%. These are not yet certified censored/eligible labels: RW28's first loaded reference begins at 3.928 V, which needs full-charge-context validation, and other histories have intervening unresolved reference issues. Do not skip bad reference points and claim an uninterrupted history. In particular, the three early invalid references above occur before later diagnostic crossings.

The 950 reference observations are separated by substantial operation histories, not consecutive measured aging cycles. A future adapter must preserve source step, characterization-event index and actual completed aging-cycle/throughput count separately. Remaining reference checks, random-walk load steps, elapsed time, equivalent full cycles and completed discharge cycles are different units. **Do not present a reference-ordinal difference as VoltSense RUL in aging cycles.** Sparse observation also bounds the physical crossing between the last above-threshold and first below-threshold checks. No exact continuous EOL or missing capacity is inferred here.

These RW identities are absent from the recorded V1–V3 B-cell split. They are potentially new evidence, not automatically eligible current-contract tests. Resolve the adapter/units first; legacy config's unenumerated training count cannot certify the complete historical use of every possible source.

## 3. XJTU: closest dense-history extension, with important exceptions

### Source specification and supplied subset

The supplied [three-page protocol PDF](<../data/XJTU dataset/Data Introduction-Chinese.pdf>) identifies Lishen 18650 NCM523 (`LiNi0.5Co0.2Mn0.3O2`) cells, nominal 2,000 mAh/3.6 V, 4.2-V charge cutoff and 2.5-V full-discharge cutoff, tested at room temperature. It states 1-Hz acquisition and 55 cells over six protocols, with pauses due to interruptions and supplied records stitched/integrated. **Only 27 cell files are present**:

| Batch | Supplied filename stems | Count | Records per cell | Interpretation |
|---|---|---:|---|---|
| 1 | `2C_battery-2,-3,-4,-6,-7` | 5 | 393–408 | Fixed 2-C charge; full 1-C discharges after initial reference |
| 2 | `3C_battery-1,-2,-3,-4,-6,-8,-10,-11` | 8 | 131–322 | Fixed 3-C charge; full 1-C discharges after initial reference |
| 3 | `R2.5_battery-2,-3,-4,-8` | 4 | 552–667 | Full discharges to 2.5 V, cycling different discharge rates |
| 4 | `R3_battery-1,-4,-5,-7` | 4 | 601–799 | Most discharges stop at 3.0 V; full capacity checks every six records in supplied descriptions |
| 5 | `RW_battery-4,-7,-8` | 3 | 186–252 | Partial randomized discharges; first labeled capacity test at record 21, then every 11 records |
| 6 | `Sim_satellite_battery-2,-3,-6` | 3 | 908–1,226 | Satellite-style variable partial discharges and periodic full capacity tests |

IDs must include batch and source filename, e.g. `XJTU/Batch-1/2C_battery-2`; the suffix “battery-2” alone collides across batches. These are cell files, not EV packs. The PDF contains current/rate notation inconsistencies, including “2C (2A)” for a nominal 2-Ah cell and an omitted Batch-2 current. Do not silently repair a protocol by guessing; cross-check actual current traces and document any source correction.

### Schema, units and quality

Every cell MAT contains `data` (one struct per supplied cycle record) and `summary`. There is no explicit per-record numeric cycle-ID field: preserve the original MATLAB array index plus file identity, descriptions and `system_time` timestamps. `summary.cycle_life` equals the recorded array length, **not a verified VoltSense EOL label**.

Raw fields: `system_time`, `relative_time_min`, `voltage_V`, `current_A`, `capacity_Ah`, `power_Wh`, `temperature_C`, `description`. `system_time` contains timestamp strings. Relative minutes reset at operation boundaries within a cycle. Within-cycle `capacity_Ah` is an accumulating counter that also resets; the final record sample may be rest with zero capacity. `power_Wh` has energy units despite its name. Do not take its last sample, whole-record maximum or sum across rows as a complete-discharge label. Separate charge/rest/discharge using time resets and current/description, and cross-check the discharge summary against its counter/integral.

Summary arrays: `charge_capacity_Ah`, `discharge_capacity_Ah`, `charge_power_Wh`, `discharge_power_Wh`, `charge_median_voltage`, `discharge_median_voltage`, `charge_mean_voltage`, `discharge_mean_voltage`, plus `cycle_life` and `description`. No explicit SOH/RUL label is supplied. Initial capacity-test cycles in Batches 1–4/6 are documented at 0.2-C discharge; later rates differ. A relative capacity target therefore includes protocol/rate effects, not just irreversible aging.

All 27 cell summaries and **13,206 raw cycle records** were read. All supplied discharge-summary capacities are positive/finite; the required numeric signal arrays have no missing/nonfinite/unequal-length flag under this scan. This does not make partial discharge capacity a valid health label. Batches 1–2 provide **4,092** complete-discharge records. First discharge traces begin near 4.18 V and reach 2.5 V. Splitting negative-current discharge segments and converting minutes to seconds agrees with supplied discharge Ah within **0.000551 Ah** across these thirteen histories. This is a strong consistency check, not a new deployment-quality tolerance or an automatic acceptance rule. Timestamp reconstruction across experiment pauses still needs a converter audit.

In-memory histories from Batches 1–2 pass the **existing** `validate_history` and generate 13-value feature rows with `build_row`; no model was loaded or scored. A source-specific offline metadata adapter is still needed before `dataset.load_dataset` can read these MATs. Keep the original initial reference; supplied MATLAB examples start at cycle 2, which must not be copied into VoltSense's reference/history definition.

### Observed EOL versus censoring

For the two fixed protocols, the following crossings use each supplied first completed-discharge capacity, not nominal 2 Ah:

| Cell | Records | Reference Ah | First observed `<=80%` cycle |
|---|---:|---:|---|
| Batch-1 / 2C_battery-2 | 407 | 1.988 | None: censored |
| Batch-1 / 2C_battery-3 | 393 | 1.987 | 393 |
| Batch-1 / 2C_battery-4 | 396 | 1.990 | None: censored |
| Batch-1 / 2C_battery-6 | 408 | 2.024 | 398 |
| Batch-1 / 2C_battery-7 | 402 | 2.043 | 383 |
| Batch-2 / 3C_battery-1 | 299 | 1.983 | None: censored |
| Batch-2 / 3C_battery-2 | 292 | 2.056 | 285 |
| Batch-2 / 3C_battery-3 | 286 | 1.992 | None: censored |
| Batch-2 / 3C_battery-4 | 322 | 1.984 | None: censored |
| Batch-2 / 3C_battery-6 | 322 | 1.989 | None: censored |
| Batch-2 / 3C_battery-8 | 270 | 1.989 | None: censored |
| Batch-2 / 3C_battery-10 | 164 | 1.993 | None: censored |
| Batch-2 / 3C_battery-11 | 131 | 1.935 | None: censored |

Thus the PDF's statement that cells reached EOL cannot be substituted for measured relative-threshold evidence. For example, Batch-1 battery-2 ends at 1.598 Ah, above `0.8*1.988=1.5904 Ah`. Do not force its last row to zero RUL. The four observed-crossing histories can support cycle-based labels after chronology/completeness approval; the nine censored histories remain useful for capacity/SOH, not ordinary supervised RUL scoring.

Batch 3's varying discharge rate changes measured deliverable capacity. All four have raw ratio crossings, but those do not independently establish rate-controlled aging EOL. Keep this as a separate protocol-shift cohort unless target comparability is demonstrated. Selecting only a rate's records creates missing-history gaps for the current contract.

For Batches 4–6, use only identified full tests to assess capacity, preserving their original cycle locations. Batch-4 `R3_battery-4` crosses at full test 691, whereas blindly using every summary entry suggests 594. Batch-6 `Sim_satellite_battery-2` would be falsely called EOL at record 2 from its partial discharge, although its full capacity tests do not show the relative crossing. Batch 5 starts with partial-discharge capacities around 1.77–1.79 Ah; its first labeled full tests are at 21, around 1.87–1.88 Ah. A later full test must not be silently rebased as original cycle 1 to conceal the missing complete history.

The supplied `Codes/data_resample_4.m`, `_5.m`, `_6.m` and `Extract_features/main_4.m` explicitly spline-interpolate capacities across future reference tests; Batch-4 examples also replace the first reference with a subsequent capacity. Those scripts are **not leakage-safe ground-truth or causal preprocessing for VoltSense**. They were read, not executed. No interpolation, reference replacement, gap compression or resampled feature export was performed.

For completeness, the identified full-test sequences give these **diagnostic** outcomes outside the two fixed protocols. They are sparse/protocol-shift observations, not accepted dense-history training labels:

| Subset | First observed relative crossing at original record index | No observed crossing in the full-test sequence |
|---|---|---|
| Batch 3, full but variable-rate discharges | R2.5_battery-2: 539; -3: 655; -4: 549; -8: 609 | None; rate effects prevent treating these as rate-controlled aging labels |
| Batch 4, periodic full tests | R3_battery-4: 691; -7: 601 | R3_battery-1, -5 |
| Batch 5, first full test at record 21 | RW_battery-8: 208, relative to its first identified full test | RW_battery-4, -7; full initial reference/history before 21 is unavailable |
| Batch 6, periodic full tests | Sim_satellite_battery-6: 1,053 | Sim_satellite_battery-2, -3 |

For Batches 4/6 the initial reference is at record 1; for Batch 5 the provisional full-test reference is at 21, and does **not** satisfy the current original-cycle-1 dense-history requirement. Even an observed endpoint here does not reconstruct all preceding capacities. Checkpoint gaps make the unobserved physical crossing uncertain; no crossing in a valid reference series is censored, while an invalid/unavailable reference is a separate exclusion/uncertainty rather than an invented censor label.

### Temperature companion

`Temperature_Compensation_Data.mat` contains six `Temperature_Compensation` records with `temperature` vectors and `sys_time`, plus a MATLAB function workspace. It is a stationary ambient-monitoring channel, not six additional aging cells. Its MATLAB `datetime` is an opaque MCOS object under the installed SciPy reader; absolute alignment was not resolved. Do not align by row position or call this cell surface temperature. This limitation does not block the current capacity-only feature contract; temperature is not among the thirteen features.

## 4. Oxford Battery Degradation Dataset 1

The supplied [README](../data/oxford/Readme.txt) identifies eight Kokam SLPB533459H4, nominal 740-mAh lithium-ion pouch cells, chamber temperature 40 C, Urban Artemis drive-cycle aging, and approximately every-100-cycle characterizations. It does not explicitly establish a cathode subtype in the local documentation; do not label it LCO/NMC by assumption.

`Oxford_Battery_Degradation_Dataset_1.mat` has `Cell1`..`Cell8`, then keys such as `cyc0000`, `cyc0100`, etc., then `C1ch`, `C1dc`, `OCVch`, `OCVdc`, each with `t,v,q,T`. Characterization `q` is signed cumulative charge in **mAh**, not a per-row complete capacity or Ah. C1 discharge capacities were measured as `-(q_end-q_start)/1000`; the inspected traces have monotonic decreasing `q`, endpoints near 4.19→2.70 V, and initial capacities about 0.728–0.739 Ah. Do not mix 1-C and pseudo-OCV measurements at 40 mA into one capacity target.

An important local-file discrepancy: the README describes `t` as seconds, but inspected values near 735,954 and increments near `1/86400` match **MATLAB serial days**, with approximately one-second sampling after multiplying differences by 86,400. The resulting duration and charge rate agree with the documented 740-mA C1 test. An adapter must explicitly verify/record this time representation; blindly integrating on the README's seconds interpretation would be wrong by 86,400. This is a file-derived interpretation, not an undocumented production conversion.

All eight cells and all 519 C1 discharge traces were inspected for finite equal-length arrays, monotonic time/charge and capacity endpoints. No such numerical failure was found. All characterization records have all four branch names. There are additional missing 100-cycle checkpoints, including shared 1,400→1,600 and 1,600→1,800 gaps; Cell8 also lacks the 200-cycle checkpoint. “Every 100 cycles” is not a complete uninterrupted grid in these files.

| Cell | Checkpoints | Last drive-cycle key | First observed 80% crossing | Previous above-threshold checkpoint |
|---|---:|---:|---:|---:|
| Cell1 | 78 | 8,200 | 5,800 | 5,700 |
| Cell2 | 73 | 7,700 | 5,000 | 4,800 |
| Cell3 | 76 | 8,100 | 6,300 | 6,200 |
| Cell4 | 47 | 5,100 | 4,800 | 4,600 |
| Cell5 | 46 | 5,000 | 5,000 | 4,800 |
| Cell6 | 46 | 5,000 | 4,600 | 4,500 |
| Cell7 | 77 | 8,100 | 8,000 | 7,900 |
| Cell8 | 76 | 8,100 | 6,400 | 6,300 |

These are **first observed checkpoint crossings**, not right-censored outcomes. The unobserved physical crossing lies between checks under a monotonic-degradation interpretation; recovery cannot be excluded between observations. A separately specified sparse-observation task could label time to detection in actual drive-cycle units. It cannot claim an exactly observed intervening physical EOL. `cyc0000` is a baseline characterization, not zero completed discharges in the current API. Renumbering these 519 checks as consecutive single aging cycles changes every lag/rate feature and the RUL unit; interpolation would fabricate unmeasured cycles. Current-contract training/inference should reject this mapping.

`ExampleDC_C1.mat` contains `ExampleDC_C1.ch` and `.dc`, with `t,v,q,T,i`; current values confirm the README's mA scale (charge approximately 1,483 mA). Unlike the main characterization file, this example's `t` is integer seconds with roughly one-second increments; its charge segment also has a repeated final timestamp. Do not apply one blanket time conversion to both MATs. It is one first-cycle load-profile example, **not another lifetime trajectory, another cell or dense capacity history**. Do not use it to fill the missing drive cycles.

## Combining, independence and evaluation design

1. **Separate ingestion adapters and dataset identities.** Proposed offline metadata should preserve source dataset/release hash, globally scoped physical cell ID, original file/member and source operation/cycle key, protocol/current/cutoff/temperature, capacity Ah, full-test validity, reference provenance and gap/censor status. This is an offline dataset proposal, not a database/API migration. Only proven dense compatible histories should map to existing `battery_id,test_id,type,Capacity,cycle` training fields.
2. **Keep current NASA partitions fixed.** Do not move B0018/B0031/B0032 into fitting or validation, and do not call their re-evaluation fresh. Deduplicate B0025–B0028 archive copies, all R/MAT representations and any extracted/exported derivatives before any split. Use batch+cell identifiers for XJTU and cell IDs for Oxford; never split windows, pulses, checkpoints or rows from one cell across partitions.
3. **Preferred near-term evaluation:** leave all XJTU Batch-1/2 cells out of model development and reserve them as one external protocol dataset for a frozen NASA-developed candidate, after reference/chronology/licensing checks and a hash-bound adapter review. This retains all four potential independent RUL-event cells rather than cherry-picking the easiest three. Report all thirteen cells for capacity/SOH and only legitimately observed pre-EOL rows from event cells for RUL; report the nine censored separately. If quality exclusions leave fewer than three event cells, the current RUL gate still fails.
4. **Alternative XJTU-first training:** obtain the missing full-release dense cells or another documented dense full-discharge cohort. Freeze battery-level train/validation/test assignments with seed 42 before fitting, approximately 60/20/20 when feasible, with enough *independent event cells* in each task partition. At least five usable event cells are needed just to populate RUL train, validation and a three-event final test; more are strongly preferable. The supplied fixed-protocol subset has only four, so a routine split cannot fix this. Do not transfer old test batteries into fitting or use Batch-4/6 partial rows to manufacture events.
5. **Pooling is a later experiment, not the default.** NASA train/validation and a designated XJTU development subset could eventually be pooled only with consistent capacity/reference/cycle meanings and explicit domain metadata; preserve old test roles and an untouched new external set. Current feature definitions exclude protocol/temperature and have raw-Ah scale terms, so merely standardizing or concatenating records does not remove domain shift. Do not alter the thirteen-feature contract or normalize capacity to a different target unnoticed.
6. **Reserve RW and Oxford as separate later challenges.** RW tests random-load/reference-test behavior, 1-A versus 2-A measurement and temperature differences. Oxford tests smaller pouch cells, 40-C drive-cycle aging and sparse characterization. Neither can certify the unchanged model's dense-history/RUL-cycle semantics as supplied. A checkpoint/EFC/time model would require an explicit new scientific feature/unit contract and separate validation/approval, which was not implemented here.
7. **Causal preparation and honest metrics.** Fit preprocessing only on training batteries; choose candidates on validation batteries; score a frozen external/final set once. Build each feature prefix strictly before its target, and exclude unresolved-gap windows. Do not spline-fill capacity, use whole-life maxima, feed `cycle_life`, time-to-EOL, current target capacity/SOH, or apply future ambient corrections. Compare same-row persistence in Ah and an appropriate RUL baseline; report MAE/RMSE, R² and Pearson correlation where meaningful, per-cell counts, and battery-macro as well as pooled results. Keep terminal zeros separate from forecast accuracy. Do not relabel censored histories as zero or estimate their ground truth from a regression line.

**Independence qualification:** this task inspected labels for data-quality/suitability, but did not fit, select or score any model on the new cells. They are quality-inspected prospective cohorts, not wholly unseen raw files. No new split or reserved-ID manifest was created. Confirm prior project usage, acquisition provenance and physical identities before describing any set as untouched by model development. Nothing in this report retroactively makes the current failed V3 evaluation pass.

## Provenance, licensing and inspection limits

- The Oxford README explicitly declares the Open Database License 1.0 and Database Contents License 1.0, with copyright and requested dataset/thesis citation. Preserve its notices; this report does not interpret redistribution obligations or establish additional permissions.
- NASA archive READMEs identify NASA contacts and request the Bole/Kulkarni/Daigle 2014 citation for RW. The inspected NASA aging/RW archive materials do not supply an explicit license grant comparable to Oxford's README. Do not infer “public domain” or permission solely from the NASA name.
- XJTU's supplied PDF/scripts identify the experiment and author/affiliation, but no explicit dataset license file/grant was found locally. Verify acquisition/release and permissions before redistribution. The described 55-cell release is incomplete here; missing histories were not fabricated or downloaded.
- All supplied MATLAB files were readable using existing SciPy; archive MATLAB members were read in memory without extracting over source data. The redundant `.Rda` files were inventoried but not independently decoded, since their README says they duplicate MATLAB data. Thus binary equivalence of the R representation was not independently certified.
- XJTU ambient temperature vectors were readable, but their opaque MATLAB datetime/function-workspace representation was not decoded/aligned. Oxford's time-unit discrepancy and chemistry subtype, NASA reference completeness/chronology anomalies, XJTU stitched chronology/protocol notation and all source authenticity/usage permissions remain explicit limitations.
- Numerical screens are not a full certification of every charge/impedance/OCV/temperature trace or experiment pause. Old NASA decisions are reused only after exact raw-member hash matches. New RW/XJTU/Oxford observations are not an approved training release or substitute for protocol-aware quality manifests.

## Specific next steps

1. Confirm source releases/licenses and retain the present raw-file hashes; keep the existing NASA split and all candidate artifacts untouched. Correct the `hstu` identity in planning records without moving/renaming source files automatically.
2. Prioritize a **read-only-to-versioned offline XJTU Batch-1/2 adapter** review: preserve original cycle indices/reference, split within-cycle segments, validate full 2.5-V discharges and current integration, reconstruct stitched timestamps, and produce quality/censor manifests. Do not train until these checks and prospective cohort use are agreed.
3. Prefer reserving all thirteen fixed-protocol XJTU cells for the first new external validation of a frozen candidate. If choosing XJTU as primary training data instead, first obtain enough additional dense event-bearing cells to support separate train/validation and at least three independent test events. Freeze IDs before fitting; do not select cells based on candidate error.
4. Establish separate sparse-reference specifications for RW/Oxford if those tasks are desired: define actual cycle count, observation interval, EOL detection label and causal missing-history treatment. Do not weaken current validators or silently change units to accommodate them.
5. After an authorized future training/evaluation step, retain versioned artifacts and negative results, compare against persistence using the correct cohort, and rerun all existing scientific/compatibility gates. **Keep inference disabled until every existing gate and explicit approval requirement is satisfied.**

### Verification of this report

The inspection used existing Python/NumPy/SciPy and PDF tools, including text extraction and visual review of all three XJTU protocol pages. All **59 files under `data/` matched their pre-inspection SHA-256 values afterward**. Counts were cross-checked against completed numerical summaries; Markdown table column counts and trailing whitespace were checked. Scratch inventory, source hashes, read-only scripts, per-cell numerical summaries and PDF renders are under ignored `.cache/dataset-suitability/` and `.cache/inspect_dataset_*.py`. The report is the only intended reviewable change from this task. Application tests/builds were not rerun for this documentation-only analysis; no test or accuracy result is invented.
