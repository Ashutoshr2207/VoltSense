import hashlib, json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path.cwd()))
from fastapi.testclient import TestClient
from features import FEATURE_CONTRACT
from rul_policy import RUL_POLICY
import app
path = Path('runs/nasa-20261016-evaluated-v3/manifest.json').resolve()
manifest = json.loads(path.read_text())
assert manifest['approved'] is False
assert manifest['targets'] == {'capacity': 'Ah', 'rul': 'discharge_cycles_to_first_80_percent_crossing'}
assert manifest['feature_contract'] == FEATURE_CONTRACT
assert manifest['inference_policy'] == RUL_POLICY
assert manifest['seed'] == 42 and manifest['previously_inspected_test'] is True
assert all(isinstance(manifest['model'][key], str) and manifest['model'][key] for key in ['name', 'version', 'algorithm'])
assert hashlib.sha256((path.parent / manifest['bundle_file']).read_bytes()).hexdigest() == manifest['sha256']
for name, digest in manifest['source_code_sha256'].items():
    assert hashlib.sha256(Path(name).read_bytes()).hexdigest() == digest, name
os.environ['ML_MODEL_MANIFEST'] = str(path)
client = TestClient(app.app)
assert client.get('/health').json() == {'status': 'error', 'models_loaded': False}
results = []
for last in [1.8, 1.6, 1.5]:
    caps = [2, 1.98, 1.96, 1.94, 1.92, 1.9, last]
    response = client.post('/predict', json={'cycleTable': [{'cycle': i + 1, 'capacity': q} for i, q in enumerate(caps)], 'eolThreshold': 80})
    assert response.status_code == 503 and response.json()['detail']['code'] == 'MODEL_UNAVAILABLE'
    results.append({'latest_capacity_Ah': last, 'http_status': response.status_code, 'code': response.json()['detail']['code']})
print(json.dumps({'candidate_fields_hashes_and_source_parity': True, 'approval_gate': results}, indent=2))
