"""Protocol-separated, offline experiments. Never selects, approves or deploys models.

Run from ml-service: python -B dense_experiment.py --output runs/<new-name>
"""
import argparse
from collections import Counter
import csv
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import platform
import shutil
import subprocess

import joblib
import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from dataset import load_dataset, feature_records, validate_split, histories_for_rows
from features import FEATURES, FEATURE_CONTRACT, build_row, first_eol, soh
from model_loader import load_approved, ModelUnavailable
from rul_policy import RUL_POLICY, predict_rul
from training import candidates, dump_new, subset, target_report, serving_rul_report

ROOT = Path(__file__).resolve().parent.parent
NASA = ROOT / 'data/validated/nasa-20261016'
MASTER = ROOT / 'data/processed/voltsense_unified_battery_dataset.csv'
MASTER_MANIFEST = MASTER.with_name('voltsense_unified_dataset_manifest.json')
RESERVED = sorted(['xjtu/Batch-1/2C_battery-' + str(i) for i in [2, 3, 4, 6, 7]]
                  + ['xjtu/Batch-2/3C_battery-' + str(i) for i in [1, 2, 3, 4, 6, 8, 10, 11]])


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def check_labels(rows, expected, partitions):
    """Recompute labels; never trust a master eligibility flag alone."""
    by_key = {}
    roles = {b: role for role, ids in partitions.items() for b in ids}
    for row in rows:
        battery = row['native_battery_id']
        cycle = int(row['source_cycle_index'])
        key = (battery, cycle)
        if key in by_key:
            raise ValueError('Duplicate selected discharge')
        if (row['battery_uid'] != 'nasa_aging_arc/' + battery
                or row['dataset_id'] != 'nasa_aging_arc'
                or row['measurement_stream'] != 'audited_discharge'
                or row['dense_history_valid'] != 'true'
                or row['source_cycle_unit'] != 'completed_discharge_cycles'
                or row['quality_flags']
                or row['reference_status'] != 'existing_nasa_quality_manifest'
                or row['existing_partition'] != roles.get(battery)):
            raise ValueError('Unsupported source, quality or partition')
        by_key[key] = row
    expected_keys = {(r.battery_id, int(r.cycle)) for r in expected.itertuples()}
    if set(by_key) != expected_keys:
        raise ValueError('Selected history differs from the accepted NASA prefix')
    results = []
    for battery, group in expected.groupby('battery_id'):
        group = group.sort_values('cycle')
        caps = group.Capacity.tolist()
        eol = first_eol(caps)
        for item in group.itertuples():
            cycle = int(item.cycle)
            row = by_key[battery, cycle]
            numeric = [('discharge_capacity_Ah', item.Capacity),
                       ('reference_capacity_Ah', caps[0]),
                       ('soh_percent', soh(item.Capacity, caps[0])),
                       ('eol_threshold_percent', 80.0)]
            for name, value in numeric:
                if not math.isfinite(float(row[name])) or float(row[name]) != value:
                    raise ValueError('Label or capacity mismatch: ' + name)
            if (int(row['source_record_index']) != item.test_id
                    or row['source_member_sha256'] != item.source_sha256
                    or row['protocol'] != item.protocol_group
                    or float(row['discharge_cutoff_V']) != item.discharge_cutoff_V
                    or (row['current_contract_eligible'] == 'true') != (cycle >= 7)):
                raise ValueError('Source identity, protocol or eligibility mismatch')
            if eol is None:
                if row['rul_cycles'] or row['first_observed_eol_source_cycle'] or row['is_censored'] != 'true':
                    raise ValueError('Censored RUL was fabricated')
            elif (float(row['rul_cycles']) != max(0, eol - cycle)
                  or int(row['first_observed_eol_source_cycle']) != eol
                  or row['is_censored'] != 'false'):
                raise ValueError('Observed RUL label mismatch')
        # A changed current target and a changed future must leave target-t features unchanged.
        for t in range(7, len(caps) + 1):
            changed = caps[:t - 1] + [caps[t - 1] * 1.1]
            if build_row(caps[:t]) != build_row(changed):
                raise ValueError('Current target leaked into features')
        results.append({'battery_id': battery, 'partition': roles[battery],
                        'cycles': len(caps), 'reference_Ah': caps[0], 'first_eol_cycle': eol,
                        'censored': eol is None, 'feature_rows': max(0, len(caps) - 6)})
    return results


def protocol_strata(frame, partitions):
    """No temperature/rate/cutoff pooling; group IDs retain documented load protocols."""
    groups = []
    for key, rows in frame.groupby(['protocol_group', 'ambient_temperature_C', 'discharge_cutoff_V']):
        ids = sorted(rows.battery_id.unique().tolist())
        groups.append({'protocol_group': key[0], 'ambient_temperature_C': float(key[1]),
                       'discharge_cutoff_V': float(key[2]), 'battery_ids': ids,
                       'partitions': {role: sorted(set(ids) & set(values)) for role, values in partitions.items()},
                       'cycles': len(rows)})
    return groups


def protected_hashes():
    paths = [p for base in ['backend/src', 'frontend/src', 'ml-service/models',
                           'ml-service/runs', 'data/validated'] for p in (ROOT / base).rglob('*') if p.is_file()]
    paths += [ROOT / 'ml-service' / name for name in
              ['features.py', 'dataset.py', 'training.py', 'review_candidate.py', 'model_loader.py', 'rul_policy.py', 'app.py']]
    paths += [MASTER, MASTER_MANIFEST]
    return {str(p.relative_to(ROOT)).replace('\\', '/'): sha(p) for p in paths}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    args = parser.parse_args(argv)
    output = Path(args.output).resolve()
    runs = (ROOT / 'ml-service/runs').resolve()
    if output.parent != runs or output.exists():
        raise ValueError('Choose a new direct child of ml-service/runs; existing outputs are immutable')
    before = protected_hashes()
    master_manifest = json.loads(MASTER_MANIFEST.read_text(encoding='utf-8'))
    if sha(MASTER) != master_manifest['files']['csv']['sha256']:
        raise ValueError('Master CSV hash mismatch')
    if sha(ROOT / 'ml-service/features.py') != master_manifest['feature_source_sha256']:
        raise ValueError('Master feature contract changed')
    source_checks = {entry['path']: sha(ROOT / entry['path']) == entry['sha256']
                     for entry in master_manifest['source_files']}
    if not all(source_checks.values()):
        raise ValueError('Source hash mismatch')
    frame, provenance = load_dataset(NASA / 'validated_cycles.csv')
    split = json.loads((NASA / 'split-manifest.json').read_text(encoding='utf-8'))
    partitions = validate_split(frame, split, provenance['source_sha256'])
    selected, counts, excluded, reserved = [], Counter(), Counter(), set()
    with MASTER.open(newline='', encoding='utf-8') as stream:
        for row in csv.DictReader(stream):
            counts[row['dataset_id']] += 1
            if row['dataset_id'] == 'xjtu' and row['dense_history_valid'] == 'true':
                reserved.add(row['battery_uid'])
            if row['dataset_id'] == 'nasa_aging_arc' and row['dense_history_valid'] == 'true':
                selected.append(row)
            else:
                excluded[row['dataset_id']] += 1
    if sorted(reserved) != RESERVED:
        raise ValueError('Reserved external cell inventory changed; review without fitting')
    labels = check_labels(selected, frame, partitions)
    strata = protocol_strata(frame, partitions)
    experiments = [s for s in strata if s['partitions']['train'] and s['partitions']['test']]
    if len(experiments) != 1 or experiments[0]['battery_ids'] != ['B0006', 'B0018']:
        raise ValueError('Protocol-compatible experiment membership changed; review first')
    stratum = experiments[0]
    records = feature_records(frame[frame.battery_id.isin(stratum['battery_ids'])])
    estimators = candidates()
    config = {'created_utc': datetime.now(timezone.utc).isoformat(), 'seed': 42,
              'git_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'purpose': 'Exploratory protocol-matched replication; no validation-based model selection possible',
              'previously_inspected_test': True, 'selection': None, 'approved': False,
              'inference_enabled': False, 'stratum': stratum,
              'candidates': {name: model.get_params() for name, model in estimators.items()},
              'baselines': {'capacity': 'cap_lag1 persistence; SOH capped against first reference',
                            'rul': 'mean strictly pre-EOL training RUL'},
              'versions': {name: importlib.metadata.version(name) for name in
                           ['numpy', 'pandas', 'scipy', 'scikit-learn', 'joblib', 'fastapi', 'pytest', 'httpx']},
              'python': platform.python_version(), 'platform': platform.platform()}
    output.mkdir(exist_ok=False)
    # Freeze inputs, plans and code BEFORE fitting or scoring. Never repartition.
    for name in ['validated_cycles.csv', 'battery-quality-manifest.json', 'split-manifest.json']:
        shutil.copyfile(NASA / name, output / name)
    code = output / 'source'
    code.mkdir()
    for name in ['dense_experiment.py', 'training.py', 'dataset.py', 'features.py', 'rul_policy.py',
                 'model_loader.py', 'app.py', 'review_candidate.py']:
        shutil.copyfile(ROOT / 'ml-service' / name, code / name)
    dump_new(output / 'config.json', config)
    dump_new(output / 'external-reservation.json', {'battery_uids': RESERVED, 'fit_rows': 0, 'scored_rows': 0,
             'note': 'Previously quality-inspected, never used by this experiment for fitting, selection or scoring'})
    dump_new(output / 'label-audit.json', {'source_hash_checks': source_checks, 'input_counts': dict(counts),
             'excluded_from_nasa_dense_pool': dict(excluded), 'batteries': labels, 'protocol_strata': strata,
             'dense_nasa_cycles': len(frame), 'feature_rows': sum(r['feature_rows'] for r in labels),
             'checks': {'exact_accepted_prefix': True, 'labels_recomputed': True,
                        'no_current_target_features': True, 'no_gaps': True, 'frozen_split': True},
             'limitations': ['NASA source Capacity till 2.7 V versus group cutoff ambiguity remains',
                            'Different protocols are not pooled, even when each is dense',
                            'No XJTU external predictions; no fresh final test cohort']})
    results = {}
    train_ids, test_ids = stratum['partitions']['train'], stratum['partitions']['test']
    for name in estimators:
        directory = output / name
        directory.mkdir()
        bundle, evaluation, baselines, scaler_checks = {}, {}, {}, {}
        for target in ['capacity', 'rul']:
            train, test = subset(records, train_ids, target), subset(records, test_ids, target)
            # Fresh estimator per target; validation/test never reach fit().
            pipeline = Pipeline([('scale', StandardScaler()), ('regressor', candidates()[name])])
            pipeline.fit(train[FEATURES], train['target_' + target])
            bundle[target] = pipeline
            evaluation.update(target_report(test, target, pipeline.predict(test[FEATURES])))
            baseline = test.cap_lag1.to_numpy() if target == 'capacity' else np.full(len(test), train.target_rul.mean())
            baselines.update(target_report(test, target, baseline))
            scaler_checks[target] = bool(np.allclose(pipeline.named_steps['scale'].mean_, train[FEATURES].mean(), rtol=1e-12, atol=1e-12))
        baseline_mean = subset(records, train_ids, 'rul').target_rul.mean()
        evaluation['baselines'] = baselines
        evaluation['rul_serving'] = serving_rul_report(frame, records, test_ids, bundle['rul'], baseline_mean)
        evaluation.update(partition='previously_inspected_test', battery_disjoint=True)
        joblib.dump(bundle, directory / 'bundle.joblib')
        manifest = {'approved': False, 'inference_enabled': False, 'bundle_file': 'bundle.joblib',
                    'sha256': sha(directory / 'bundle.joblib'), 'feature_contract': FEATURE_CONTRACT,
                    'inference_policy': RUL_POLICY,
                    'targets': {'capacity': 'Ah', 'rul': 'discharge_cycles_to_first_80_percent_crossing'},
                    'model': {'name': 'VoltSense protocol-matched exploratory ' + name,
                              'version': output.name, 'algorithm': name},
                    'split_manifest': split, 'experiment_partitions': stratum['partitions'],
                    'provenance': provenance, 'versions': config['versions'], 'seed': 42,
                    'previously_inspected_test': True, 'validation': None, 'selection': None,
                    'model_configurations': {t: p.named_steps['regressor'].get_params() for t, p in bundle.items()},
                    'evaluation': evaluation, 'training_counts': {t: {'records': len(subset(records, train_ids, t)),
                        'batteries': int(subset(records, train_ids, t).battery_id.nunique())} for t in bundle},
                    'deployment_blockers': ['No protocol-matched validation battery',
                        'Previously inspected test is not a fresh final test',
                        'Only one observed-EOL test battery; existing gate requires at least three']}
        if evaluation['capacity']['rmse'] > baselines['capacity']['rmse']:
            manifest['deployment_blockers'].append('Capacity RMSE exceeds same-row persistence baseline')
        dump_new(directory / 'manifest.json', manifest)
        loaded = joblib.load(directory / 'bundle.joblib')
        parity = all(list(p.feature_names_in_) == FEATURES and np.array_equal(
            p.predict(subset(records, test_ids, t)[FEATURES]),
            bundle[t].predict(subset(records, test_ids, t)[FEATURES])) for t, p in loaded.items())
        previous = os.environ.get('ML_MODEL_MANIFEST')
        try:
            os.environ['ML_MODEL_MANIFEST'] = str(directory / 'manifest.json')
            try:
                load_approved()
                raise AssertionError('Unapproved candidate loaded')
            except ModelUnavailable as exc:
                if str(exc) != 'Model is not approved':
                    raise
        finally:
            if previous is None:
                os.environ.pop('ML_MODEL_MANIFEST', None)
            else:
                os.environ['ML_MODEL_MANIFEST'] = previous
        terminal = records[records.observed_eol & records.battery_id.isin(test_ids)]
        zeros = predict_rul(loaded['rul'], terminal[FEATURES], histories_for_rows(frame, terminal))
        checks = {'serialization_prediction_parity': parity, 'train_only_scaler': scaler_checks,
                  'strict_loader_rejects_unapproved': True, 'terminal_rows': len(zeros),
                  'positive_terminal_rul': int(np.sum(zeros > 0)), 'feature_order': FEATURES,
                  'capacity_rmse_gate_pass': evaluation['capacity']['rmse'] <= baselines['capacity']['rmse']}
        if not parity or not all(scaler_checks.values()) or np.any(zeros != 0):
            raise ValueError('Candidate compatibility failed')
        dump_new(directory / 'compatibility.json', checks)
        results[name] = {'evaluation': evaluation, 'checks': checks, 'blockers': manifest['deployment_blockers']}
    unchanged = {path: sha(ROOT / path) == digest for path, digest in before.items()}
    if not all(unchanged.values()):
        raise ValueError('Protected input or artifact changed')
    dump_new(output / 'preservation.json', {'original_sha256': before, 'all_unchanged': True})
    dump_new(output / 'results.json', results)
    dump_new(output / 'artifact-index.json', {str(p.relative_to(output)).replace('\\', '/'): sha(p)
             for p in output.rglob('*') if p.is_file()})
    print(json.dumps({'output': str(output), 'candidates': list(results), 'approved': False,
                      'inference_enabled': False, 'validation_batteries': 0}))


if __name__ == '__main__':
    main()
