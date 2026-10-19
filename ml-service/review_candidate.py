"""Offline safety review; never enables inference or changes approval flags."""
import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import platform
import joblib
import numpy as np
from dataset import load_dataset, feature_records, validate_split, histories_for_rows
from features import FEATURES, FEATURE_CONTRACT, first_eol
from training import dump_new, subset
from rul_policy import RUL_POLICY, predict_rul


def review(manifest_path, dataset_path):
    path = Path(manifest_path).resolve()
    manifest = json.loads(path.read_text(encoding='utf-8'))
    frame, provenance = load_dataset(dataset_path)
    if manifest['feature_contract'] != FEATURE_CONTRACT or manifest['provenance']['source_sha256'] != provenance['source_sha256']:
        raise ValueError('Candidate/data contract mismatch')
    partitions = validate_split(frame, manifest['split_manifest'], provenance['source_sha256'])
    artifact = (path.parent / manifest['bundle_file']).resolve()
    if artifact.parent != path.parent or hashlib.sha256(artifact.read_bytes()).hexdigest() != manifest['sha256']:
        raise ValueError('Artifact hash/path mismatch')
    if manifest['versions']['scikit-learn'] != importlib.metadata.version('scikit-learn'):
        raise ValueError('Incompatible serialization runtime')
    bundle = joblib.load(artifact)  # Explicitly trusted local training output, offline only.
    records = feature_records(frame)
    training_only_scaling = {}
    for target in ['capacity', 'rul']:
        pipeline = bundle[target]
        if list(pipeline.feature_names_in_) != FEATURES:
            raise ValueError('Fitted feature contract mismatch')
        train = subset(records, partitions['train'], target)
        training_only_scaling[target] = bool(np.allclose(pipeline.named_steps['scale'].mean_, train[FEATURES].mean().to_numpy(), rtol=1e-12, atol=1e-12))
    unsafe, raw_positive = [], []
    policy_matches = manifest.get('inference_policy') == RUL_POLICY
    for battery, group in frame[frame.battery_id.isin(partitions['test'])].groupby('battery_id'):
        eol = first_eol(group.sort_values('cycle').Capacity.tolist())
        if eol is None:
            continue
        rows = records[(records.battery_id == battery) & (records.cycle_idx >= eol)]
        if rows.empty:
            continue
        raw = bundle['rul'].predict(rows[FEATURES])
        raw_positive.extend({'battery_id': battery, 'target_cycle': int(t), 'raw_rul_cycles': float(v)}
                            for t, v in zip(rows.cycle_idx, raw) if v > 0)
        predicted = predict_rul(bundle['rul'], rows[FEATURES], histories_for_rows(frame, rows))
        for cycle, value in zip(rows.cycle_idx, predicted):
            if not np.isfinite(value) or value < 0 or int(round(float(value))) != 0:
                unsafe.append({'battery_id': battery, 'target_cycle': int(cycle), 'predicted_rul_cycles': float(value)})
    evaluation = manifest['evaluation']
    reasons = []
    if not policy_matches:
        reasons.append('Inference policy does not match the shared observed-EOL contract')
    if manifest.get('previously_inspected_test'):
        reasons.append('Held-out batteries were previously inspected; this rerun is confirmation, not a fresh final test')
    if not all(training_only_scaling.values()):
        reasons.append('Preprocessing is inconsistent with training-only fit')
    if evaluation['rul']['battery_count'] < 3:
        reasons.append('Only ' + str(evaluation['rul']['battery_count']) + ' held-out battery has observed RUL labels; insufficient evidence for deployment across batteries')
    if evaluation['capacity']['rmse'] > evaluation['baselines']['capacity']['rmse']:
        reasons.append('Capacity RMSE is worse than the persistence baseline')
    if unsafe:
        reasons.append('Observed-history EOL guard failed; terminal RUL must be zero')
    return {'approved': False, 'inference_enabled': False, 'manifest': str(path),
            'manifest_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'bundle_sha256': manifest['sha256'], 'dataset_sha256': provenance['source_sha256'],
            'checks': {'exact_fitted_feature_contract': True, 'serialization_version_and_hash': True,
                       'battery_disjoint': True, 'training_only_scaler_mean_verified': training_only_scaling,
                       'heldout_battery_counts': {task: evaluation[task]['battery_count'] for task in ['capacity', 'rul']},
                       'post_eol_invalid_outputs': len(unsafe), 'raw_post_eol_positive_outputs': len(raw_positive),
                       'inference_policy_matches': policy_matches},
            'rejection_reasons': reasons, 'post_eol_examples': unsafe,
            'raw_post_eol_examples': raw_positive,
            'environment': {'python': platform.python_version(), 'packages': {name: importlib.metadata.version(name)
                for name in ['numpy', 'pandas', 'scipy', 'scikit-learn', 'joblib', 'fastapi', 'pytest', 'httpx']}},
            'code_sha256': {name: hashlib.sha256((Path(__file__).parent / name).read_bytes()).hexdigest()
                           for name in ['convert_nasa.py', 'dataset.py', 'features.py', 'training.py', 'model_loader.py', 'review_candidate.py', 'rul_policy.py', 'app.py']}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--dataset', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    result = review(args.manifest, args.dataset)
    dump_new(args.output, result)
    print(json.dumps({key: value for key, value in result.items() if key in ['approved', 'checks', 'rejection_reasons']}, indent=2))


if __name__ == '__main__':
    main()
