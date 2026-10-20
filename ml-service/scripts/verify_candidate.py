import csv, os, json
from fastapi.testclient import TestClient
from pathlib import Path
os.environ['ML_MODEL_MANIFEST'] = str(Path('runs/nasa-20261016-evaluated-v2/manifest.json').resolve())
import sys
sys.path.insert(0, str(Path.cwd()))
import app
with open('../sample-data/demo_battery_cycles.csv', newline='') as stream:
    rows = [{'cycle': int(r['Cycle']), 'capacity': float(r['Capacity'])} for r in csv.DictReader(stream)]
client = TestClient(app.app)
health = client.get('/health')
response = client.post('/predict', json={'cycleTable': rows, 'eolThreshold': 80})
assert health.json() == {'status': 'error', 'models_loaded': False}
assert response.status_code == 503
assert response.json()['detail']['code'] == 'MODEL_UNAVAILABLE'
print(json.dumps({'configured_candidate_health': health.json(), 'prediction_status': response.status_code, 'error': response.json()}))
