"""Builds the 14 model features from a battery's per-cycle capacity history.

Rows are built the way the models were trained: the row for cycle t only uses
capacities from cycles BEFORE t (lags), so the capacity for t is genuinely predicted.
"""
import math

FEATURES = ["cycle_idx", "log_cycle", "cycle_squared", "cycle_sqrt", "cap_lag1", "cap_lag2", "cap_lag5",
            "cap_roll3", "cap_roll5", "deg_rate", "deg_rate5", "initial_cap", "cap_drop_pct", "ambient_temperature"]
MIN_CYCLES = 7  # need lag5 plus the cycle being predicted


def build_row(caps, ambient_temperature):
    """caps: capacities (Ah) in cycle order; the LAST item is the cycle being scored."""
    t = len(caps)
    prev = caps[:-1]
    initial = max(caps)  # training used the maximum valid observed capacity per battery
    lag1, lag2, lag5 = prev[-1], prev[-2], prev[-5]
    row = {"cycle_idx": t, "log_cycle": math.log1p(t), "cycle_squared": t * t, "cycle_sqrt": math.sqrt(t),
           "cap_lag1": lag1, "cap_lag2": lag2, "cap_lag5": lag5,
           "cap_roll3": sum(prev[-3:]) / 3, "cap_roll5": sum(prev[-5:]) / 5,
           "deg_rate": (initial - lag1) / max(1, t - 1), "deg_rate5": (lag5 - lag1) / 4,
           "initial_cap": initial, "cap_drop_pct": (initial - lag1) / initial * 100,
           "ambient_temperature": ambient_temperature}
    return [row[f] for f in FEATURES]
