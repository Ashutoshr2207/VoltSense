"""
VoltSense — Realistic Synthetic Battery Dataset Generator

Generates four distinct synthetic lithium-ion battery cycling datasets:
- demo1_battery_cycles.csv: Baseline healthy commuter cell (45 cycles, ~97.3% SOH, cool/stable)
- demo2_battery_cycles.csv: Fleet commercial vehicle (80 cycles, ~89.5% SOH, thermal stress, summer heatwave anomaly)
- demo3_battery_cycles.csv: High C-rate fast-charge stress (120 cycles, ~81.2% SOH, accelerated knee-point degradation)
- demo4_battery_cycles.csv: Extended lifecycle & EOL crossing (160 cycles, ~74.5% SOH, electrochemical capacity regeneration)

All datasets conform to the canonical 13-column schema:
battery_id,timestamp,date,time,Cycle,type,Capacity,mean_voltage,mean_current,mean_temperature,discharge_duration,charge_duration,soc

NOTE: These datasets are explicitly synthetic for demonstration and testing purposes.
They are not measured vehicle telemetry or laboratory measurements.
"""

import argparse
import csv
import math
import random
from datetime import datetime, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_SEED = 20261020

CANONICAL_HEADERS = [
    "battery_id",
    "timestamp",
    "date",
    "time",
    "Cycle",
    "type",
    "Capacity",
    "mean_voltage",
    "mean_current",
    "mean_temperature",
    "discharge_duration",
    "charge_duration",
    "soc",
]

BATTERY_ID = "SYNTHETIC_DEMO_CELL_001"


def generate_dates(start_date: datetime, num_cycles: int, rest_intervals: dict, rng: random.Random) -> list[str]:
    """Generate ascending calendar dates with realistic weekend / resting pauses."""
    dates = []
    current_dt = start_date
    for cyc in range(1, num_cycles + 1):
        if cyc in rest_intervals:
            current_dt += timedelta(days=rest_intervals[cyc])
        elif cyc > 1:
            # 85% of cycles are 1 day apart, 15% are 2 days apart (weekend rest)
            current_dt += timedelta(days=2 if rng.random() < 0.15 else 1)
        dates.append(current_dt.strftime("%Y-%m-%d"))
    return dates


def simulate_battery_cycles(
    profile_name: str,
    num_cycles: int,
    initial_cap: float,
    start_date: datetime,
    rest_intervals: dict,
    recovery_events: dict,  # {cycle: recovery_ah}
    anomaly_events: dict,   # {cycle: {field: override_val}}
    current_params: dict,   # discharge_mean, discharge_std, charge_mean, charge_std
    voltage_params: dict,   # dis_v0, dis_v_age, chg_v0
    temp_params: dict,      # amb_mean, amb_season_amp, joule_factor
    deg_rate_fn,            # lambda cycle, cap: base_decrement
    rng: random.Random,
) -> list[dict]:
    """Simulates realistic electro-thermal degradation trajectory for a battery cell."""
    dates = generate_dates(start_date, num_cycles, rest_intervals, rng)
    
    capacities = []
    current_cap = initial_cap
    ar_noise = 0.0  # AR(1) capacity measurement noise
    
    # Pre-simulate capacity trajectory
    for cyc in range(1, num_cycles + 1):
        if cyc == 1:
            capacities.append(initial_cap)
            continue
        
        # Base degradation increment
        base_fade = deg_rate_fn(cyc, current_cap)
        
        # Capacity recovery after rest period (lithium redistribution)
        recovery = recovery_events.get(cyc, 0.0)
        
        # AR(1) measurement jitter (standard deviation ~0.0008 Ah)
        ar_noise = 0.45 * ar_noise + rng.gauss(0.0, 0.0007)
        
        # New capacity
        current_cap = current_cap - base_fade + recovery + ar_noise
        # Physical boundary: cannot exceed initial capacity
        current_cap = min(initial_cap, max(1.10, current_cap))
        capacities.append(round(current_cap, 4))
    
    rows = []
    for idx in range(num_cycles):
        cyc = idx + 1
        date_str = dates[idx]
        cap = capacities[idx]
        soh_pct = min(100.0, (cap / initial_cap) * 100.0)
        fade_ratio = 1.0 - (soh_pct / 100.0)
        
        # Seasonal/ambient temperature drift
        seasonal_phase = (idx / max(1, num_cycles - 1)) * 2 * math.pi
        ambient_t = (
            temp_params["amb_mean"]
            + temp_params["amb_season_amp"] * math.sin(seasonal_phase)
            + rng.gauss(0.0, 0.45)
        )
        
        # Check if cycle has specific anomaly overrides
        cycle_anomalies = anomaly_events.get(cyc, {})
        
        # ---------------------------------------------------------
        # 1. Charge row (typically at 03:00:00 UTC)
        # ---------------------------------------------------------
        chg_current = round(
            rng.gauss(current_params["charge_mean"], current_params["charge_std"]), 3
        )
        chg_current = max(0.95, min(1.80, chg_current))
        
        # Average charge voltage rises slightly with internal resistance
        chg_v = round(
            voltage_params["chg_v0"]
            + 0.045 * fade_ratio
            + rng.gauss(0.0, 0.003),
            3,
        )
        chg_v = min(4.24, max(4.08, chg_v))
        
        # Charge temperature: mild heating
        chg_temp = round(
            ambient_t + 1.25 * (chg_current / 1.2) + rng.gauss(0.0, 0.3), 2
        )
        
        # Charge duration: CC phase + lengthening CV taper as IR rises
        base_chg_dur = (
            57.0
            + 12.0 * fade_ratio
            + rng.gauss(0.0, 0.6)
        )
        chg_dur = round(max(38.0, base_chg_dur), 1)
        
        # End of charge SOC: 95.0% - 98.8%
        chg_soc = round(rng.gauss(96.5, 0.6), 1)
        chg_soc = min(99.4, max(94.5, chg_soc))
        
        charge_row = {
            "battery_id": BATTERY_ID,
            "timestamp": f"{date_str}T03:00:00Z",
            "date": date_str,
            "time": "03:00:00",
            "Cycle": cyc,
            "type": "charge",
            "Capacity": "0.0000",
            "mean_voltage": f"{chg_v:.3f}",
            "mean_current": f"{chg_current:.3f}",
            "mean_temperature": f"{chg_temp:.2f}",
            "discharge_duration": "0.0",
            "charge_duration": f"{chg_dur:.1f}",
            "soc": f"{chg_soc:.1f}",
        }
        
        # ---------------------------------------------------------
        # 2. Discharge row (typically at 08:00:00 UTC)
        # ---------------------------------------------------------
        # Discharge current varies by daily driving style
        dis_current = round(
            rng.gauss(current_params["discharge_mean"], current_params["discharge_std"]), 3
        )
        # Apply anomaly if defined
        if "discharge_current" in cycle_anomalies:
            dis_current = cycle_anomalies["discharge_current"]
        dis_current = min(-1.10, max(-2.40, dis_current))
        
        # Discharge duration physically tied to Capacity / Current: t = (Q / |I|) * 60
        ideal_dis_dur = (cap / abs(dis_current)) * 60.0
        dis_dur = round(ideal_dis_dur * (1.0 + rng.gauss(0.0, 0.0035)), 1)
        
        # Mean discharge voltage reflects OCV plateau minus IR drop (V = V0 - k_IR * fade - R0 * |I|)
        ir_drop_load = 0.035 * (abs(dis_current) - 1.5)
        ir_drop_age = voltage_params["dis_v_age"] * fade_ratio
        dis_v = round(
            voltage_params["dis_v0"]
            - ir_drop_age
            - ir_drop_load
            + rng.gauss(0.0, 0.004),
            3,
        )
        if "mean_voltage" in cycle_anomalies:
            dis_v = cycle_anomalies["mean_voltage"]
        dis_v = max(3.420, min(3.760, dis_v))
        
        # Mean discharge temperature: Joule heating (I^2 * R) + degradation heating + ambient
        joule_heat = temp_params["joule_factor"] * ((abs(dis_current) / 1.5) ** 2) * (1.0 + 1.2 * fade_ratio)
        dis_temp = round(ambient_t + joule_heat + rng.gauss(0.0, 0.4), 2)
        if "mean_temperature" in cycle_anomalies:
            dis_temp = cycle_anomalies["mean_temperature"]
        
        # Discharge end SOC (depth of discharge): typically 12% - 18%
        dis_soc = round(rng.gauss(15.2, 1.1), 1)
        dis_soc = min(22.0, max(9.5, dis_soc))
        
        discharge_row = {
            "battery_id": BATTERY_ID,
            "timestamp": f"{date_str}T08:00:00Z",
            "date": date_str,
            "time": "08:00:00",
            "Cycle": cyc,
            "type": "discharge",
            "Capacity": f"{cap:.4f}",
            "mean_voltage": f"{dis_v:.3f}",
            "mean_current": f"{dis_current:.3f}",
            "mean_temperature": f"{dis_temp:.2f}",
            "discharge_duration": f"{dis_dur:.1f}",
            "charge_duration": "0.0",
            "soc": f"{dis_soc:.1f}",
        }
        
        rows.append(charge_row)
        rows.append(discharge_row)
        
    return rows


# =====================================================================
# Profile Definitions
# =====================================================================

def build_demo1(rng: random.Random) -> list[dict]:
    """Demo 1: Pristine Healthy Commuter Cell (45 cycles, ~97.3% SOH)."""
    return simulate_battery_cycles(
        profile_name="Demo 1 - Healthy Baseline",
        num_cycles=45,
        initial_cap=2.0650,
        start_date=datetime(2025, 1, 6),
        rest_intervals={22: 3},  # Weekend rest at cycle 22
        recovery_events={23: 0.0055},  # Mild capacity recovery after 3-day rest
        anomaly_events={},  # Zero anomalies
        current_params={
            "discharge_mean": -1.480,
            "discharge_std": 0.045,
            "charge_mean": 1.200,
            "charge_std": 0.025,
        },
        voltage_params={
            "dis_v0": 3.712,
            "dis_v_age": 0.14,
            "chg_v0": 4.146,
        },
        temp_params={
            "amb_mean": 23.2,
            "amb_season_amp": 1.5,
            "joule_factor": 2.4,
        },
        deg_rate_fn=lambda cyc, cap: 0.00122 + (0.00018 if cyc <= 5 else 0.0),
        rng=rng,
    )


def build_demo2(rng: random.Random) -> list[dict]:
    """Demo 2: Fleet Commercial Vehicle (80 cycles, ~89.5% SOH, thermal stress)."""
    return simulate_battery_cycles(
        profile_name="Demo 2 - Fleet Thermal Stress",
        num_cycles=80,
        initial_cap=2.0300,
        start_date=datetime(2025, 3, 3),
        rest_intervals={35: 3, 62: 2},
        recovery_events={36: 0.0068, 63: 0.0050},
        anomaly_events={
            # Cycle 54: High ambient heatwave + heavy discharge excursion -> 45.4°C anomaly
            54: {"discharge_current": -1.920, "mean_temperature": 45.40}
        },
        current_params={
            "discharge_mean": -1.710,
            "discharge_std": 0.065,
            "charge_mean": 1.230,
            "charge_std": 0.035,
        },
        voltage_params={
            "dis_v0": 3.688,
            "dis_v_age": 0.22,
            "chg_v0": 4.152,
        },
        temp_params={
            "amb_mean": 28.5,
            "amb_season_amp": 4.0,
            "joule_factor": 4.2,
        },
        deg_rate_fn=lambda cyc, cap: 0.00245 + 0.000012 * cyc,
        rng=rng,
    )


def build_demo3(rng: random.Random) -> list[dict]:
    """Demo 3: High C-Rate Fast-Charge & Knee-Point Acceleration (120 cycles, ~81.2% SOH)."""
    def knee_fade(cyc, cap):
        if cyc <= 65:
            return 0.00210 + 0.000008 * cyc
        # Accelerated knee degradation beyond cycle 65
        return 0.00260 + 0.000065 * (cyc - 65)

    return simulate_battery_cycles(
        profile_name="Demo 3 - Knee Acceleration",
        num_cycles=120,
        initial_cap=2.0150,
        start_date=datetime(2025, 5, 12),
        rest_intervals={40: 3, 85: 4},
        recovery_events={41: 0.0075, 86: 0.0082},
        anomaly_events={
            # Cycle 92: Peak draw transient load causing voltage sag and thermal warning
            92: {"discharge_current": -2.180, "mean_voltage": 3.485, "mean_temperature": 45.25}
        },
        current_params={
            "discharge_mean": -1.840,
            "discharge_std": 0.095,
            "charge_mean": 1.420,  # Fast charge
            "charge_std": 0.055,
        },
        voltage_params={
            "dis_v0": 3.678,
            "dis_v_age": 0.32,
            "chg_v0": 4.158,
        },
        temp_params={
            "amb_mean": 26.5,
            "amb_season_amp": 3.2,
            "joule_factor": 5.4,
        },
        deg_rate_fn=knee_fade,
        rng=rng,
    )


def build_demo4(rng: random.Random) -> list[dict]:
    """Demo 4: Full Life Cycle Crossing 80% EOL with Regeneration (160 cycles, ~74.5% SOH)."""
    def deep_fade(cyc, cap):
        if cyc <= 75:
            return 0.00210 + 0.000008 * cyc
        # Sustained late-life degradation with elevated internal resistance
        return 0.00270 + 0.000030 * (cyc - 75)

    return simulate_battery_cycles(
        profile_name="Demo 4 - EOL Crossing",
        num_cycles=160,
        initial_cap=1.9950,
        start_date=datetime(2025, 1, 13),
        rest_intervals={
            50: 5,   # 5-day vehicle park
            108: 7,  # 7-day extended holiday rest
        },
        recovery_events={
            51: 0.0125,   # Observable electrochemical capacity recovery (+12.5 mAh)
            109: 0.0110,  # Recovery bump after 7-day rest (+11.0 mAh)
        },
        anomaly_events={
            # Cycle 138: Aged cell impedance heat spike -> 45.8°C anomaly
            138: {"mean_temperature": 45.80},
            # Cycle 148: Voltage depression under heavy discharge
            148: {"discharge_current": -1.880, "mean_voltage": 3.475},
        },
        current_params={
            "discharge_mean": -1.620,
            "discharge_std": 0.075,
            "charge_mean": 1.180,
            "charge_std": 0.035,
        },
        voltage_params={
            "dis_v0": 3.665,
            "dis_v_age": 0.38,
            "chg_v0": 4.162,
        },
        temp_params={
            "amb_mean": 24.8,
            "amb_season_amp": 3.8,
            "joule_factor": 4.8,
        },
        deg_rate_fn=deep_fade,
        rng=rng,
    )


def save_dataset_csv(filename: str, rows: list[dict], output_dir: Path):
    """Write rows to CSV file preserving canonical column names and order."""
    out_path = output_dir / filename
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CANONICAL_HEADERS)
        writer.writeheader()
        writer.writerows(rows)
    
    # Calculate summary metrics for logging
    discharges = [r for r in rows if r["type"] == "discharge"]
    q_initial = float(discharges[0]["Capacity"])
    q_final = float(discharges[-1]["Capacity"])
    soh_final = (q_final / q_initial) * 100.0
    v_mean = sum(float(r["mean_voltage"]) for r in discharges) / len(discharges)
    i_mean = sum(float(r["mean_current"]) for r in discharges) / len(discharges)
    t_mean = sum(float(r["mean_temperature"]) for r in discharges) / len(discharges)
    
    print(
        f"[OK] Saved {filename}: {len(rows)} rows ({len(discharges)} cycles) | "
        f"Dates: {rows[0]['date']} to {rows[-1]['date']} | "
        f"Capacity: {q_initial:.4f} Ah -> {q_final:.4f} Ah ({soh_final:.1f}% SOH) | "
        f"Mean Disch: {v_mean:.3f}V, {i_mean:.3f}A, {t_mean:.1f}C"
    )


def generate_all_datasets(seed: int = DEFAULT_SEED, output_dir: Path = BASE_DIR):
    """Generate all 4 demo datasets with reproducible seed."""
    print(f"Generating VoltSense synthetic demo datasets with seed={seed} in {output_dir}")
    
    # Use distinct seed streams derived deterministically from the master seed
    master_rng = random.Random(seed)
    seed_d1 = master_rng.randint(100000, 999999)
    seed_d2 = master_rng.randint(100000, 999999)
    seed_d3 = master_rng.randint(100000, 999999)
    seed_d4 = master_rng.randint(100000, 999999)
    
    d1_rows = build_demo1(random.Random(seed_d1))
    d2_rows = build_demo2(random.Random(seed_d2))
    d3_rows = build_demo3(random.Random(seed_d3))
    d4_rows = build_demo4(random.Random(seed_d4))
    
    save_dataset_csv("demo1_battery_cycles.csv", d1_rows, output_dir)
    save_dataset_csv("demo2_battery_cycles.csv", d2_rows, output_dir)
    save_dataset_csv("demo3_battery_cycles.csv", d3_rows, output_dir)
    save_dataset_csv("demo4_battery_cycles.csv", d4_rows, output_dir)
    print("All four synthetic datasets successfully generated!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthetic battery datasets for VoltSense.")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="Random seed for reproducibility.")
    parser.add_argument("--output-dir", type=str, default=str(BASE_DIR), help="Output directory path.")
    args = parser.parse_args()
    
    generate_all_datasets(seed=args.seed, output_dir=Path(args.output_dir))
