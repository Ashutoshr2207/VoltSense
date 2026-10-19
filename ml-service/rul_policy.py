"""Observed terminal-state policy, separate from the regressor feature contract."""
import numpy as np
from features import MIN_CYCLES, finite_number, first_eol

RUL_POLICY = {
    'version': 'observed-eol-terminal-v1',
    'threshold_percent': 80.0,
    'reference': 'first_completed_discharge',
    'observed_eol': 'first crossing in validated supplied history through current cycle',
    'at_or_after_observed_eol': 'zero_without_calling_rul_regressor',
    'pre_eol': 'nonnegative_finite_regressor_output_rounded_to_cycles',
    'fit_population': 'observed_crossing_batteries_strictly_before_crossing',
    'censored_labels': 'unobserved_not_imputed',
    'features': 'unchanged_capacity_history_v2_strictly_before_target_cycle',
}


def observed_eol(caps):
    """Callers must preserve original consecutive cycle ordering before passing values."""
    if len(caps) < MIN_CYCLES or any(not finite_number(c) or c <= 0 for c in caps):
        raise ValueError('EOL policy requires seven positive finite observed capacities')
    return first_eol(caps)


def predict_rul(pipeline, frame, histories):
    """Use observed history only for the terminal guard; never feed it to the estimator."""
    if len(frame) != len(histories):
        raise ValueError('One observed history is required for each feature row')
    pending = [i for i, caps in enumerate(histories) if observed_eol(caps) is None]
    result = np.zeros(len(frame), dtype=np.int64)
    if pending:
        raw = np.asarray(pipeline.predict(frame.iloc[pending]), dtype=float).reshape(-1)
        if len(raw) != len(pending) or not np.isfinite(raw).all() or (raw < 0).any() or (raw > 2 ** 53 - 1).any():
            raise ValueError('RUL outputs must be finite nonnegative safely representable cycles')
        result[pending] = np.rint(raw).astype(np.int64)
    return result
