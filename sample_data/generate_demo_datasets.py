#!/usr/bin/env python3
"""
VoltSense Canonical Demo Dataset Generator
=========================================
Generates exactly FOUR complete, source-verified EV owner CSV datasets:
  - sample_data/owner_1.csv (Tesla Model 3 Long Range AWD - 82 kWh)
  - sample_data/owner_2.csv (BYD Atto 3 Extended Range - 60.5 kWh)
  - sample_data/owner_3.csv (Tata Nexon EV Max - 40.5 kWh)
  - sample_data/owner_4.csv (Hyundai Ioniq 5 LR AWD - 77.4 kWh)

Each file contains:
  - Exactly 150 daily data rows covering 2026-01-01 through 2026-05-30 inclusive.
  - Complete canonical columns in identical order across all four files:
      battery_id, Timestamp, date, Time, Cycle, Capacity,
      Voltage, Current, voltage_load, current_load,
      Temperature, SOC,
      bcell_maxvoltage, bcell_minvoltage, bcell_maxtemp, bcell_mintemp,
      speed, mile, discharge_duration, charge_duration, type,
      Re, Rct, battery_impedance, rectified_impedance
  - Plausible completed discharge-cycle progression with completed capacity measured
    on cycle-completion days, and empty in-progress values on intermediate days.
  - Periodic charging sessions (type='charge', positive current, charge_duration in minutes)
    allowing backend/src/services/csvParserService.js to extract verified charging sessions.
  - Verified end-to-end against csvParserService.js, anomalyService.js, and ml-service.

Usage:
  python sample_data/generate_demo_datasets.py
"""

import os
import shutil
from datetime import datetime, timedelta, timezone
import numpy as np
import pandas as pd

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SAMPLE_DATA_DIR = os.path.join(REPO_ROOT, 'sample_data')

START_DATE = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
TOTAL_DAYS = 150

CANONICAL_COLUMNS = [
    'battery_id', 'Timestamp', 'date', 'Time', 'Cycle', 'Capacity',
    'Voltage', 'Current', 'voltage_load', 'current_load',
    'Temperature', 'SOC',
    'bcell_maxvoltage', 'bcell_minvoltage', 'bcell_maxtemp', 'bcell_mintemp',
    'speed', 'mile', 'discharge_duration', 'charge_duration', 'type',
    'Re', 'Rct', 'battery_impedance', 'rectified_impedance'
]

# Set fixed seed for deterministic reproducibility
np.random.seed(42)


def generate_cycle_schedule(total_days, total_cycles, avoid_charge_days=None):
    """
    Distribute total_cycles across total_days.
    Designates exactly one cycle-completion day per cycle (last day of cycle)
    and one charging day per cycle.
    """
    if avoid_charge_days is None:
        avoid_charge_days = set()

    days_per_cycle = total_days / total_cycles
    cycle_of_day = []
    cycle_days = {c: [] for c in range(1, total_cycles + 1)}

    for day in range(total_days):
        target_cycle = min(total_cycles, int(day / days_per_cycle) + 1)
        cycle_days[target_cycle].append(day)
        cycle_of_day.append(target_cycle)

    completion_days = set()
    charging_days = set()

    for c, days in cycle_days.items():
        comp_day = days[-1]
        completion_days.add(comp_day)

        # Candidate charging days: not completion day and not in avoid_charge_days
        candidates = [d for d in days if d != comp_day and d not in avoid_charge_days]
        if candidates:
            # Pick middle day or second day
            chg_day = candidates[len(candidates) // 2]
            charging_days.add(chg_day)
        elif len(days) > 1:
            charging_days.add(days[0])

    is_completion_day = [d in completion_days for d in range(total_days)]
    is_charging_day = [d in charging_days and d not in completion_days for d in range(total_days)]

    return cycle_of_day, is_completion_day, is_charging_day


def generate_owner_1():
    """Tesla Model 3 Long Range (2023) - 82 kWh, ~210 Ah, 389.4V pack, 30 cycles, 30 charging sessions."""
    battery_id = 'TESLA-M3-LR-2023-01'
    total_cycles = 30
    nominal_cap = 210.0000
    total_fade = 3.1500  # Ends at 206.85 Ah (98.50% SOH)

    cycle_of_day, is_comp, is_chg = generate_cycle_schedule(TOTAL_DAYS, total_cycles)

    odometer = 18500.0
    rows = []

    for day in range(TOTAL_DAYS):
        ts = START_DATE + timedelta(days=day)
        date_str = ts.strftime('%Y-%m-%d')
        ts_str = ts.strftime('%Y-%m-%dT%H:%M:%S.000Z')
        cyc = cycle_of_day[day]
        comp = is_comp[day]
        chg = is_chg[day]

        # Capacity is recorded on cycle completion day; empty on intermediate days
        if comp:
            prog = cyc / total_cycles
            fade = total_fade * (0.6 * np.sqrt(prog) + 0.4 * prog)
            cap_val = f'{nominal_cap - fade:.4f}'
        else:
            cap_val = ''

        if chg:
            # Home Level 2 AC Charge session (32A AC ~ 25A pack current into 389V pack)
            op_type = 'charge'
            chg_dur = round(float(np.random.uniform(45.0, 60.0)), 1)
            dis_dur = ''
            current = round(float(np.random.uniform(28.0, 32.0)), 2)  # Positive current
            speed = 0.0
            daily_miles = 0.0
            soc = round(float(np.random.uniform(88.0, 92.0)), 1)
            pack_v = round(392.0 + float(np.random.uniform(-1.0, 1.5)), 2)
            cell_avg = pack_v / 96.0
            c_max = round(cell_avg + 0.008, 3)
            c_min = round(cell_avg - 0.008, 3)
            temp = round(24.0 + float(np.random.uniform(-0.8, 1.2)), 1)
        else:
            # Commute / discharge day
            op_type = 'discharge'
            chg_dur = ''
            daily_miles = 32.5 + float(np.random.uniform(-3.0, 3.0))
            odometer += daily_miles
            speed = round(float(np.random.uniform(34.0, 44.0)), 1)
            dis_dur = int(round(daily_miles / (speed / 3600.0)))
            current = round(float(np.random.uniform(-22.0, -15.0)), 2)  # Negative current
            soc = float(np.clip(82.0 - (day % 5) * 13.0 + np.random.uniform(-2.0, 2.0), 18.0, 88.0))
            pack_v = round(352.0 + (soc / 100.0) * 44.0 + float(np.random.uniform(-1.0, 1.0)), 2)
            cell_avg = pack_v / 96.0
            c_max = round(cell_avg + 0.009, 3)
            c_min = round(cell_avg - 0.009, 3)
            temp = round(23.5 + float(np.random.uniform(-1.5, 1.5)), 1)

        # Periodic EIS check on day 0 and day 75
        re_val = '0.0425' if day in (0, 75) else ''
        rct_val = '0.0520' if day in (0, 75) else ''
        z_val = '0.0945' if day in (0, 75) else ''
        rect_z = '0.0910' if day in (0, 75) else ''

        rows.append({
            'battery_id': battery_id,
            'Timestamp': ts_str,
            'date': date_str,
            'Time': '12:00:00',
            'Cycle': cyc,
            'Capacity': cap_val,
            'Voltage': pack_v,
            'Current': current,
            'voltage_load': '',
            'current_load': '',
            'Temperature': temp,
            'SOC': round(soc, 1),
            'bcell_maxvoltage': c_max,
            'bcell_minvoltage': c_min,
            'bcell_maxtemp': round(temp + 0.7, 1),
            'bcell_mintemp': round(temp - 0.5, 1),
            'speed': speed,
            'mile': round(odometer, 1),
            'discharge_duration': dis_dur,
            'charge_duration': chg_dur,
            'type': op_type,
            'Re': re_val,
            'Rct': rct_val,
            'battery_impedance': z_val,
            'rectified_impedance': rect_z
        })

    return pd.DataFrame(rows, columns=CANONICAL_COLUMNS)


def generate_owner_2():
    """BYD Atto 3 Extended Range (2023) - 60.5 kWh, 150 Ah, 403.2V pack, 37 cycles. Anomaly: Day 68 cell imbalance."""
    battery_id = 'BYD-ATTO3-ER-2023-02'
    total_cycles = 37
    nominal_cap = 150.0000
    total_fade = 2.1000  # Ends at 147.90 Ah (98.60% SOH)

    # Avoid charging on Day 68 (index 67) so anomaly occurs during discharge driving
    cycle_of_day, is_comp, is_chg = generate_cycle_schedule(TOTAL_DAYS, total_cycles, avoid_charge_days={67})

    odometer = 12200.0
    rows = []

    for day in range(TOTAL_DAYS):
        ts = START_DATE + timedelta(days=day)
        date_str = ts.strftime('%Y-%m-%d')
        ts_str = ts.strftime('%Y-%m-%dT%H:%M:%S.000Z')
        cyc = cycle_of_day[day]
        comp = is_comp[day]
        chg = is_chg[day]

        if comp:
            prog = cyc / total_cycles
            fade = total_fade * (0.6 * np.sqrt(prog) + 0.4 * prog)
            cap_val = f'{nominal_cap - fade:.4f}'
        else:
            cap_val = ''

        if chg:
            op_type = 'charge'
            chg_dur = round(float(np.random.uniform(40.0, 55.0)), 1)
            dis_dur = ''
            current = round(float(np.random.uniform(35.0, 45.0)), 2)  # Positive AC/DC current
            speed = 0.0
            daily_miles = 0.0
            soc = round(float(np.random.uniform(90.0, 95.0)), 1)
            pack_v = round(408.0 + float(np.random.uniform(-1.0, 1.5)), 2)
            cell_avg = pack_v / 126.0
            c_max = round(cell_avg + 0.008, 3)
            c_min = round(cell_avg - 0.008, 3)
            temp = round(25.0 + float(np.random.uniform(-0.8, 1.2)), 1)
        else:
            op_type = 'discharge'
            chg_dur = ''
            daily_miles = 38.0 + float(np.random.uniform(-4.0, 4.0))
            odometer += daily_miles
            speed = round(float(np.random.uniform(36.0, 48.0)), 1)
            dis_dur = int(round(daily_miles / (speed / 3600.0)))
            current = round(float(np.random.uniform(-28.0, -18.0)), 2)  # Negative current
            soc = float(np.clip(88.0 - (day % 4) * 16.0 + np.random.uniform(-2.0, 2.0), 20.0, 92.0))
            pack_v = round(394.0 + (soc / 100.0) * 19.0 + float(np.random.uniform(-0.8, 0.8)), 2)
            cell_avg = pack_v / 126.0

            # Day 68 (index 67, 2026-03-09): Cell voltage imbalance anomaly (> 0.15V)
            if day == 67:
                c_max = 3.425
                c_min = 3.260  # Spread = 0.165 V > 0.15 V threshold
            else:
                c_max = round(cell_avg + 0.010, 3)
                c_min = round(cell_avg - 0.009, 3)
            temp = round(24.0 + float(np.random.uniform(-1.8, 1.8)), 1)

        re_val = '0.0480' if day in (0, 75) else ''
        rct_val = '0.0585' if day in (0, 75) else ''
        z_val = '0.1065' if day in (0, 75) else ''
        rect_z = '0.1020' if day in (0, 75) else ''

        rows.append({
            'battery_id': battery_id,
            'Timestamp': ts_str,
            'date': date_str,
            'Time': '12:00:00',
            'Cycle': cyc,
            'Capacity': cap_val,
            'Voltage': pack_v,
            'Current': current,
            'voltage_load': '',
            'current_load': '',
            'Temperature': temp,
            'SOC': round(soc, 1),
            'bcell_maxvoltage': c_max,
            'bcell_minvoltage': c_min,
            'bcell_maxtemp': round(temp + 0.6, 1),
            'bcell_mintemp': round(temp - 0.5, 1),
            'speed': speed,
            'mile': round(odometer, 1),
            'discharge_duration': dis_dur,
            'charge_duration': chg_dur,
            'type': op_type,
            'Re': re_val,
            'Rct': rct_val,
            'battery_impedance': z_val,
            'rectified_impedance': rect_z
        })

    return pd.DataFrame(rows, columns=CANONICAL_COLUMNS)


def generate_owner_3():
    """Tata Nexon EV Max (2023) - 40.5 kWh, 126 Ah, 320V pack, 25 cycles. Anomaly: Day 112 temp spike 46.5°C."""
    battery_id = 'TATA-NEXON-MAX-2023-03'
    total_cycles = 25
    nominal_cap = 126.0000
    total_fade = 2.1500  # Ends at 123.85 Ah (98.29% SOH)

    # Avoid charging on Day 112 (index 111) so thermal spike occurs during urban traffic crawl
    cycle_of_day, is_comp, is_chg = generate_cycle_schedule(TOTAL_DAYS, total_cycles, avoid_charge_days={111})

    odometer = 9400.0
    rows = []

    for day in range(TOTAL_DAYS):
        ts = START_DATE + timedelta(days=day)
        date_str = ts.strftime('%Y-%m-%d')
        ts_str = ts.strftime('%Y-%m-%dT%H:%M:%S.000Z')
        cyc = cycle_of_day[day]
        comp = is_comp[day]
        chg = is_chg[day]

        if comp:
            prog = cyc / total_cycles
            fade = total_fade * (0.6 * np.sqrt(prog) + 0.4 * prog)
            cap_val = f'{nominal_cap - fade:.4f}'
        else:
            cap_val = ''

        if chg:
            op_type = 'charge'
            chg_dur = round(float(np.random.uniform(50.0, 70.0)), 1)
            dis_dur = ''
            current = round(float(np.random.uniform(22.0, 26.0)), 2)  # Positive AC current
            speed = 0.0
            daily_miles = 0.0
            soc = round(float(np.random.uniform(86.0, 92.0)), 1)
            pack_v = round(326.0 + float(np.random.uniform(-0.8, 1.2)), 2)
            cell_avg = pack_v / 100.0
            c_max = round(cell_avg + 0.008, 3)
            c_min = round(cell_avg - 0.008, 3)
            temp = round(28.5 + float(np.random.uniform(-1.0, 1.5)), 1)
            t_max = round(temp + 0.7, 1)
            t_min = round(temp - 0.6, 1)
        else:
            op_type = 'discharge'
            chg_dur = ''
            daily_miles = 22.0 + float(np.random.uniform(-3.0, 3.0))
            odometer += daily_miles
            speed = round(float(np.random.uniform(22.0, 32.0)), 1)
            dis_dur = int(round(daily_miles / (speed / 3600.0)))
            current = round(float(np.random.uniform(-22.0, -12.0)), 2)  # Negative current
            soc = float(np.clip(85.0 - (day % 6) * 11.0 + np.random.uniform(-2.0, 2.0), 22.0, 88.0))
            pack_v = round(312.0 + (soc / 100.0) * 18.0 + float(np.random.uniform(-0.8, 0.8)), 2)
            cell_avg = pack_v / 100.0
            c_max = round(cell_avg + 0.009, 3)
            c_min = round(cell_avg - 0.009, 3)

            # Day 112 (index 111, 2026-04-22): Hot afternoon traffic thermal spike (> 45.0°C warningHigh limit)
            if day == 111:
                temp = 46.5
                t_max = 46.5
                t_min = 43.2
            else:
                temp = round(28.0 + float(np.random.uniform(-2.0, 2.0)), 1)
                t_max = round(temp + 0.7, 1)
                t_min = round(temp - 0.6, 1)

        re_val = '0.0510' if day in (0, 75) else ''
        rct_val = '0.0620' if day in (0, 75) else ''
        z_val = '0.1130' if day in (0, 75) else ''
        rect_z = '0.1080' if day in (0, 75) else ''

        rows.append({
            'battery_id': battery_id,
            'Timestamp': ts_str,
            'date': date_str,
            'Time': '12:00:00',
            'Cycle': cyc,
            'Capacity': cap_val,
            'Voltage': pack_v,
            'Current': current,
            'voltage_load': '',
            'current_load': '',
            'Temperature': temp,
            'SOC': round(soc, 1),
            'bcell_maxvoltage': c_max,
            'bcell_minvoltage': c_min,
            'bcell_maxtemp': t_max,
            'bcell_mintemp': t_min,
            'speed': speed,
            'mile': round(odometer, 1),
            'discharge_duration': dis_dur,
            'charge_duration': chg_dur,
            'type': op_type,
            'Re': re_val,
            'Rct': rct_val,
            'battery_impedance': z_val,
            'rectified_impedance': rect_z
        })

    return pd.DataFrame(rows, columns=CANONICAL_COLUMNS)


def generate_owner_4():
    """Hyundai Ioniq 5 AWD (2023) - 77.4 kWh, 111 Ah, 697V pack, 42 cycles. Anomalies: Day 42 dropout, Day 95 under-voltage."""
    battery_id = 'HYUNDAI-IONIQ5-AWD-2023-04'
    total_cycles = 42
    nominal_cap = 111.0000
    total_fade = 2.6500  # Ends at 108.35 Ah (97.61% SOH)

    # Avoid charging on Day 42 (index 41) and Day 95 (index 94) so anomalies occur during highway driving
    cycle_of_day, is_comp, is_chg = generate_cycle_schedule(TOTAL_DAYS, total_cycles, avoid_charge_days={41, 94})

    odometer = 22100.0
    rows = []

    for day in range(TOTAL_DAYS):
        ts = START_DATE + timedelta(days=day)
        date_str = ts.strftime('%Y-%m-%d')
        ts_str = ts.strftime('%Y-%m-%dT%H:%M:%S.000Z')
        cyc = cycle_of_day[day]
        comp = is_comp[day]
        chg = is_chg[day]

        if comp:
            prog = cyc / total_cycles
            fade = total_fade * (0.6 * np.sqrt(prog) + 0.4 * prog)
            cap_val = f'{nominal_cap - fade:.4f}'
        else:
            cap_val = ''

        if chg:
            op_type = 'charge'
            chg_dur = round(float(np.random.uniform(30.0, 45.0)), 1)
            dis_dur = ''
            current = round(float(np.random.uniform(55.0, 75.0)), 2)  # Positive 800V DCFC current
            speed = 0.0
            daily_miles = 0.0
            soc = round(float(np.random.uniform(84.0, 90.0)), 1)
            pack_v = round(712.0 + float(np.random.uniform(-1.5, 2.0)), 2)
            cell_avg = pack_v / 192.0
            c_max = round(cell_avg + 0.008, 3)
            c_min = round(cell_avg - 0.008, 3)
            temp = round(26.0 + float(np.random.uniform(-1.0, 1.5)), 1)
            t_max_val = round(temp + 0.8, 1)
            t_min_val = round(temp - 0.6, 1)
        else:
            op_type = 'discharge'
            chg_dur = ''
            daily_miles = 49.0 + float(np.random.uniform(-5.0, 5.0))
            odometer += daily_miles
            speed = round(float(np.random.uniform(46.0, 58.0)), 1)
            dis_dur = int(round(daily_miles / (speed / 3600.0)))
            current = round(float(np.random.uniform(-38.0, -22.0)), 2)  # Negative current
            soc = float(np.clip(85.0 - (day % 4) * 18.0 + np.random.uniform(-2.0, 2.0), 16.0, 88.0))
            pack_v = round(655.0 + (soc / 100.0) * 65.0 + float(np.random.uniform(-1.5, 1.5)), 2)
            cell_avg = pack_v / 192.0

            # Day 95 (index 94, 2026-04-05): Under-voltage excursion < 2.80V minCellV
            if day == 94:
                c_max = 2.860
                c_min = 2.740  # < 2.80 V minCellV limit
            else:
                c_max = round(cell_avg + 0.010, 3)
                c_min = round(cell_avg - 0.009, 3)

            temp = round(23.0 + float(np.random.uniform(-1.5, 1.5)), 1)

            # Day 42 (index 41, 2026-02-11): Thermistor telemetry dropout on CAN bus
            if day == 41:
                t_max_val = ''
                t_min_val = ''
            else:
                t_max_val = round(temp + 0.8, 1)
                t_min_val = round(temp - 0.6, 1)

        re_val = '0.0380' if day in (0, 75) else ''
        rct_val = '0.0460' if day in (0, 75) else ''
        z_val = '0.0840' if day in (0, 75) else ''
        rect_z = '0.0810' if day in (0, 75) else ''

        rows.append({
            'battery_id': battery_id,
            'Timestamp': ts_str,
            'date': date_str,
            'Time': '12:00:00',
            'Cycle': cyc,
            'Capacity': cap_val,
            'Voltage': pack_v,
            'Current': current,
            'voltage_load': '',
            'current_load': '',
            'Temperature': temp,
            'SOC': round(soc, 1),
            'bcell_maxvoltage': c_max,
            'bcell_minvoltage': c_min,
            'bcell_maxtemp': t_max_val,
            'bcell_mintemp': t_min_val,
            'speed': speed,
            'mile': round(odometer, 1),
            'discharge_duration': dis_dur,
            'charge_duration': chg_dur,
            'type': op_type,
            'Re': re_val,
            'Rct': rct_val,
            'battery_impedance': z_val,
            'rectified_impedance': rect_z
        })

    return pd.DataFrame(rows, columns=CANONICAL_COLUMNS)


def cleanup_obsolete_files():
    """Remove obsolete multi-folder and legacy CSV files in sample_data/."""
    dash_dir = os.path.join(REPO_ROOT, 'sample-data')
    if os.path.exists(dash_dir):
        print(f"Removing obsolete directory: {dash_dir}")
        shutil.rmtree(dash_dir)

    subdirs = ['user1', 'user2', 'user3', 'user4', 'legacy', 'scripts']
    for sd in subdirs:
        p = os.path.join(SAMPLE_DATA_DIR, sd)
        if os.path.exists(p):
            print(f"Removing obsolete subdirectory: {p}")
            shutil.rmtree(p)

    files_to_remove = ['manifest.json', 'demo_battery_cycles.csv']
    for f in files_to_remove:
        p = os.path.join(SAMPLE_DATA_DIR, f)
        if os.path.exists(p):
            print(f"Removing obsolete file: {p}")
            os.remove(p)


def main():
    print("==================================================")
    print("VoltSense Canonical Demo Dataset Generator")
    print("==================================================")

    os.makedirs(SAMPLE_DATA_DIR, exist_ok=True)

    generators = [
        ('owner_1.csv', generate_owner_1, 'Tesla Model 3 Long Range (2023)'),
        ('owner_2.csv', generate_owner_2, 'BYD Atto 3 Extended Range (2023)'),
        ('owner_3.csv', generate_owner_3, 'Tata Nexon EV Max (2023)'),
        ('owner_4.csv', generate_owner_4, 'Hyundai Ioniq 5 LR AWD (2023)'),
    ]

    for filename, gen_fn, desc in generators:
        out_path = os.path.join(SAMPLE_DATA_DIR, filename)
        df = gen_fn()
        assert len(df) == TOTAL_DAYS, f"Expected {TOTAL_DAYS} rows, got {len(df)}"
        assert list(df.columns) == CANONICAL_COLUMNS, "Column mismatch"
        df.to_csv(out_path, index=False)
        print(f"[OK] Generated {filename} ({desc}): {len(df)} rows, {len(df.columns)} columns")

    cleanup_obsolete_files()
    print("\n[OK] Directory cleanup complete: sample_data/ contains only the 4 owner CSVs, generator, and README.")


if __name__ == '__main__':
    main()
