"""Terminal-state guards use observed prefixes; targets never become regressor features."""
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
import app
from dataset import feature_records, histories_for_rows
from features import FEATURES, build_row
from rul_policy import predict_rul, observed_eol
from test_inference import PipelineDouble, approved, table


class MustNotPredict:
    def predict(self, frame):
        raise AssertionError('Terminal status must not invoke the RUL regressor')


def history(caps):
    return [{'cycle': i, 'capacity': q} for i, q in enumerate(caps, 1)]


def data(caps):
    return pd.DataFrame({'battery_id': ['TEST'] * len(caps), 'cycle': range(1, len(caps) + 1), 'Capacity': caps})


@pytest.mark.parametrize('caps', [
    [2, 1.98, 1.96, 1.94, 1.92, 1.90, 1.6],
    [2, 1.98, 1.96, 1.94, 1.92, 1.6, 1.5],
    [2, 1.98, 1.96, 1.94, 1.92, 1.6, 2.1],
])
def test_at_post_and_recovered_eol_never_call_rul_regressor(caps):
    frame = pd.DataFrame([build_row(caps)], columns=FEATURES)
    assert predict_rul(MustNotPredict(), frame, [caps]).tolist() == [0]


def test_pre_eol_still_uses_model_and_rounds_cycles():
    caps = [2, 1.98, 1.96, 1.94, 1.92, 1.90, 1.8]
    frame = pd.DataFrame([build_row(caps)], columns=FEATURES)
    assert observed_eol(caps) is None
    assert predict_rul(PipelineDouble(20.6), frame, [caps]).tolist() == [21]
    changed = caps[:-1] + [1.6]
    assert build_row(changed) == build_row(caps)
    assert predict_rul(MustNotPredict(), frame, [changed]).tolist() == [0]


def test_targets_are_positive_before_crossing_zero_after_and_unobserved_if_censored():
    caps = [2., 1.98, 1.96, 1.94, 1.92, 1.9, 1.8, 1.6, 1.7, 1.5]
    records = feature_records(data(caps))
    assert records.target_rul.tolist() == [1, 0, 0, 0]
    assert records.observed_eol.tolist() == [False, True, True, True]
    assert histories_for_rows(data(caps), records)[0] == caps[:7]
    prefix_records = feature_records(data(caps[:7]))
    assert prefix_records.target_rul.isna().all()
    assert prefix_records.iloc[0][FEATURES].tolist() == records.iloc[0][FEATURES].tolist()
    assert not prefix_records.observed_eol.any()


@pytest.mark.parametrize('invalid', [None, float('nan'), 0, -1])
def test_missing_or_invalid_capacity_cannot_be_guarded_or_imputed(invalid):
    caps = [2, 1.98, 1.96, 1.94, 1.92, invalid, 1.5]
    with pytest.raises(ValueError): observed_eol(caps)
    # JSON forbids NaN; finite invalids still verify the endpoint's validation order.
    if invalid is None or np.isfinite(invalid):
        response = TestClient(app.app).post('/predict', json={'cycleTable': history(caps)})
        assert response.status_code == 422
        assert response.json()['detail']['code'] == 'INVALID_ML_INPUT'


@pytest.mark.parametrize('raw', [-1, np.nan, np.inf])
def test_invalid_pre_eol_prediction_is_not_replaced(raw):
    caps = [2, 1.98, 1.96, 1.94, 1.92, 1.9, 1.8]
    with pytest.raises(ValueError): predict_rul(PipelineDouble(raw), pd.DataFrame([build_row(caps)], columns=FEATURES), [caps])


@pytest.mark.parametrize('caps,expected', [
    ([2, 1.98, 1.96, 1.94, 1.92, 1.9, 1.8], 20),
    ([2, 1.98, 1.96, 1.94, 1.92, 1.9, 1.6], 0),
    ([2, 1.98, 1.96, 1.94, 1.92, 1.6, 1.8], 0),
])
def test_approved_serialized_response_preserves_schema_and_units(approved, caps, expected):
    response = TestClient(app.app).post('/predict', json={'cycleTable': history(caps), 'eolThreshold': 80})
    assert response.status_code == 200
    body = response.json()
    assert body['rul'] == expected
    assert body['capacity'] == 1.88 and body['referenceCapacity'] == 2
    assert body['currentCycle'] == 7 and body['eolThreshold'] == 80
    assert set(body) == {'soh', 'rul', 'capacity', 'referenceCapacity', 'currentCycle', 'eolThreshold',
                         'status', 'factors', 'recommendations', 'model', 'metrics', 'confidence'}


def test_observed_eol_does_not_bypass_approval(monkeypatch):
    monkeypatch.delenv('ML_MODEL_MANIFEST', raising=False)
    response = TestClient(app.app).post('/predict', json={'cycleTable': history([2, 1.98, 1.96, 1.94, 1.92, 1.9, 1.5])})
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'MODEL_UNAVAILABLE'


def test_mixed_batch_only_calls_regressor_for_pre_eol_rows():
    histories = [[2, 1.98, 1.96, 1.94, 1.92, 1.9, 1.8],
                 [2, 1.98, 1.96, 1.94, 1.92, 1.9, 1.6],
                 [2, 1.98, 1.96, 1.94, 1.92, 1.6, 2.1]]
    frame = pd.DataFrame([build_row(caps) for caps in histories], columns=FEATURES)
    class Spy:
        def predict(self, selected):
            assert selected.index.tolist() == [0]
            assert selected.columns.tolist() == FEATURES
            return [12.7]
    assert predict_rul(Spy(), frame, histories).tolist() == [13, 0, 0]
