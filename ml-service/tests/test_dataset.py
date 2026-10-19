import json
import zipfile
import pandas as pd
import pytest
from dataset import load_dataset, feature_records, make_split, validate_split
from features import FEATURES, build_row
from training import metrics, dump_new


def source(tmp_path):
    rows = []
    for b in range(6):
        for t in range(1, 11):
            rows.append({'battery_id': 'B' + str(b), 'test_id': t * 2, 'type': 'discharge', 'Capacity': 2 + b * .1 - t * .06})
    path = tmp_path / 'metadata.csv'
    pd.DataFrame(rows).to_csv(path, index=False)
    return path


def test_loader_targets_and_training_inference_agree(tmp_path):
    frame, provenance = load_dataset(source(tmp_path))
    rows = feature_records(frame)
    for battery, group in frame.groupby('battery_id'):
        caps = group['Capacity'].tolist()
        first = rows[rows.battery_id == battery].iloc[0]
        assert first[FEATURES].tolist() == build_row(caps[:7])
        crossing = next((i + 1 for i, c in enumerate(caps) if c / caps[0] <= .8), None)
        if crossing and crossing >= 7:
            assert first.target_rul == crossing - 7
    assert provenance['provenance_verified'] is False
    split = make_split(frame, provenance['source_sha256'])
    assert split == make_split(frame, provenance['source_sha256'])
    validate_split(frame, split, provenance['source_sha256'])
    split['partitions']['test'].append(split['partitions']['train'][0])
    with pytest.raises(ValueError): validate_split(frame, split, provenance['source_sha256'])


def test_censored_targets_are_not_fabricated(tmp_path):
    frame, _ = load_dataset(source(tmp_path))
    frame['Capacity'] = frame['Capacity'] * 0 + 2
    assert feature_records(frame)['target_rul'].isna().all()


def test_duplicate_battery_trajectories_cannot_cross_partitions(tmp_path):
    frame, provenance = load_dataset(source(tmp_path))
    clone = frame[frame.battery_id == 'B0'].copy()
    clone['battery_id'] = 'COPY'
    frame = pd.concat([frame, clone])
    split = make_split(frame, provenance['source_sha256'])
    assert any(set(['B0', 'COPY']).issubset(ids) for ids in split['partitions'].values())
    validate_split(frame, split, provenance['source_sha256'])


def test_zip_loader_reads_member_without_extraction(tmp_path):
    path = source(tmp_path)
    archive = tmp_path / 'nasa.zip'
    with zipfile.ZipFile(archive, 'w') as z:
        z.write(path, 'cleaned_dataset/metadata.csv')
    frame, p = load_dataset(archive)
    assert len(frame) == 60
    assert p['archive_member'] == 'cleaned_dataset/metadata.csv'


def test_missing_columns_conflicts_and_nonfinite_values_fail(tmp_path):
    path = source(tmp_path)
    frame = pd.read_csv(path)
    frame.loc[0, 'Capacity'] = float('inf')
    frame.to_csv(path, index=False)
    with pytest.raises(ValueError): load_dataset(path)
    frame.loc[0, 'Capacity'] = 2
    frame = pd.concat([frame, frame.iloc[[0]].assign(Capacity=3)])
    frame.to_csv(path, index=False)
    with pytest.raises(ValueError, match='Conflicting'): load_dataset(path)
    frame.drop(columns='test_id').to_csv(path, index=False)
    with pytest.raises(ValueError, match='Missing'): load_dataset(path)


def test_metric_units_and_no_overwrite(tmp_path):
    result = metrics([80, 90], [82, 88])
    assert result['mae'] == 2
    assert result['rmse'] == 2
    assert result['pearson_r'] == pytest.approx(1)
    path = tmp_path / 'manifest.json'
    dump_new(path, {'approved': False})
    with pytest.raises(FileExistsError): dump_new(path, {})
