"""Versioned, causal capacity-history features shared by training and inference."""
import math
from numbers import Real

FEATURES = [
    'cycle_idx', 'log_cycle', 'cycle_squared', 'cycle_sqrt', 'cap_lag1',
    'cap_lag2', 'cap_lag5', 'cap_roll3', 'cap_roll5', 'deg_rate',
    'deg_rate5', 'initial_cap', 'cap_drop_pct',
]
MIN_CYCLES = 7
EOL_THRESHOLD = 80.0
FEATURE_CONTRACT = {
    'version': 'capacity-history-v2', 'features': FEATURES,
    'capacity_unit': 'Ah', 'cycle_unit': 'completed_discharge_cycles',
    'cutoff': 'latest_completed_cycle_t_features_before_t',
    'reference': 'first_completed_discharge', 'soh': 'min(100,100*capacity/reference)',
    'eol_threshold': EOL_THRESHOLD,
    'formulas': {
        'cycle_idx': 't', 'log_cycle': 'log1p(t)', 'cycle_squared': 't*t', 'cycle_sqrt': 'sqrt(t)',
        'cap_lag1': 'Q[t-1]', 'cap_lag2': 'Q[t-2]', 'cap_lag5': 'Q[t-5]',
        'cap_roll3': 'mean(Q[t-3:t])', 'cap_roll5': 'mean(Q[t-5:t])',
        'deg_rate': '(Q[1]-Q[t-1])/(t-2)', 'deg_rate5': '(Q[t-5]-Q[t-1])/4',
        'initial_cap': 'Q[1]', 'cap_drop_pct': '100*(Q[1]-Q[t-1])/Q[1]',
    },
}


def finite_number(value):
    return isinstance(value, Real) and not isinstance(value, bool) and math.isfinite(value)


def validate_history(table, minimum=MIN_CYCLES):
    if not isinstance(table, list) or len(table) < minimum:
        raise ValueError(f'At least {minimum} complete discharge cycles are required')
    ids = set()
    for i, row in enumerate(table, 1):
        if not isinstance(row, dict):
            raise ValueError('Every cycle must be an object')
        cycle = row.get('cycle')
        if not finite_number(cycle) or cycle != i:
            raise ValueError('History must be ordered, unique, consecutive discharge cycles beginning at 1')
        if not finite_number(row.get('capacity')) or row['capacity'] <= 0:
            raise ValueError(f'Cycle {i} requires positive finite capacity in Ah')
        if row.get('batteryId') is not None:
            ids.add(row['batteryId'])
    if len(ids) > 1:
        raise ValueError('A prediction must contain only one battery')
    return [float(row['capacity']) for row in table]


def build_row(caps):
    """Q[t] is required for observation but never used as a feature for t."""
    if len(caps) < MIN_CYCLES or any(not finite_number(c) or c <= 0 for c in caps):
        raise ValueError('Features require seven positive finite capacities in Ah')
    t = len(caps)
    prev = caps[:-1]
    initial = caps[0]
    lag1, lag2, lag5 = prev[-1], prev[-2], prev[-5]
    return [t, math.log1p(t), t * t, math.sqrt(t), lag1, lag2, lag5,
            sum(prev[-3:]) / 3, sum(prev[-5:]) / 5,
            (initial - lag1) / (t - 2), (lag5 - lag1) / 4,
            initial, 100 * (initial - lag1) / initial]


def soh(capacity, reference):
    return min(100.0, 100.0 * capacity / reference)


def first_eol(caps):
    return next((i for i, c in enumerate(caps, 1) if soh(c, caps[0]) <= EOL_THRESHOLD), None)
