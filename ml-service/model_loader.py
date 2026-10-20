"""Only a locally configured, explicitly approved, hash-matched bundle is loadable."""
import hashlib
import json
import os
import importlib.metadata
from pathlib import Path
import joblib
from features import FEATURE_CONTRACT
from rul_policy import RUL_POLICY


class ModelUnavailable(RuntimeError):
    pass


def default_manifest_path():
    base_dir = Path(__file__).resolve().parent
    canonical = base_dir / 'models' / 'canonical' / 'manifest.json'
    if canonical.exists():
        return canonical
    candidate = base_dir / 'runs' / 'nasa-20261016-evaluated-v3' / 'manifest.json'
    if candidate.exists():
        return candidate
    return None


def load_approved():
    configured = os.environ.get('ML_MODEL_MANIFEST')
    if not configured:
        default_path = default_manifest_path()
        if default_path:
            configured = str(default_path)
        else:
            raise ModelUnavailable('No model manifest configured and default candidate not found; legacy artifacts are disabled')
    try:
        manifest_path = Path(configured).resolve(strict=True)
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        is_approved = manifest.get('approved') is True
        manifest['is_experimental'] = not is_approved
        if manifest.get('feature_contract') != FEATURE_CONTRACT:
            raise ValueError('Incompatible feature/target contract')
        if manifest.get('targets') != {'capacity': 'Ah', 'rul': 'discharge_cycles_to_first_80_percent_crossing'}:
            raise ValueError('Incompatible model targets')
        if manifest.get('inference_policy') != RUL_POLICY:
            raise ValueError('Incompatible inference policy')
        versions = manifest.get('versions', {})
        if versions.get('scikit-learn') != importlib.metadata.version('scikit-learn'):
            raise ValueError('Model scikit-learn version does not match the inference runtime')
        artifact = (manifest_path.parent / manifest['bundle_file']).resolve(strict=True)
        if artifact.parent != manifest_path.parent:
            raise ValueError('Bundle must be stored beside its manifest')
        digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
        if digest != manifest.get('sha256'):
            raise ValueError('Artifact hash does not match approved manifest')
        for name in ['name', 'version', 'algorithm']:
            if not isinstance(manifest.get('model', {}).get(name), str) or not manifest['model'][name]:
                raise ValueError('Missing model identity')
        bundle = joblib.load(artifact)  # Trusted local files only, never uploads or remote URIs.
        if set(bundle) != {'capacity', 'rul'}:
            raise ValueError('Bundle requires capacity and rul pipelines')
        for pipeline in bundle.values():
            if not callable(getattr(pipeline, 'predict', None)) or not hasattr(pipeline, 'named_steps'):
                raise ValueError('Expected fitted sklearn pipelines including preprocessing')
            if getattr(pipeline, 'feature_names_in_', None) is None or list(pipeline.feature_names_in_) != FEATURE_CONTRACT['features']:
                raise ValueError('Artifact feature names or order do not match')
        return manifest, bundle
    except (OSError, ValueError, KeyError, TypeError, EOFError, ImportError, AttributeError) as exc:
        raise ModelUnavailable(str(exc)) from exc

