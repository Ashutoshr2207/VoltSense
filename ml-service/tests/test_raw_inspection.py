import numpy as np
from scipy.io import savemat
from inspect_raw import inspect_directory


def test_mat_inspection_preserves_missing_discharge_ordinals(tmp_path):
    ops = []
    for i in range(8):
        ops.append({'type': 'discharge', 'time': [2008, 1, i + 1, 0, 0, 0],
                    'ambient_temperature': 24,
                    'data': {'Capacity': np.array([]) if i == 2 else 2 - i * .02,
                             'Voltage_measured': [4, 3], 'Current_measured': [-2, -2], 'Time': [0, 1]}})
    path = tmp_path / 'B0005.mat'
    savemat(path, {'B0005': {'cycle': np.array(ops, dtype=object)}})
    before = path.read_bytes()
    result = inspect_directory(tmp_path)
    battery = result['batteries'][0]
    assert battery['discharges'] == 8
    assert battery['invalid_capacities'][0]['discharge_ordinal'] == 3
    assert battery['first_80_crossing_candidate'] is None
    assert battery['complete_discharge_semantics_verified'] is False
    assert path.read_bytes() == before
