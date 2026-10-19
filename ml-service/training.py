"""Explicit CLI only. Importing this module never trains or writes anything."""
import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import shutil
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from dataset import load_dataset, feature_records, make_split, validate_split, histories_for_rows
from features import FEATURES, FEATURE_CONTRACT, first_eol
from rul_policy import RUL_POLICY, predict_rul


def metrics(actual, predicted):
    a, p = np.asarray(actual, dtype=float), np.asarray(predicted, dtype=float)
    if not len(a) or not np.isfinite(a).all() or not np.isfinite(p).all():
        raise ValueError('Evaluation requires nonempty finite targets and predictions')
    return {'mae': float(mean_absolute_error(a, p)), 'rmse': float(np.sqrt(mean_squared_error(a, p))),
            'r2': float(r2_score(a, p)) if len(a) > 1 and np.ptp(a) > 0 else None,
            'pearson_r': float(np.corrcoef(a, p)[0, 1]) if len(a) > 1 and np.ptp(a) > 0 and np.ptp(p) > 0 else None}


def report(rows, actual, predicted):
    result = metrics(actual, predicted)
    per_battery = {}
    a, p = np.asarray(actual), np.asarray(predicted)
    ids = rows['battery_id'].to_numpy()
    for battery in sorted(set(ids)):
        mask = ids == battery
        per_battery[battery] = metrics(a[mask], p[mask])
    result['battery_mean_mae'] = float(np.mean([v['mae'] for v in per_battery.values()]))
    result['per_battery'] = per_battery
    result['records'] = len(rows)
    result['battery_count'] = len(per_battery)
    for battery in per_battery:
        per_battery[battery]['records'] = int(np.sum(ids == battery))
    return result


def dump_new(path, value):
    with Path(path).open('x', encoding='utf-8') as output:
        json.dump(value, output, indent=2, allow_nan=False)


def candidates():
    return {'RandomForest': RandomForestRegressor(n_estimators=200, max_depth=12, random_state=42, n_jobs=1),
            'GradientBoosting': GradientBoostingRegressor(n_estimators=100, max_depth=3, learning_rate=.08, random_state=42)}


def subset(records, ids, target):
    rows = records[records['battery_id'].isin(ids)]
    if target == 'rul': rows = rows[rows['target_rul'].notna() & ~rows['observed_eol']]
    if rows.empty:
        raise ValueError(f'Partition has no eligible {target} samples; do not fabricate labels or silently repartition')
    return rows


def target_report(rows, target, predicted):
    if target == 'capacity':
        sohs = np.minimum(100, 100 * np.asarray(predicted) / rows['initial_cap'].to_numpy())
        return {'capacity': report(rows, rows['target_capacity'], predicted),
                'soh': report(rows, rows['target_soh'], sohs)}
    return {'rul': report(rows, rows['target_rul'], predicted)}


def serving_rul_report(frame, records, ids, pipeline, baseline_mean):
    """Separate unknown future forecasts from deterministic observed terminal states."""
    rows = records[records['battery_id'].isin(ids) & records['target_rul'].notna()]
    predictions = predict_rul(pipeline, rows[FEATURES], histories_for_rows(frame, rows))
    baseline = np.where(rows['observed_eol'], 0, np.rint(baseline_mean))
    result, baselines = {}, {}
    for name, mask in [('pre_eol', ~rows['observed_eol']), ('observed_eol', rows['observed_eol']),
                       ('all_observed', np.ones(len(rows), dtype=bool))]:
        selected = rows[mask]
        result[name] = report(selected, selected['target_rul'], predictions[mask]) if len(selected) else None
        baselines[name] = report(selected, selected['target_rul'], baseline[mask]) if len(selected) else None
    return {'candidate': result, 'baselines': baselines,
            'safety': {'observed_terminal_rows': int(rows['observed_eol'].sum()),
                       'positive_terminal_rul': int(np.sum(predictions[rows['observed_eol']] > 0))},
            'units': 'completed_discharge_cycles', 'rounding': 'nearest_integer_ties_to_even',
            'warning': 'all_observed includes deterministic zero cases; use pre_eol for forecasting accuracy'}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['inspect', 'split', 'train', 'evaluate'])
    parser.add_argument('--dataset', required=True)
    parser.add_argument('--member', default='cleaned_dataset/metadata.csv')
    parser.add_argument('--split-manifest')
    parser.add_argument('--previously-inspected-test', action='store_true', help='Disclose reuse of previously inspected held-out batteries')
    parser.add_argument('--stratify-rul', action='store_true', help='Freeze event-availability stratified battery groups before training')
    parser.add_argument('--manifest', help='Candidate manifest for explicit final-test evaluation')
    parser.add_argument('--output', help='New split JSON path, or new run directory; never overwritten')
    args = parser.parse_args(argv)
    frame, provenance = load_dataset(args.dataset, args.member)
    records = feature_records(frame)
    if args.command == 'inspect':
        print(json.dumps({'provenance': provenance, 'samples': len(records),
                          'censored_batteries': sorted(b for b, g in frame.groupby('battery_id') if first_eol(g['Capacity'].tolist()) is None),
                          'feature_contract': FEATURE_CONTRACT}, indent=2))
        return
    if not args.output:
        parser.error('--output is required and must not already exist')
    if args.command == 'split':
        dump_new(args.output, make_split(frame, provenance['source_sha256'], stratify_rul=args.stratify_rul))
        return
    if not args.split_manifest:
        parser.error('--split-manifest is required')
    split = json.loads(Path(args.split_manifest).read_text(encoding='utf-8'))
    partitions = validate_split(frame, split, provenance['source_sha256'])
    # Refuse production artifact destinations, including their descendants.
    output = Path(args.output).resolve()
    production = (Path(__file__).parent / 'models').resolve()
    if output == production or production in output.parents:
        raise ValueError('Training/evaluation outputs cannot be written under models/')
    if output.exists():
        raise FileExistsError('Output directory exists; choose a new run directory')
    if args.command == 'train':
        selected, validation, baselines, names = {}, {}, {}, {}
        for target in ['capacity', 'rul']:
            train = subset(records, partitions['train'], target)
            val = subset(records, partitions['validation'], target)
            scored = []
            for name, estimator in candidates().items():
                pipeline = Pipeline([('scale', StandardScaler()), ('regressor', estimator)])
                pipeline.fit(train[FEATURES], train['target_' + target])
                result = target_report(val, target, pipeline.predict(val[FEATURES]))
                score = result['soh' if target == 'capacity' else 'rul']['battery_mean_mae']
                scored.append((score, name, pipeline, result))
            best = min(scored, key=lambda item: (item[0], item[1]))
            selected[target], names[target] = best[2], best[1]
            validation[target] = {name: result for _, name, _, result in scored}
            baseline = val['cap_lag1'].to_numpy() if target == 'capacity' else np.full(len(val), train['target_rul'].mean())
            baselines[target] = target_report(val, target, baseline)
        # Validation selected models are frozen; do not refit using held-out data.
        output.mkdir(parents=True, exist_ok=False)
        joblib.dump(selected, output / 'bundle.joblib')
        manifest = {'approved': False, 'feature_contract': FEATURE_CONTRACT,
                    'targets': {'capacity': 'Ah', 'rul': 'discharge_cycles_to_first_80_percent_crossing'},
                    'inference_policy': RUL_POLICY,
                    'label_policy': {'observed_crossing': 'max(0, first_observed_eol_cycle - target_cycle)',
                        'censored': 'NaN, excluded from RUL fitting and accuracy',
                        'regressor_fit': 'strictly pre-EOL only; known terminal status uses observed-history guard'},
                    'previously_inspected_test': args.previously_inspected_test,
                    'bundle_file': 'bundle.joblib', 'sha256': hashlib.sha256((output / 'bundle.joblib').read_bytes()).hexdigest(),
                    'model': {'name': 'VoltSense capacity history', 'version': output.name,
                              'algorithm': 'capacity: ' + names['capacity'] + '; RUL: ' + names['rul']},
                    'split_manifest': split, 'provenance': provenance, 'seed': 42,
                    'versions': {name: importlib.metadata.version(name) for name in ['numpy', 'pandas', 'scikit-learn', 'joblib']},
                    'validation': validation, 'validation_baselines': baselines,
                    'model_configurations': {target: bundle.named_steps['regressor'].get_params() for target, bundle in selected.items()},
                    'training_counts': {target: {'records': len(subset(records, partitions['train'], target)),
                        'batteries': int(subset(records, partitions['train'], target).battery_id.nunique())} for target in ['capacity', 'rul']},
                    'leakage_checks': {'battery_disjoint': True, 'duplicate_trajectories_grouped': True,
                        'preprocessing_fit_partition': 'train', 'feature_cutoff': 'strictly before target cycle',
                        'selection_partition': 'validation', 'final_test_used_for_selection': False},
                    'baseline_definitions': {'capacity': 'previous completed discharge capacity (persistence)',
                        'rul': 'mean observed strictly pre-EOL training RUL; same observed terminal guard for serving comparison'},
                    'validation_rul_serving': serving_rul_report(frame, records, partitions['validation'], selected['rul'],
                        subset(records, partitions['train'], 'rul')['target_rul'].mean()),
                    'source_code_sha256': {name: hashlib.sha256((Path(__file__).parent / name).read_bytes()).hexdigest()
                        for name in ['features.py', 'dataset.py', 'training.py', 'rul_policy.py', 'app.py', 'model_loader.py']}}
        dump_new(output / 'manifest.json', manifest)
        return
    if not args.manifest:
        parser.error('--manifest is required for evaluation')
    source = Path(args.manifest).resolve()
    manifest = json.loads(source.read_text(encoding='utf-8'))
    if manifest.get('feature_contract') != FEATURE_CONTRACT or manifest.get('split_manifest') != split or manifest.get('inference_policy') != RUL_POLICY:
        raise ValueError('Candidate contract or split does not match evaluation')
    if manifest.get('provenance', {}).get('source_sha256') != provenance['source_sha256']:
        raise ValueError('Candidate dataset provenance does not match')
    artifact = (source.parent / manifest['bundle_file']).resolve()
    if artifact.parent != source.parent or hashlib.sha256(artifact.read_bytes()).hexdigest() != manifest['sha256']:
        raise ValueError('Candidate artifact hash/path mismatch')
    if manifest.get('evaluation') is not None:
        raise ValueError('Candidate already evaluated; do not tune against the final test set')
    bundle = joblib.load(artifact)
    evaluated, baselines = {}, {}
    for target in ['capacity', 'rul']:
        test = subset(records, partitions['test'], target)
        train = subset(records, partitions['train'], target)
        evaluated.update(target_report(test, target, bundle[target].predict(test[FEATURES])))
        baseline = test['cap_lag1'].to_numpy() if target == 'capacity' else np.full(len(test), train['target_rul'].mean())
        baselines.update(target_report(test, target, baseline))
    manifest['evaluation'] = {'partition': 'final_test', 'battery_disjoint': True, **evaluated, 'baselines': baselines,
                              'rul_population': 'strictly_pre_eol_forecast_rows',
                              'rul_serving': serving_rul_report(frame, records, partitions['test'], bundle['rul'],
                                  subset(records, partitions['train'], 'rul')['target_rul'].mean()),
                              'previously_inspected_test': manifest.get('previously_inspected_test', False)}
    manifest['approved'] = False
    output.mkdir(parents=True, exist_ok=False)
    shutil.copyfile(artifact, output / 'bundle.joblib')
    dump_new(output / 'manifest.json', manifest)


if __name__ == '__main__':
    main()
