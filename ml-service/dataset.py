"""Explicit NASA metadata adapter; no manufacturer or unit inference."""
import hashlib
import io
import json
import zipfile
from pathlib import Path
import numpy as np
import pandas as pd
from features import FEATURES, MIN_CYCLES, build_row, first_eol, soh

REQUIRED = ['battery_id', 'test_id', 'type', 'Capacity']


def load_dataset(source, member='cleaned_dataset/metadata.csv'):
    source = Path(source)
    raw = source.read_bytes()
    if source.suffix.lower() == '.zip':
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            # Read one explicitly named member; never extract uploaded paths.
            info = archive.getinfo(member)
            if info.file_size > 100 * 1024 * 1024:
                raise ValueError('Metadata member exceeds the 100 MiB loader limit')
            metadata = archive.read(member)
    elif source.suffix.lower() == '.csv':
        metadata = raw
    else:
        raise ValueError('Dataset source must be a metadata CSV or ZIP')
    frame = pd.read_csv(io.BytesIO(metadata), dtype={'battery_id': str}, float_precision='round_trip')
    missing = set(REQUIRED) - set(frame.columns)
    if missing:
        raise ValueError(f'Missing NASA metadata columns: {sorted(missing)}')
    provenance = {'source_path': str(source.resolve()), 'source_sha256': hashlib.sha256(raw).hexdigest(),
                  'metadata_sha256': hashlib.sha256(metadata).hexdigest(),
                  'archive_member': member if source.suffix.lower() == '.zip' else None,
                  'adapter': 'nasa-metadata-v1', 'capacity_unit': 'Ah',
                  'ordering': 'test_id within battery; discharge ordinal after filtering type',
                  'available_columns': list(frame.columns),
                  'provenance_verified': False}
    frame = frame.drop_duplicates().copy()
    if frame['battery_id'].isna().any() or frame['battery_id'].str.strip().eq('').any():
        raise ValueError('Every metadata row requires a battery_id')
    frame['battery_id'] = frame['battery_id'].str.strip()
    frame['test_id'] = pd.to_numeric(frame['test_id'], errors='raise')
    if (not np.isfinite(frame['test_id']).all() or (frame['test_id'] < 0).any()
            or (frame['test_id'] % 1 != 0).any()):
        raise ValueError('test_id must be a finite nonnegative integer')
    if frame.duplicated(['battery_id', 'test_id']).any():
        raise ValueError('Conflicting records for a battery/test_id')
    if frame['type'].isna().any():
        raise ValueError('Every metadata row requires an operation type')
    frame = frame[frame['type'].str.strip().str.lower() == 'discharge'].copy()
    frame['Capacity'] = pd.to_numeric(frame['Capacity'], errors='raise')
    if frame.empty or not np.isfinite(frame['Capacity']).all() or (frame['Capacity'] <= 0).any():
        raise ValueError('Discharge capacities must be positive finite Ah measurements')
    frame = frame.sort_values(['battery_id', 'test_id']).reset_index(drop=True)
    if 'cycle' in frame.columns:
        frame['cycle'] = pd.to_numeric(frame['cycle'], errors='raise')
        for battery, group in frame.groupby('battery_id'):
            if group['cycle'].tolist() != list(range(1, len(group) + 1)):
                raise ValueError('Explicit discharge cycles must be an uninterrupted prefix starting at 1: ' + battery)
        provenance['ordering'] = 'Explicit original discharge ordinal; test_id preserves source operation identity; gaps rejected'
    else:
        frame['cycle'] = frame.groupby('battery_id').cumcount() + 1
    quality = source.parent / 'battery-quality-manifest.json'
    if quality.exists():
        quality_bytes = quality.read_bytes()
        quality_manifest = json.loads(quality_bytes)
        if quality_manifest.get('dataset_sha256') != provenance['source_sha256']:
            raise ValueError('Quality manifest does not match dataset hash')
        provenance['quality_manifest_sha256'] = hashlib.sha256(quality_bytes).hexdigest()
        provenance['quality_policy'] = quality_manifest['policy']
        provenance['raw_source_hashes'] = quality_manifest['source_hashes']
    provenance['batteries'] = sorted(frame['battery_id'].unique().tolist())
    return frame, provenance


def feature_records(frame):
    records = []
    for battery_id, group in frame.groupby('battery_id', sort=True):
        group = group.sort_values('cycle')
        if group['cycle'].tolist() != list(range(1, len(group) + 1)):
            raise ValueError('Feature history cannot cross gaps or rebase cycle identifiers')
        caps = group['Capacity'].tolist()
        eol = first_eol(caps)
        for t in range(MIN_CYCLES, len(caps) + 1):
            row = dict(zip(FEATURES, build_row(caps[:t])))
            row.update(battery_id=battery_id, target_capacity=caps[t - 1],
                       target_soh=soh(caps[t - 1], caps[0]),
                       target_rul=max(0, eol - t) if eol is not None else np.nan,
                       observed_eol=first_eol(caps[:t]) is not None)
            records.append(row)
    if not records:
        raise ValueError('No batteries have seven complete discharge cycles')
    return pd.DataFrame(records)


def histories_for_rows(frame, rows):
    """Return each target's supplied prefix, never its full future trajectory."""
    capacities = {battery: group.sort_values('cycle')['Capacity'].tolist()
                  for battery, group in frame.groupby('battery_id')}
    return [capacities[row.battery_id][:int(row.cycle_idx)] for row in rows.itertuples()]


def trajectory_groups(frame):
    groups = {}
    for battery_id, group in frame.groupby('battery_id', sort=True):
        caps = group.sort_values('cycle')['Capacity'].tolist()
        digest = hashlib.sha256(json.dumps(caps, separators=(',', ':')).encode()).hexdigest()
        groups.setdefault(digest, []).append(battery_id)
    return groups


def make_split(frame, source_hash, seed=42, stratify_rul=False):
    groups = trajectory_groups(frame)
    keys = sorted(groups)
    if len(keys) < 4:
        raise ValueError('At least four distinct battery trajectories are required for train/validation/test')
    np.random.default_rng(seed).shuffle(keys)
    count = max(1, round(len(keys) * .2))
    assigned = {'test': keys[:count], 'validation': keys[count:2 * count], 'train': keys[2 * count:]}
    if stratify_rul:
        observed = set()
        for battery, group in frame.groupby('battery_id'):
            eol = first_eol(group.sort_values('cycle')['Capacity'].tolist())
            if eol is not None and eol > MIN_CYCLES:
                observed.add(battery)
        event_keys = [key for key in keys if set(groups[key]) & observed]
        other_keys = [key for key in keys if key not in event_keys]
        if len(event_keys) < 3:
            raise ValueError('At least three independent batteries with observed eligible RUL labels are required')
        event_count = max(1, round(len(event_keys) * .2))
        other_count = count - event_count
        if other_count < 0 or 2 * event_count >= len(event_keys) or 2 * other_count > len(other_keys):
            raise ValueError('Cannot populate frozen stratified partitions')
        assigned = {'test': event_keys[:event_count] + other_keys[:other_count],
                    'validation': event_keys[event_count:2 * event_count] + other_keys[other_count:2 * other_count],
                    'train': event_keys[2 * event_count:] + other_keys[2 * other_count:]}
    return {'version': 1, 'seed': seed, 'source_sha256': source_hash,
            'stratification': 'observed eligible RUL versus censored; assigned before fitting' if stratify_rul else None,
            'partitions': {name: sorted(b for key in subset for b in groups[key]) for name, subset in assigned.items()},
            'duplicate_trajectory_groups': [ids for ids in groups.values() if len(ids) > 1]}


def validate_split(frame, manifest, source_hash):
    if manifest.get('source_sha256') != source_hash:
        raise ValueError('Split manifest belongs to a different dataset')
    partitions = manifest.get('partitions', {})
    if set(partitions) != {'train', 'validation', 'test'} or not all(partitions.values()):
        raise ValueError('Three nonempty train/validation/test battery partitions are required')
    all_ids = [b for ids in partitions.values() for b in ids]
    if len(all_ids) != len(set(all_ids)) or set(all_ids) != set(frame['battery_id']):
        raise ValueError('Partitions must cover all batteries with zero identity overlap')
    for ids in trajectory_groups(frame).values():
        if sum(bool(set(ids) & set(p)) for p in partitions.values()) != 1:
            raise ValueError('Duplicate battery trajectories cross partitions')
    return partitions
