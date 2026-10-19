"""Quality policy and target cutoff regression tests using independent synthetic fixtures."""
import json
import numpy as np
import pandas as pd
import pytest
from scipy.io import savemat
from convert_nasa import assess, convert, timestamp
from dataset import load_dataset, feature_records, make_split, validate_split
from features import FEATURES, build_row, soh, first_eol


def discharge(q=2.0, start=4.2, end=2.65):
    t = np.linspace(0, q * 1800, 50)
    return {'Capacity': q, 'Time': t, 'Voltage_measured': np.linspace(start, end, 50),
            'Current_measured': np.full(50, -2.), 'Temperature_measured': np.full(50, 25.)}


def corpus(tmp_path, capacities, invalid_first=False):
    source = tmp_path / 'raw'
    source.mkdir()
    pd.DataFrame([{'battery_id': 'B0005', 'group': 'G1', 'discharge_cutoff_V': 2.7}]).to_csv(source / 'metadata.csv', index=False)
    cycles = []
    for i, q in enumerate(capacities):
        cycles.append({'type': 'discharge', 'time': [2020, 1, i + 1, 0, 0, 0],
                       'ambient_temperature': 24., 'data': discharge(q, start=3.8 if invalid_first and i == 0 else 4.2)})
    savemat(source / 'B0005.mat', {'B0005': {'cycle': cycles}})
    return source


def test_quality_measures_loaded_cutoff_not_rest_rebound():
    data = discharge()
    data['Voltage_measured'][-1] = 3.5
    data['Current_measured'][-1] = 0
    measured, failures = assess(data, 2.7)
    assert measured['last_active_voltage_V'] < 2.85
    assert failures == []
    data['Voltage_measured'][:] = 3.7
    assert 'documented_discharge_cutoff_not_observed' in assess(data, 2.7)[1]


@pytest.mark.parametrize('q', [0, -1, np.nan])
def test_invalid_capacity_not_integrated_or_imputed(q):
    data = discharge()
    data['Capacity'] = q
    assert 'invalid_capacity' in assess(data, 2.7)[1]


def test_converter_preserves_raw_and_stops_at_gap(tmp_path):
    source = corpus(tmp_path, [2.] * 8 + [0.] + [1.5] * 8)
    original = (source / 'B0005.mat').read_bytes()
    manifest, summary = convert(source, tmp_path / 'converted')
    assert summary['retained_cycles'] == 8
    assert summary['censored_batteries'] == ['B0005']
    assert manifest['batteries'][0]['records'][-1]['exported_for_training'] is False
    assert (source / 'B0005.mat').read_bytes() == original
    frame, provenance = load_dataset(tmp_path / 'converted' / 'validated_cycles.csv')
    assert frame.cycle.tolist() == list(range(1, 9))
    assert frame.test_id.tolist() == list(range(1, 9))
    assert provenance['quality_manifest_sha256']
    assert feature_records(frame).target_rul.isna().all()
    with pytest.raises(FileExistsError): convert(source, tmp_path / 'converted')


def test_questionable_first_reference_never_rebased(tmp_path):
    source = corpus(tmp_path, [2.] * 10, invalid_first=True)
    with pytest.raises(ValueError, match='No eligible'): convert(source, tmp_path / 'converted')


def test_loader_and_feature_generator_reject_explicit_gaps(tmp_path):
    frame = pd.DataFrame({'battery_id': ['B'] * 8, 'test_id': range(1, 9), 'type': ['discharge'] * 8,
                          'Capacity': [2.] * 8, 'cycle': [1, 2, 3, 4, 5, 6, 8, 9]})
    source = tmp_path / 'bad.csv'
    frame.to_csv(source, index=False)
    with pytest.raises(ValueError, match='uninterrupted'): load_dataset(source)
    with pytest.raises(ValueError, match='gaps'): feature_records(frame)


def test_current_and_future_capacity_never_enters_features():
    caps = [2., 1.99, 1.98, 1.97, 1.96, 1.95, 1.94, 1.93, 1.92]
    frame = pd.DataFrame({'battery_id': ['B'] * 9, 'cycle': range(1, 10), 'Capacity': caps})
    original = feature_records(frame)
    frame.loc[frame.cycle >= 7, 'Capacity'] = [1.5, 1.4, 1.3]
    changed = feature_records(frame)
    assert original.iloc[0][FEATURES].tolist() == changed.iloc[0][FEATURES].tolist() == build_row(caps[:7])
    assert original.iloc[0].target_capacity != changed.iloc[0].target_capacity
    assert np.isnan(original.iloc[0].target_rul)
    assert changed.iloc[0].target_rul == 0
    assert soh(2.1, 2.) == 100
    assert first_eol([2., 1.8, 1.6, 1.7]) == 3
    assert first_eol([2., 1.8, 1.61]) is None


def test_timestamp_fractional_seconds_and_bad_calendar():
    assert timestamp([2020, 1, 1, 0, 0, 1.25]).endswith('01.250000')
    with pytest.raises(ValueError): timestamp([2020, 13, 1, 0, 0, 1])


def test_capacity_round_trip_retains_original_double(tmp_path):
    q = 1.8564874208181574
    source = corpus(tmp_path, [q] * 8)
    convert(source, tmp_path / 'converted')
    frame, _ = load_dataset(tmp_path / 'converted' / 'validated_cycles.csv')
    assert frame.Capacity.iloc[0] == q


def test_stratified_split_is_frozen_and_all_roles_have_rul():
    rows = []
    for b in range(14):
        for cycle in range(1, 15):
            q = 2 + b * .01 - cycle * (.05 if b < 5 else .002)
            rows.append({'battery_id': 'B' + str(b), 'cycle': cycle, 'Capacity': q})
    frame = pd.DataFrame(rows)
    split = make_split(frame, 'source', stratify_rul=True)
    assert split == make_split(frame, 'source', stratify_rul=True)
    assert sorted(len(ids) for ids in split['partitions'].values()) == [3, 3, 8]
    validate_split(frame, split, 'source')
    records = feature_records(frame)
    for ids in split['partitions'].values():
        assert records[records.battery_id.isin(ids)].target_rul.notna().any()
