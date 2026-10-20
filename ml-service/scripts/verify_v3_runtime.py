import importlib.metadata as metadata
import json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path.cwd()))
import joblib
import pandas as pd
from features import FEATURES, FEATURE_CONTRACT, build_row
from rul_policy import predict_rul
from model_loader import load_approved, ModelUnavailable
path = Path('runs/nasa-20261016-evaluated-v3/manifest.json').resolve()
manifest = json.loads(path.read_text())
assert metadata.version('scikit-learn') == manifest['versions']['scikit-learn']
bundle = joblib.load(path.parent / manifest['bundle_file'])  # Offline compatibility check only.
assert set(bundle) == {'capacity', 'rul'}
assert all(list(p.feature_names_in_) == FEATURES for p in bundle.values())
caps = [2, 1.98, 1.96, 1.94, 1.92, 1.6, 1.8]
frame = pd.DataFrame([build_row(caps)], columns=FEATURES)
assert float(bundle['capacity'].predict(frame)[0]) > 0
assert predict_rul(bundle['rul'], frame, [caps]).tolist() == [0]
os.environ['ML_MODEL_MANIFEST'] = str(path)
try:
    load_approved()
    raise AssertionError('Unapproved candidate unexpectedly loaded for serving')
except ModelUnavailable as error:
    assert str(error) == 'Model is not approved'
print(json.dumps({'python': sys.version.split()[0], 'scikit_learn': metadata.version('scikit-learn'),
                  'offline_deserialization_and_feature_parity': True, 'terminal_rul': 0,
                  'strict_serving_load': 'rejected_unapproved'}, indent=2))
