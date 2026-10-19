"""Read-only structural/quality inspection of raw NASA MAT files; never trains."""
import argparse
from collections import Counter
import hashlib
import io
import json
from pathlib import Path
import numpy as np
from scipy.io import loadmat
from features import first_eol


def inspect_directory(directory):
    directory = Path(directory)
    paths = sorted(directory.glob('B*.mat'))
    if not paths:
        raise ValueError('No B*.mat files in the explicitly supplied directory')
    batteries = []
    fingerprint = hashlib.sha256()
    for path in paths:
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        fingerprint.update((path.name + ':' + digest + '\n').encode())
        content = loadmat(io.BytesIO(raw), simplify_cells=True)
        if path.stem not in content:
            raise ValueError(f'{path.name} lacks matching top-level battery key')
        operations = content[path.stem].get('cycle')
        if isinstance(operations, dict): operations = [operations]
        if operations is None: raise ValueError(f'{path.name} lacks cycle operations')
        capacities, invalid, fields = [], [], {}
        counts = Counter()
        previous = None
        reversed_times = 0
        for ordinal, op in enumerate(operations, 1):
            kind = str(op.get('type', 'unknown'))
            counts[kind] += 1
            data = op.get('data', {})
            fields.setdefault(kind, set()).update(data)
            time = np.asarray(op.get('time', [])).reshape(-1)
            if time.size == 6 and np.isfinite(time).all():
                stamp = tuple(time.tolist())
                if previous is not None and stamp < previous: reversed_times += 1
                previous = stamp
            if kind == 'discharge':
                values = np.asarray(data.get('Capacity', [])).reshape(-1)
                value = float(values[0]) if values.size == 1 else None
                if value is None or not np.isfinite(value) or value <= 0:
                    invalid.append({'discharge_ordinal': len(capacities) + 1, 'operation_ordinal': ordinal,
                                    'reason': 'missing/non-scalar/nonpositive/nonfinite capacity'})
                    value = None
                capacities.append(value)
        valid = [c for c in capacities if c is not None]
        complete = not invalid and len(capacities) >= 7
        batteries.append({'battery_id': path.stem, 'path': str(path.resolve()), 'sha256': digest,
                          'operations': dict(counts), 'available_data_fields': {k: sorted(v) for k, v in fields.items()},
                          'discharges': len(capacities), 'invalid_capacities': invalid,
                          'first_capacity_Ah': capacities[0] if capacities else None,
                          'max_capacity_Ah': max(valid) if valid else None,
                          'first_80_crossing_candidate': first_eol(capacities) if complete else None,
                          'out_of_order_operation_times': reversed_times,
                          'complete_discharge_semantics_verified': False})
    return {'source_directory': str(directory.resolve()), 'source_sha256': fingerprint.hexdigest(),
            'provenance_verified': False, 'batteries': batteries,
            'note': 'Structural inspection only. Missing cycles are not dropped or filled. Candidate crossings assume the first discharge is a valid completed reference; that assumption requires review.'}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', help='Explicit directory containing B*.mat files')
    args = parser.parse_args(argv)
    print(json.dumps(inspect_directory(args.directory), indent=2, allow_nan=False))


if __name__ == '__main__':
    main()
