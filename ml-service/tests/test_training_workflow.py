"""Small synthetic fits verify orchestration, never accuracy claims."""
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
import training
from dataset import load_dataset, feature_records
from features import FEATURES
from review_candidate import review


def test_partition_fit_validation_selection_and_final_test(tmp_path, monkeypatch):
    rows = []
    for b in range(14):
        for cycle in range(1, 16):
            rows.append({'battery_id': 'B' + str(b), 'test_id': cycle, 'cycle': cycle, 'type': 'discharge',
                         'Capacity': 2 + b * .01 - cycle * (.05 if b < 5 else .002)})
    source = tmp_path / 'cycles.csv'
    pd.DataFrame(rows).to_csv(source, index=False)
    split_path = tmp_path / 'split.json'
    training.main(['split', '--dataset', str(source), '--stratify-rul', '--output', str(split_path)])
    monkeypatch.setattr(training, 'candidates', lambda: {
        'RandomForest': RandomForestRegressor(n_estimators=3, max_depth=2, random_state=42),
        'GradientBoosting': GradientBoostingRegressor(n_estimators=3, max_depth=2, random_state=42)})
    candidate, evaluated = tmp_path / 'candidate', tmp_path / 'evaluated'
    common = ['--dataset', str(source), '--split-manifest', str(split_path)]
    training.main(['train', *common, '--output', str(candidate)])
    manifest = json.loads((candidate / 'manifest.json').read_text())
    assert manifest['approved'] is False
    assert manifest['inference_policy']['version'] == 'observed-eol-terminal-v1'
    assert 'observed_eol' not in manifest['feature_contract']['features']
    frame, _ = load_dataset(source)
    records = feature_records(frame)
    bundle = joblib.load(candidate / 'bundle.joblib')
    for target in ['capacity', 'rul']:
        train = training.subset(records, manifest['split_manifest']['partitions']['train'], target)
        assert np.allclose(bundle[target].named_steps['scale'].mean_, train[FEATURES].mean())
        if target == 'rul':
            assert not train.observed_eol.any()
            assert (train.target_rul > 0).all()
        selected_name = min(manifest['validation'][target], key=lambda name: (
            manifest['validation'][target][name]['soh' if target == 'capacity' else 'rul']['battery_mean_mae'], name))
        assert selected_name in manifest['model']['algorithm'].split('; ')[0 if target == 'capacity' else 1]
    training.main(['evaluate', *common, '--manifest', str(candidate / 'manifest.json'), '--output', str(evaluated)])
    final = json.loads((evaluated / 'manifest.json').read_text())
    assert final['approved'] is False
    assert final['evaluation']['partition'] == 'final_test'
    assert final['sha256'] == manifest['sha256']
    assert (candidate / 'bundle.joblib').read_bytes() == (evaluated / 'bundle.joblib').read_bytes()
    assert set(final['evaluation']['capacity']['per_battery']) == set(manifest['split_manifest']['partitions']['test'])
    decision = review(evaluated / 'manifest.json', source)
    assert decision['approved'] is False
    assert all(decision['checks']['training_only_scaler_mean_verified'].values())
    assert decision['rejection_reasons']
    assert decision['checks']['post_eol_invalid_outputs'] == 0
    assert final['evaluation']['rul_serving']['candidate']['observed_eol']['mae'] == 0
    assert final['evaluation']['rul_serving']['baselines']['observed_eol']['mae'] == 0
