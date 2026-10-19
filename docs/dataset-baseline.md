# Supplied dataset baseline — 2026-10-16

This captures the earlier read-only baseline. The subsequent complete-workflow request explicitly authorized conversion and fitting; see [executed quality report](battery-quality-report.md) and [evaluation](nasa-evaluation-report.md) for current decisions. The historical findings below remain provenance context.

The dataset appeared as external untracked work during implementation and was preserved. No MAT file, protocol CSV, or original dataset documentation was edited. No model was fitted.

## Paths and provenance

- Raw directory: R:/PP/VoltSense/Battery_DataSet/Battery_DataSet
- Battery-level protocol tables: metadata.csv at the repository root and inside the raw directory. These are not cycle-level training tables.
- Local provenance: source.md cites B. Saha and K. Goebel (2007), Battery Data Set, NASA PCoE/Ames, and a PHM S3 mirror. Authenticity against a remote archive was not independently verified.
- Read-only structural fingerprint (sorted filename:SHA256 lines, then SHA256): 02ddf0beffdecd2c3b8eac040d271ea30783d8e77b6f2665450b60c06dac6827.

The 34 IDs are B0005, B0006, B0007, B0018, B0025, B0026, B0027, B0028, B0029, B0030, B0031, B0032, B0033, B0034, B0036, B0038, B0039, B0040, B0041, B0042, B0043, B0044, B0045, B0046, B0047, B0048, B0049, B0050, B0051, B0052, B0053, B0054, B0055 and B0056. Legacy model metadata claimed 33 batteries; the exact old selection is not established by that claim.

## Observed structure and units

Each Bxxxx.mat has a matching top-level Bxxxx structure and cycle operations. type distinguishes charge/discharge/impedance; ambient_temperature is experimental ambient C; time is a MATLAB start-date vector. Array position identifies an operation, not a completed discharge cycle.

Discharge data contains scalar Capacity (Ah), Voltage_measured (V), Current_measured (A), Temperature_measured (C), and per-operation Time (seconds), with Current_load/Voltage_load present in inspected data. Charge operations expose charger fields. Impedance operations expose Re/Rct and complex spectra (Ohm); they must not be flattened or joined to later cycles without an explicit causal rule. Group README field descriptions sometimes use Current_charge/Voltage_charge where actual discharge structures use Current_load/Voltage_load.

Temperature, load profile, cutoff voltage and experimental stop conditions differ across groups. Some README stop criteria use 1.4 Ah from a rated 2 Ah (70%), others use 1.6 Ah (80%), and B0049–B0052 ended on control-software failure. Those original stop criteria do not change the approved application target: first 80% crossing relative to the first valid completed discharge. A stopped experiment without that crossing is censored.

## Read-only quality findings

Inspection found 44 invalid capacity entries (missing/non-scalar/nonpositive/nonfinite) across B0042, B0043, B0044, B0045, B0046, B0047, B0048, B0049, B0050, B0051, B0052, B0053 and B0054. Their discharge ordinals are retained in inspection output; they are not dropped or compressed. No reversed operation start times were found.

First positive capacity alone is not proof of a complete reference discharge. B0033 starts near 0.06843 Ah and later reaches about 1.88514 Ah; B0039 starts near 0.11904 Ah and later reaches about 1.77157 Ah. Other groups also show initial recovery, early threshold excursions or incomplete measurements. Automatically applying the first-positive rule to every battery could create misleading capped SOH and RUL labels.

The developer chose read-only MATLAB inspection for now. Native MAT training, battery exclusions, completion criteria and any reference changes remain subject to explicit review. Public uploads still reject .mat; this offline inspector does not add an upload adapter.

## Reproduce without training

From ml-service:

~~~powershell
python -B inspect_raw.py ../Battery_DataSet/Battery_DataSet
~~~

It prints individual hashes, operation counts, available fields, invalid discharge ordinals and candidate crossings where the full capacity series is present. A candidate crossing assumes an unverified completed first discharge; it is not an approved training label. The command never writes a processed dataset, split, model, or report.

Training remains available for validated cycle metadata CSV/ZIP using the explicit workflow in README.md under ml-service. Passing the root battery-protocol metadata.csv to that loader fails required-column validation, as intended. Do not rename that table or pretend it contains discharge histories.
