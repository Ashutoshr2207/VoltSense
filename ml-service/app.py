"""Strict internal inference; application database ownership stays in Node."""
import math
import json
import os
from pathlib import Path
from threading import Lock
import pandas as pd
from fastapi import FastAPI, HTTPException
from features import FEATURES, EOL_THRESHOLD, build_row, validate_history, finite_number, soh
from model_loader import load_approved, default_manifest_path, ModelUnavailable
from rul_policy import predict_rul

app = FastAPI(title='VoltSense ML Service')

_cache_key = None
_cache_value = None
_cache_lock = Lock()


def artifact_key():
    configured = os.environ.get('ML_MODEL_MANIFEST')
    if not configured:
        default_path = default_manifest_path()
        if default_path:
            configured = str(default_path)
        else:
            raise ModelUnavailable('No model manifest configured and default candidate not found; legacy artifacts are disabled')
    path = Path(configured).resolve(strict=True)
    stat = path.stat()
    manifest = json.loads(path.read_text(encoding='utf-8'))
    bundle = (path.parent / manifest['bundle_file']).resolve(strict=True)
    if bundle.parent != path.parent:
        raise ModelUnavailable('Bundle must be stored beside its manifest')
    bundle_stat = bundle.stat()
    return (str(path), stat.st_mtime_ns, stat.st_size,
            str(bundle), bundle_stat.st_mtime_ns, bundle_stat.st_size)


def load():
    global _cache_key, _cache_value
    with _cache_lock:
        try:
            key = artifact_key()
            if key != _cache_key:
                _cache_key, _cache_value = None, None
                value = load_approved()
                if artifact_key() != key:
                    raise ModelUnavailable('Model files changed while loading; retry')
                _cache_key, _cache_value = key, value
            return _cache_value
        except Exception:
            # A removed, revoked or corrupted release must never serve a stale cache.
            _cache_key, _cache_value = None, None
            raise


@app.get('/health')
def health():
    try:
        manifest, _ = load()
        return {
            'status': 'ok',
            'models_loaded': True,
            'model': manifest.get('model', {}),
            'experimental': manifest.get('is_experimental', False),
        }
    except Exception as exc:
        return {'status': 'error', 'models_loaded': False, 'detail': str(exc)}


def test_metrics(manifest):
    evaluation = manifest.get('evaluation', {})
    metrics = evaluation.get('soh', {})
    if evaluation.get('partition') != 'final_test' or evaluation.get('battery_disjoint') is not True:
        return {'mae': None, 'rmse': None, 'r2': None}
    values = {k: metrics.get(k) for k in ['mae', 'rmse', 'r2']}
    if not all(finite_number(v) for v in values.values()) or values['mae'] < 0 or values['rmse'] < 0:
        return {'mae': None, 'rmse': None, 'r2': None}
    return values


@app.post('/predict')
def predict(payload: dict):
    try:
        threshold = payload.get('eolThreshold', EOL_THRESHOLD)
        if not finite_number(threshold) or threshold != EOL_THRESHOLD:
            raise ValueError('This target contract supports only 80 percent SOH EOL')
        if payload.get('batteryId') is not None and not isinstance(payload['batteryId'], str):
            raise ValueError('batteryId must be a string')
        caps = validate_history(payload.get('cycleTable'))
        x = build_row(caps)
        if not all(math.isfinite(v) for v in x):
            raise ValueError('Feature values must be finite')
    except (ValueError, TypeError, OverflowError) as exc:
        raise HTTPException(422, detail={'code': 'INVALID_ML_INPUT', 'message': str(exc)}) from exc
    try:
        manifest, bundle = load()
    except Exception as exc:
        raise HTTPException(503, detail={'code': 'MODEL_UNAVAILABLE', 'message': str(exc) if isinstance(exc, ModelUnavailable) else 'Model could not be loaded'}) from exc
    try:
        frame = pd.DataFrame([x], columns=FEATURES)
        capacity = float(bundle['capacity'].predict(frame)[0])
        if not math.isfinite(capacity) or capacity <= 0:
            raise ValueError('Model capacity must be positive and finite')
        # Terminal status comes from observed history, not a guessed future crossing.
        rul = int(predict_rul(bundle['rul'], frame, [caps])[0])
        predicted_soh = soh(capacity, caps[0])
    except Exception as exc:
        raise HTTPException(503, detail={'code': 'INVALID_MODEL_OUTPUT', 'message': str(exc)}) from exc
    displayed_soh = round(predicted_soh, 1)
    is_experimental = bool(manifest.get('is_experimental', False))
    warning = (
        'Experimental candidate: unapproved model; not validated for real-world battery decisions.'
        if is_experimental else None
    )
    return {
        'soh': displayed_soh, 'rul': rul, 'capacity': capacity,
        'referenceCapacity': caps[0], 'currentCycle': len(caps), 'eolThreshold': EOL_THRESHOLD,
        'status': 'healthy' if displayed_soh >= 90 else 'attention' if displayed_soh >= 80 else 'critical',
        'factors': [{'name': 'Historical capacity', 'condition': f'{len(caps)} completed discharges',
                     'impact': 'Observed', 'explanation': 'Features use capacities strictly before the latest completed cycle; the reference is the first discharge. RUL is zero once the supplied observed history has reached 80% SOH, including after recovery.'}],
        'recommendations': [], 'model': manifest['model'], 'metrics': test_metrics(manifest),
        'confidence': {'calibrated': False, 'method': None, 'value': None, 'uncertaintyInterval': 'Unavailable'},
        'experimental': is_experimental,
        'warning': warning,
    }

