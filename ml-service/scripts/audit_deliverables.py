import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path.cwd()))
from dataset import load_dataset, feature_records, validate_split
path = Path('../data/validated/nasa-20261016')
frame, provenance = load_dataset(path / 'validated_cycles.csv')
quality = json.loads((path / 'battery-quality-manifest.json').read_text())
split = json.loads((path / 'split-manifest.json').read_text())
validate_split(frame, split, provenance['source_sha256'])
audit = {(b['battery_id'], r['source_operation_id']): r for b in quality['batteries'] for r in b['records']}
for row in frame.itertuples():
    record = audit[row.battery_id, row.test_id]
    assert row.Capacity == record['capacity_Ah']
    assert row.cycle == record['discharge_ordinal']
    assert row.source_record_id == row.battery_id + ':operation:' + str(row.test_id)
    assert record['exported_for_training']
assert not frame.duplicated(['battery_id', 'cycle']).any()
assert not frame.source_record_id.duplicated().any()
records = feature_records(frame)
print(json.dumps({'raw_capacity_exact_roundtrips': len(frame), 'battery_count': int(frame.battery_id.nunique()),
                  'capacity_examples': len(records), 'observed_rul_examples': int(records.target_rul.notna().sum()),
                  'partitions': {k: {'batteries': len(v), 'capacity_rows': int(records.battery_id.isin(v).sum()),
                                    'rul_rows': int((records.battery_id.isin(v) & records.target_rul.notna()).sum())} for k,v in split['partitions'].items()},
                  'dataset_sha256': provenance['source_sha256']}, indent=2))
