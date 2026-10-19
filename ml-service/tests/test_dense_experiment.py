"""Fail closed on master-label drift and protocol/partition contamination."""
import copy

import pandas as pd
import pytest

from dense_experiment import check_labels, protocol_strata, RESERVED, main
from features import first_eol, soh


def fixture(caps):
    expected, master = [], []
    eol = first_eol(caps)
    for cycle, capacity in enumerate(caps, 1):
        expected.append({'battery_id': 'B0006', 'cycle': cycle, 'test_id': cycle * 2,
                         'Capacity': capacity, 'source_sha256': 'raw-hash',
                         'protocol_group': 'G1', 'discharge_cutoff_V': 2.5})
        master.append({'native_battery_id': 'B0006', 'source_cycle_index': str(cycle),
                       'battery_uid': 'nasa_aging_arc/B0006', 'dataset_id': 'nasa_aging_arc',
                       'measurement_stream': 'audited_discharge', 'dense_history_valid': 'true',
                       'source_cycle_unit': 'completed_discharge_cycles', 'quality_flags': '',
                       'reference_status': 'existing_nasa_quality_manifest', 'existing_partition': 'train',
                       'discharge_capacity_Ah': str(capacity), 'reference_capacity_Ah': str(caps[0]),
                       'soh_percent': str(soh(capacity, caps[0])), 'eol_threshold_percent': '80.0',
                       'source_record_index': str(cycle * 2), 'source_member_sha256': 'raw-hash',
                       'protocol': 'G1', 'discharge_cutoff_V': '2.5',
                       'current_contract_eligible': str(cycle >= 7).lower(),
                       'rul_cycles': str(max(0, eol - cycle)) if eol else '',
                       'first_observed_eol_source_cycle': str(eol) if eol else '',
                       'is_censored': str(eol is None).lower()})
    return master, pd.DataFrame(expected), {'train': ['B0006'], 'validation': [], 'test': []}


@pytest.mark.parametrize('caps,eol', [([2, 1.95, 1.9, 1.85, 1.8, 1.7, 1.6, 1.65], 7),
                                    ([2, 1.99, 1.98, 1.97, 1.96, 1.95, 1.94], None)])
def test_observed_and_censored_labels_recomputed(caps, eol):
    rows, expected, partitions = fixture(caps)
    result = check_labels(rows, expected, partitions)
    assert result[0]['first_eol_cycle'] == eol
    assert result[0]['censored'] == (eol is None)


@pytest.mark.parametrize('field,value', [('soh_percent', '99'), ('rul_cycles', '9'),
    ('discharge_capacity_Ah', 'nan'), ('reference_capacity_Ah', '1.9'),
    ('existing_partition', 'test'), ('source_cycle_unit', 'reference_checks'),
    ('quality_flags', 'partial_discharge'), ('protocol', 'G3'),
    ('source_member_sha256', 'different-raw'), ('battery_uid', RESERVED[0])])
def test_invalid_or_incompatible_labels_rejected(field, value):
    rows, expected, partitions = fixture([2, 1.95, 1.9, 1.85, 1.8, 1.7, 1.6, 1.65])
    rows[0][field] = value
    with pytest.raises(ValueError):
        check_labels(rows, expected, partitions)


def test_missing_duplicate_and_fabricated_censored_labels_rejected():
    rows, expected, partitions = fixture([2, 1.99, 1.98, 1.97, 1.96, 1.95, 1.94])
    for invalid in [rows[:-1], rows + [copy.deepcopy(rows[0])]]:
        with pytest.raises(ValueError):
            check_labels(invalid, expected, partitions)
    rows[0]['rul_cycles'] = '0'
    with pytest.raises(ValueError, match='Censored'):
        check_labels(rows, expected, partitions)


def test_protocol_separation_preserves_roles_without_inventing_validation():
    rows = pd.DataFrame([
        {'battery_id': b, 'protocol_group': g, 'ambient_temperature_C': temp, 'discharge_cutoff_V': cutoff}
        for b, g, temp, cutoff in [('B0006', 'G1', 24, 2.5), ('B0018', 'G1', 24, 2.5),
                                  ('B0007', 'G1', 24, 2.2), ('B0047', 'G7', 4, 2.5)]])
    parts = {'train': ['B0006', 'B0047'], 'validation': ['B0007'], 'test': ['B0018']}
    strata = protocol_strata(rows, parts)
    matched = next(s for s in strata if s['battery_ids'] == ['B0006', 'B0018'])
    assert matched['partitions'] == {'train': ['B0006'], 'validation': [], 'test': ['B0018']}
    assert len(strata) == 3
    assert len(RESERVED) == len(set(RESERVED)) == 13


def test_output_outside_new_runs_child_rejected_before_training(tmp_path):
    with pytest.raises(ValueError, match='new direct child'):
        main(['--output', str(tmp_path)])
