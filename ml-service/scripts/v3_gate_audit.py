"""Read-only audit: no fitting, approval changes or artifact rewrites."""
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import sys
import numpy as np
import joblib
from fastapi.testclient import TestClient
sys.path.insert(0, str(Path.cwd()))
from dataset import load_dataset, feature_records, validate_split, histories_for_rows
from training import subset, report
from features import FEATURES, FEATURE_CONTRACT
from rul_policy import RUL_POLICY, predict_rul
from review_candidate import review
from model_loader import load_approved, ModelUnavailable
import app

root = Path('..').resolve()
manifest_path = Path('runs/nasa-20261016-evaluated-v3/manifest.json').resolve()
manifest = json.loads(manifest_path.read_text())
training_path = Path('runs/nasa-20261016-candidate-v3/manifest.json').resolve()
training = json.loads(training_path.read_text())
data_path = root / 'data/validated/nasa-20261016/validated_cycles.csv'
frame, provenance = load_dataset(data_path)
split = json.loads((data_path.parent / 'split-manifest.json').read_text())
partitions = validate_split(frame, split, provenance['source_sha256'])
assert split == manifest['split_manifest'] == training['split_manifest']
artifact = (manifest_path.parent / manifest['bundle_file']).resolve()
assert artifact.parent == manifest_path.parent
assert hashlib.sha256(artifact.read_bytes()).hexdigest() == manifest['sha256']
assert artifact.read_bytes() == (training_path.parent / training['bundle_file']).read_bytes()
assert manifest['feature_contract'] == FEATURE_CONTRACT
assert manifest['targets'] == {'capacity': 'Ah', 'rul': 'discharge_cycles_to_first_80_percent_crossing'}
assert manifest['inference_policy'] == RUL_POLICY
assert manifest['versions']['scikit-learn'] == importlib.metadata.version('scikit-learn')
assert manifest['approved'] is False and training['approved'] is False
assert all(isinstance(manifest['model'].get(key), str) and manifest['model'][key] for key in ['name', 'version', 'algorithm'])
for name, digest in manifest['source_code_sha256'].items():
    assert hashlib.sha256(Path(name).read_bytes()).hexdigest() == digest
bundle = joblib.load(artifact)  # Trusted local file, offline evaluation only.
assert set(bundle) == {'capacity', 'rul'}
for pipeline in bundle.values():
    assert callable(pipeline.predict) and hasattr(pipeline, 'named_steps')
    assert list(pipeline.feature_names_in_) == FEATURES
records = feature_records(frame)
test = subset(records, partitions['test'], 'capacity')
a = test.target_capacity.to_numpy()
p = bundle['capacity'].predict(test[FEATURES])
b = test.cap_lag1.to_numpy()
rmse = float(np.sqrt(np.mean((p - a) ** 2)))
threshold = float(np.sqrt(np.mean((b - a) ** 2)))
assert abs(rmse - manifest['evaluation']['capacity']['rmse']) < 1e-15
assert abs(threshold - manifest['evaluation']['baselines']['capacity']['rmse']) < 1e-15
per_battery = {}
for battery in partitions['test']:
    mask = test.battery_id.to_numpy() == battery
    per_battery[battery] = {'rows': int(mask.sum()), 'candidate_rmse_Ah': float(np.sqrt(np.mean((p[mask] - a[mask]) ** 2))),
                            'baseline_rmse_Ah': float(np.sqrt(np.mean((b[mask] - a[mask]) ** 2)))}
quality = json.loads((data_path.parent / 'battery-quality-manifest.json').read_text())
used_roles = {b['battery_id']: set() for b in quality['batteries']}
usage_manifests = []
for path in sorted(Path('runs').glob('*/manifest.json')):
    run_manifest = json.loads(path.read_text())
    if 'split_manifest' not in run_manifest:
        continue
    usage_manifests.append(str(path))
    for role, ids in run_manifest['split_manifest']['partitions'].items():
        if role == 'test' and 'evaluation' not in run_manifest:
            continue
        for battery in ids:
            used_roles.setdefault(battery, set()).add(role)
eligible = []
for battery in quality['batteries']:
    if battery['eligible']:
        eligible.append({key: battery[key] for key in ['battery_id', 'reference_capacity_Ah', 'exported_cycles', 'first_observed_80_percent_cycle']})
        eligible[-1]['used_roles'] = sorted(used_roles[battery['battery_id']])
untouched = [b['battery_id'] for b in eligible if b['first_observed_80_percent_cycle'] is not None and not b['used_roles']]
observed_test = records[records.battery_id.isin(partitions['test']) & records.observed_eol]
served = predict_rul(bundle['rul'], observed_test[FEATURES], histories_for_rows(frame, observed_test))
assert len(served) == 58 and (served == 0).all()
censored_ids = [b['battery_id'] for b in eligible if b['first_observed_80_percent_cycle'] is None]
assert records[records.battery_id.isin(censored_ids)].target_rul.isna().all()
review_result = review(manifest_path, data_path)
os.environ['ML_MODEL_MANIFEST'] = str(manifest_path)
try:
    load_approved()
    raise AssertionError('An unapproved artifact was loadable')
except ModelUnavailable as error:
    loader_rejection = str(error)
responses = []
client = TestClient(app.app)
for label, caps in [('pre_eol', [2,1.98,1.96,1.94,1.92,1.9,1.8]),
                    ('at_eol', [2,1.98,1.96,1.94,1.92,1.9,1.6]),
                    ('post_eol_recovery', [2,1.98,1.96,1.94,1.92,1.6,1.8])]:
    response = client.post('/predict', json={'cycleTable': [{'cycle': i + 1, 'capacity': q} for i,q in enumerate(caps)], 'eolThreshold':80})
    assert response.status_code == 503 and response.json()['detail']['code'] == 'MODEL_UNAVAILABLE'
    responses.append({'history': label, 'status': response.status_code, 'code': response.json()['detail']['code']})
result = {'decision': 'not_deployable', 'retrained': False, 'inference_enabled': False,
    'dataset_sha256': provenance['source_sha256'], 'bundle_sha256': manifest['sha256'],
    'capacity_gate': {'source': 'ml-service/review_candidate.py', 'rule': 'reject when candidate pooled capacity RMSE > same-test persistence RMSE',
        'comparison': '<=', 'equality_passes': True, 'tolerance_Ah': 0,
        'rows': len(test), 'test_batteries': partitions['test'], 'weighting': 'pooled rows, not equal-weighted battery RMSE',
        'candidate_rmse_Ah': rmse, 'threshold_rmse_Ah': threshold, 'excess_Ah': rmse-threshold,
        'relative_excess_percent': 100*(rmse/threshold-1), 'passes': rmse <= threshold,
        'candidate_mae_Ah': float(np.mean(np.abs(p-a))), 'baseline_mae_Ah': float(np.mean(np.abs(b-a))),
        'per_battery': per_battery},
    'rul_independence': {'minimum_observed_test_batteries':3, 'eligible_observed_batteries': [b for b in eligible if b['first_observed_80_percent_cycle'] is not None],
        'eligible_censored_batteries': censored_ids, 'unused_eligible_observed_batteries': untouched,
        'excluded_batteries': {b['battery_id']: b['exclusion_reasons'] for b in quality['batteries'] if not b['eligible']},
        'usage_manifests':usage_manifests, 'previously_inspected_test':manifest['previously_inspected_test'],
        'legacy_provenance_limit':'Legacy configuration reports 33 batteries but does not enumerate identities or partitions'},
    'compatibility': {'equivalent_loader_field_checks': True, 'strict_loader_rejection':loader_rejection,
        'source_code_hashes_match': True, 'same_candidate_and_evaluated_bundle': True,
        'features': FEATURES, 'targets':manifest['targets'], 'scikit_learn_version':manifest['versions']['scikit-learn'],
        'inference_policy_matches':True, 'observed_terminal_rows':len(served), 'served_positive_terminal_rul':int((served>0).sum()),
        'censored_batteries_keep_unobserved_labels':True, 'actual_candidate_http_responses':responses},
    'review_rejection_reasons':review_result['rejection_reasons']}
print(json.dumps(result, indent=2, allow_nan=False))
