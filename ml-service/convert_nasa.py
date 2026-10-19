"""Conservative local NASA MATLAB adapter. Never repairs or overwrites source data."""
import argparse
from datetime import datetime, timedelta
import hashlib
import json
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.io import loadmat
from features import MIN_CYCLES, first_eol

POLICY = {
    'version': 'nasa-completed-discharge-v1',
    'minimum_samples': 20, 'minimum_start_voltage_V': 4.0,
    'maximum_start_voltage_V': 4.3, 'cutoff_tolerance_V': 0.15,
    'capacity_integral_relative_tolerance': 0.05,
    'capacity_integral_absolute_tolerance_Ah': 0.03,
    'reference_capacity_minimum_Ah': 1.4, 'reference_capacity_maximum_Ah': 2.4,
    'reference_rationale': 'Conservative applicability envelope for documented nominal 2 Ah cells; first discharge below 70% nominal cannot establish a credible fresh reference. This is NOT the 80% relative EOL target.',
    'gap_policy': 'Retain only the uninterrupted prefix beginning at original discharge 1. Never select a later reference or bridge a rejected discharge.',
    'eol_threshold_percent': 80.0,
    'capacity_semantics': 'Preserve supplied Capacity in Ah; integration is an independent consistency screen, never a replacement. README describes Capacity till 2.7 V while group cutoffs vary; reject disagreement rather than reinterpret.'
}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def scalar(value):
    array = np.asarray(value, dtype=float).reshape(-1)
    return float(array[0]) if len(array) == 1 and np.isfinite(array[0]) else None


def timestamp(value):
    values = np.asarray(value, dtype=float).reshape(-1)
    if len(values) != 6 or not np.isfinite(values).all():
        raise ValueError('Invalid MATLAB start-time vector')
    year, month, day, hour, minute = [int(v) for v in values[:5]]
    if any(values[i] != int(values[i]) for i in range(5)):
        raise ValueError('Noninteger date component')
    return (datetime(year, month, day, hour, minute) + timedelta(seconds=float(values[5]))).isoformat(timespec='microseconds')


def assess(data, cutoff):
    reasons = []
    q = scalar(data.get('Capacity', []))
    if q is None or q <= 0:
        reasons.append('invalid_capacity')
    arrays = [np.asarray(data.get(key, []), dtype=float).reshape(-1)
              for key in ['Time', 'Voltage_measured', 'Current_measured', 'Temperature_measured']]
    t, v, current, temperature = arrays
    result = {'capacity_Ah': q, 'samples': len(t)}
    if len(t) < POLICY['minimum_samples'] or any(len(a) != len(t) or not np.isfinite(a).all() for a in arrays):
        return result, reasons + ['invalid_or_incomplete_sample_arrays']
    if not (np.diff(t) > 0).all() or t[0] < 0:
        return result, reasons + ['nonmonotonic_sample_time']
    active = current < -0.1
    integral = float(np.trapezoid(np.maximum(-current, 0), t) / 3600)
    result.update(start_voltage_V=float(v[0]), duration_s=float(t[-1] - t[0]),
                  integrated_discharge_Ah=integral, mean_voltage_V=float(np.mean(v)),
                  mean_current_A=float(np.mean(current)), mean_temperature_C=float(np.mean(temperature)),
                  last_active_voltage_V=float(v[active][-1]) if active.any() else None)
    if not POLICY['minimum_start_voltage_V'] <= v[0] <= POLICY['maximum_start_voltage_V']:
        reasons.append('start_voltage_not_consistent_with_full_charge')
    if not active.any() or result['last_active_voltage_V'] > cutoff + POLICY['cutoff_tolerance_V']:
        reasons.append('documented_discharge_cutoff_not_observed')
    if q is not None and abs(q - integral) > max(POLICY['capacity_integral_absolute_tolerance_Ah'], POLICY['capacity_integral_relative_tolerance'] * q):
        reasons.append('capacity_integral_disagreement')
    if (v <= 0).any() or (v > 5).any() or (abs(current) > 10).any() or (temperature < -30).any() or (temperature > 100).any():
        reasons.append('unsupported_measurement_range')
    return result, reasons


def convert(source, output):
    source, output = Path(source).resolve(), Path(output).resolve()
    if output.exists():
        raise FileExistsError('Output exists; choose a new versioned directory')
    if source == output or source in output.parents:
        raise ValueError('Conversion output must be outside the raw corpus')
    protocols = pd.read_csv(source / 'metadata.csv').set_index('battery_id')
    if not protocols.index.is_unique:
        raise ValueError('Conflicting protocol metadata')
    files = sorted(source.glob('B*.mat'))
    if not files:
        raise ValueError('No MATLAB battery files')
    batteries, rows = [], []
    for path in files:
        battery = path.stem
        if battery not in protocols.index:
            raise ValueError('Unsupported battery protocol: ' + battery)
        protocol = protocols.loc[battery]
        cutoff = float(protocol['discharge_cutoff_V'])
        operations = np.atleast_1d(loadmat(path, simplify_cells=True)[battery]['cycle'])
        digest = sha(path)
        audit, candidate_rows = [], []
        discharge, previous, prefix_open, prefix_length = 0, None, True, 0
        reference_reasons = []
        chronology_reasons = []
        for operation_id, operation in enumerate(operations, start=1):
            try:
                started = timestamp(operation['time'])
                chronology_ok = previous is None or started > previous
                previous = started
            except (ValueError, KeyError, TypeError):
                started, chronology_ok = None, False
            if not chronology_ok:
                chronology_reasons.append('invalid_or_nonincreasing_operation_timestamp:' + str(operation_id))
            if operation['type'] != 'discharge':
                continue
            discharge += 1
            measurements, reasons = assess(operation['data'], cutoff)
            if not chronology_ok:
                reasons.append('invalid_operation_chronology')
            if discharge == 1:
                q = measurements['capacity_Ah']
                reference_reasons = list(reasons)
                if q is None or not POLICY['reference_capacity_minimum_Ah'] <= q <= POLICY['reference_capacity_maximum_Ah']:
                    reference_reasons.append('questionable_initial_reference_capacity')
                if reference_reasons:
                    prefix_open = False
            accepted = prefix_open and not reasons
            if accepted:
                prefix_length += 1
                candidate_rows.append({
                    'battery_id': battery, 'test_id': operation_id, 'type': 'discharge',
                    'cycle': discharge, 'Capacity': measurements['capacity_Ah'],
                    'start_time': started, 'source_record_id': battery + ':operation:' + str(operation_id),
                    'source_file': path.name, 'source_sha256': digest,
                    'ambient_temperature_C': scalar(operation.get('ambient_temperature', [])),
                    'mean_voltage': measurements['mean_voltage_V'], 'mean_current': measurements['mean_current_A'],
                    'mean_temperature': measurements['mean_temperature_C'], 'discharge_duration': measurements['duration_s'],
                    'protocol_group': protocol['group'], 'discharge_cutoff_V': cutoff})
            else:
                prefix_open = False
            audit.append({'discharge_ordinal': discharge, 'source_operation_id': operation_id,
                          'start_time': started, **measurements, 'validation_failures': reasons,
                          'retained_in_prefix': accepted})
        exclusions = list(reference_reasons)
        if chronology_reasons:
            exclusions.append('unresolved_operation_chronology')
        if prefix_length < MIN_CYCLES:
            exclusions.append('fewer_than_seven_uninterrupted_valid_discharges')
        eligible = not exclusions
        if eligible:
            rows.extend(candidate_rows)
        for record in audit:
            record['exported_for_training'] = eligible and record['retained_in_prefix']
        capacities = [r['Capacity'] for r in candidate_rows] if eligible else []
        batteries.append({'battery_id': battery, 'source_file': path.name, 'source_sha256': digest,
                          'operations': len(operations), 'discharges': discharge, 'protocol_group': protocol['group'],
                          'cutoff_V': cutoff, 'eligible': eligible, 'exclusion_reasons': exclusions,
                          'chronology_failures': chronology_reasons, 'valid_prefix_cycles': prefix_length,
                          'exported_cycles': len(capacities), 'reference_capacity_Ah': capacities[0] if capacities else None,
                          'first_observed_80_percent_cycle': first_eol(capacities) if capacities else None,
                          'records': audit})
    frame = pd.DataFrame(rows)
    if frame.empty:
        raise ValueError('No eligible batteries; inspect quality policy and source evidence')
    output.mkdir(parents=True, exist_ok=False)
    csv = output / 'validated_cycles.csv'
    frame.to_csv(csv, index=False, float_format='%.17g')
    sources = {p.name: sha(p) for p in sorted(source.iterdir()) if p.is_file()}
    manifest = {'version': 1, 'policy': POLICY, 'source_directory': str(source), 'source_hashes': sources,
                'provenance': 'Supplied local NASA PCoE corpus and bundled protocol READMEs; remote authenticity not independently verified',
                'dataset_file': csv.name, 'dataset_sha256': sha(csv), 'batteries': batteries}
    summary = {'dataset_sha256': sha(csv), 'raw_batteries': len(batteries),
               'raw_discharges': sum(b['discharges'] for b in batteries),
               'retained_batteries': int(frame.battery_id.nunique()), 'retained_cycles': len(frame),
               'excluded_batteries': {b['battery_id']: b['exclusion_reasons'] for b in batteries if not b['eligible']},
               'censored_batteries': [b['battery_id'] for b in batteries if b['eligible'] and b['first_observed_80_percent_cycle'] is None],
               'observed_crossings': {b['battery_id']: b['first_observed_80_percent_cycle'] for b in batteries if b['eligible'] and b['first_observed_80_percent_cycle'] is not None},
               'quality_manifest_file': 'battery-quality-manifest.json',
               'rejected_or_unusable_discharge_records': sum(b['discharges'] - b['exported_cycles'] for b in batteries)}
    for name, value in [('battery-quality-manifest.json', manifest), ('conversion-summary.json', summary)]:
        (output / name).write_text(json.dumps(value, indent=2, allow_nan=False) + chr(10), encoding='utf-8')
    print(json.dumps(summary, indent=2))
    return manifest, summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    convert(args.source, args.output)


if __name__ == '__main__':
    main()
