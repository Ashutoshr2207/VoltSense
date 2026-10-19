import copy
import hashlib
import json
import importlib.metadata
from types import SimpleNamespace
import joblib
import numpy as np
import pytest
from fastapi.testclient import TestClient
import app
from features import FEATURES, FEATURE_CONTRACT, build_row, validate_history, first_eol, soh
from model_loader import load_approved, ModelUnavailable
from rul_policy import RUL_POLICY


class PipelineDouble:
    """Serialization/serving test double. No fit method or training."""
    def __init__(self, value):
        self.value = value
        self.named_steps = {'preprocessing': object()}
        self.feature_names_in_ = FEATURES

    def predict(self, frame):
        assert list(frame.columns) == FEATURES
        return np.array([self.value])


def table():
    return [{'cycle': i + 1, 'capacity': 2 - i * .02} for i in range(7)]


@pytest.fixture
def approved(tmp_path, monkeypatch):
    artifact = tmp_path / 'bundle.joblib'
    joblib.dump({'capacity': PipelineDouble(1.88), 'rul': PipelineDouble(20)}, artifact)
    manifest = {'approved': True, 'feature_contract': FEATURE_CONTRACT,
                'inference_policy': copy.deepcopy(RUL_POLICY),
                'targets': {'capacity': 'Ah', 'rul': 'discharge_cycles_to_first_80_percent_crossing'},
                'bundle_file': artifact.name, 'sha256': hashlib.sha256(artifact.read_bytes()).hexdigest(),
                'versions': {'scikit-learn': importlib.metadata.version('scikit-learn')},
                'model': {'name': 'Fixture', 'version': 'test', 'algorithm': 'Untrained test double'}}
    path = tmp_path / 'manifest.json'
    path.write_text(json.dumps(manifest))
    monkeypatch.setenv('ML_MODEL_MANIFEST', str(path))
    return path, manifest


def test_causal_features_and_reference():
    caps = [2, 1.99, 1.98, 1.97, 1.96, 1.95, 1.94]
    row = build_row(caps)
    assert row == build_row(caps[:-1] + [100])
    assert dict(zip(FEATURES, row))['initial_cap'] == 2
    assert dict(zip(FEATURES, row))['deg_rate'] == pytest.approx(.01)
    assert soh(2.1, 2) == 100
    assert first_eol([2, 1.9, 1.6, 1.8]) == 3


@pytest.mark.parametrize('change', ['gap', 'duplicate', 'nan', 'bool', 'zero', 'unordered', 'short', 'mixed'])
def test_invalid_history(change):
    rows = table()
    if change == 'gap': rows[-1]['cycle'] = 8
    if change == 'duplicate': rows[-1]['cycle'] = 6
    if change == 'nan': rows[-1]['capacity'] = float('nan')
    if change == 'bool': rows[-1]['capacity'] = True
    if change == 'zero': rows[-1]['capacity'] = 0
    if change == 'unordered': rows.reverse()
    if change == 'short': rows.pop()
    if change == 'mixed': rows[0]['batteryId'] = 'A'; rows[1]['batteryId'] = 'B'
    with pytest.raises(ValueError): validate_history(rows)


def test_strict_mode_does_not_load_legacy(monkeypatch):
    monkeypatch.delenv('ML_MODEL_MANIFEST', raising=False)
    with pytest.raises(ModelUnavailable, match='legacy'): load_approved()
    client = TestClient(app.app)
    assert client.get('/health').json() == {'status': 'error', 'models_loaded': False}
    response = client.post('/predict', json={'cycleTable': table()})
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'MODEL_UNAVAILABLE'


def test_approved_bundle_and_units(approved):
    client = TestClient(app.app)
    assert client.get('/health').json()['models_loaded']
    body = client.post('/predict', json={'cycleTable': table(), 'eolThreshold': 80}).json()
    assert body['soh'] == 94
    assert body['capacity'] == 1.88
    assert body['rul'] == 20
    assert body['currentCycle'] == 7
    assert body['metrics'] == {'mae': None, 'rmse': None, 'r2': None}
    assert body['confidence']['value'] is None
    assert client.post('/predict', json={'cycleTable': table(), 'eolThreshold': 70}).status_code == 422
    assert client.post('/predict', json={'cycleTable': [None] * 7}).status_code == 422


@pytest.mark.parametrize('change', ['unapproved', 'hash', 'features', 'target', 'version', 'policy', 'missing_policy'])
def test_incompatible_bundle_is_rejected(approved, change):
    path, manifest = approved
    if change == 'unapproved': manifest['approved'] = False
    if change == 'policy': manifest['inference_policy']['threshold_percent'] = 70
    if change == 'missing_policy': manifest.pop('inference_policy')
    if change == 'hash': manifest['sha256'] = 'bad'
    if change == 'features': manifest['feature_contract'] = {'version': 'old'}
    if change == 'target': manifest['targets']['capacity'] = 'percent'
    if change == 'version': manifest['versions']['scikit-learn'] = '0.0.0'
    path.write_text(json.dumps(manifest))
    with pytest.raises(ModelUnavailable): load_approved()


def test_invalid_model_output_not_clipped(monkeypatch):
    monkeypatch.setattr(app, 'load', lambda: ({}, {'capacity': PipelineDouble(-1), 'rul': PipelineDouble(20)}))
    response = TestClient(app.app).post('/predict', json={'cycleTable': table()})
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'INVALID_MODEL_OUTPUT'


def test_positive_model_rul_after_observed_eol_uses_terminal_guard(approved):
    rows = table()
    rows[-1]['capacity'] = 1.5
    response = TestClient(app.app).post('/predict', json={'cycleTable': rows})
    assert response.status_code == 200
    assert response.json()['rul'] == 0


def test_cache_reuses_bundle_and_reloads_manifest(approved, monkeypatch):
    path, manifest = approved
    app._cache_key, app._cache_value = None, None
    real_load = app.load_approved
    calls = []
    def tracked():
        calls.append(1)
        return real_load()
    monkeypatch.setattr(app, 'load_approved', tracked)
    first = app.load()
    assert app.load() is first
    assert len(calls) == 1
    manifest['model']['version'] = 'new-fixture-version'
    path.write_text(json.dumps(manifest))
    assert app.load()[0]['model']['version'] == 'new-fixture-version'
    assert len(calls) == 2
    manifest['approved'] = False
    path.write_text(json.dumps(manifest))
    with pytest.raises(ModelUnavailable, match='not approved'):
        app.load()
    assert app._cache_value is None


def test_cache_detects_bundle_change_and_recovers(approved):
    path, manifest = approved
    app.load()
    artifact = path.parent / manifest['bundle_file']
    original = artifact.read_bytes()
    artifact.write_bytes(original + b'changed')
    with pytest.raises(ModelUnavailable, match='hash'):
        app.load()
    artifact.write_bytes(original)
    assert app.load()[0]['approved']
    artifact.unlink()
    assert TestClient(app.app).get('/health').json()['models_loaded'] is False
    assert app._cache_value is None


def test_cache_key_includes_manifest_path_and_nanosecond_mtimes(approved, monkeypatch):
    import os
    path, manifest = approved
    first_key = app.artifact_key()
    artifact = path.parent / manifest['bundle_file']
    stat = artifact.stat()
    os.utime(artifact, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000_000))
    assert app.artifact_key() != first_key
    assert app.load()[0]['approved']
    other = path.parent / 'other.json'
    manifest['model']['version'] = 'other'
    other.write_text(json.dumps(manifest))
    monkeypatch.setenv('ML_MODEL_MANIFEST', str(other))
    assert app.load()[0]['model']['version'] == 'other'
    monkeypatch.delenv('ML_MODEL_MANIFEST')
    with pytest.raises(ModelUnavailable): app.load()
    assert app._cache_value is None
