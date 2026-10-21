#!/usr/bin/env python3
"""
VoltSense Longitudinal Real-World EV Car Dataset Generator
=========================================================
Generates multi-period, longitudinal real-world EV vehicle CSV datasets:
  - sample_data/tesla/first.csv, second.csv, third.csv
  - sample_data/byd_atto/first.csv, second.csv, third.csv
  - sample_data/tata_nexon/first.csv, second.csv, third.csv
  - sample_data/hyundai_ioniq/first.csv, second.csv, third.csv
  - sample_data/owner_1.csv .. owner_4.csv (mirrors of first.csv for test compatibility)

Key Design Features:
  - Each vehicle maintains a single, consistent battery_id across uploads.
  - Periods represent successive 150-day windows (e.g. first=Jan-May 2026, second=Jun-Oct 2026, third=Nov 2026-Mar 2027).
  - Cycle numbers and odometers continue seamlessly across uploads.
  - Baseline capacity established in first upload; subsequent uploads reflect gradual, realistic battery health decline.
  - Dynamic driving states: highway acceleration, cruising, regenerative braking, idle, and Level 2 AC / DC fast charging.
  - Load step internal resistance tracking (voltage_load, current_load).
  - Individual cell BMS extrema (bcell_maxvoltage, bcell_minvoltage, bcell_maxtemp, bcell_mintemp).

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

TIME_SLOTS = [
    (8, 22, 14),   # Morning commute departure & merge
    (13, 15, 42),  # Midday local errand
    (17, 48, 30),  # Evening highway return
    (18, 12, 10),  # City stop-and-go with regen braking
    (22, 5, 0),    # Overnight charging session
    (19, 35, 20),  # End-of-cycle return & BMS logging
]


def generate_cycle_schedule(total_days, total_cycles, start_cycle=1, avoid_charge_days=None):
    if avoid_charge_days is None:
        avoid_charge_days = set()

    days_per_cycle = total_days / total_cycles
    cycle_of_day = []
    cycle_days = {c: [] for c in range(start_cycle, start_cycle + total_cycles)}

    for day in range(total_days):
        c_idx = min(total_cycles - 1, int(day / days_per_cycle))
        target_cycle = start_cycle + c_idx
        cycle_days[target_cycle].append(day)
        cycle_of_day.append(target_cycle)

    completion_days = set()
    charging_days = set()

    for c, days in cycle_days.items():
        comp_day = days[-1]
        completion_days.add(comp_day)

        candidates = [d for d in days if d != comp_day and d not in avoid_charge_days]
        if candidates:
            chg_day = candidates[len(candidates) // 2]
            charging_days.add(chg_day)
        elif len(days) > 1:
            charging_days.add(days[0])

    is_completion_day = [d in completion_days for d in range(total_days)]
    is_charging_day = [d in charging_days and d not in completion_days for d in range(total_days)]

    return cycle_of_day, is_completion_day, is_charging_day


def generate_vehicle_period(
    battery_id,
    period_idx,             # 0 for first, 1 for second, 2 for third
    start_date,             # datetime UTC
    total_days,             # 150
    start_cycle,            # 1, 31, 61, etc.
    cycles_in_period,       # e.g. 30
    nominal_pack_capacity,  # e.g. 210.0
    start_capacity,         # starting capacity for this period
    end_capacity,           # ending capacity for this period
    start_odometer,         # starting mileage
    pack_cells,             # series count e.g. 96
    nominal_pack_voltage,   # e.g. 389.4
    voltage_range,          # (min_v, max_v) e.g. (352.0, 396.0)
    anomalies_config=None,  # dict of day_idx -> anomaly_fn
    charge_current_range=(28.0, 32.0),
    charge_duration_range=(45.0, 60.0),
    avg_speed_range=(34.0, 44.0),
    daily_miles_mean=32.0,
    ambient_temp_mean=24.0,
    eis_base=(0.0425, 0.0520, 0.0945, 0.0910),
):
    cycle_of_day, is_comp, is_chg = generate_cycle_schedule(
        total_days, cycles_in_period, start_cycle=start_cycle,
        avoid_charge_days=set(anomalies_config.keys()) if anomalies_config else None
    )

    odometer = start_odometer
    rows = []
    total_period_fade = start_capacity - end_capacity

    for day in range(total_days):
        hour, minute, sec = TIME_SLOTS[day % len(TIME_SLOTS)]
        dt = start_date + timedelta(days=day, hours=hour, minutes=minute, seconds=sec)
        date_str = dt.strftime('%Y-%m-%d')
        time_str = dt.strftime('%H:%M:%S')
        ts_str = dt.strftime('%Y-%m-%dT%H:%M:%S.000Z')

        cyc = cycle_of_day[day]
        comp = is_comp[day]
        chg = is_chg[day]

        # Capacity logged on cycle completion row
        if comp:
            c_prog = (cyc - start_cycle + 1) / cycles_in_period
            # Slight non-linear degradation progression with small natural variance
            fade = total_period_fade * (0.6 * np.sqrt(c_prog) + 0.4 * c_prog)
            cap_val = f'{start_capacity - fade:.4f}'
        else:
            cap_val = ''

        v_load = ''
        i_load = ''
        v_min_pack, v_max_pack = voltage_range

        if chg:
            op_type = 'charge'
            chg_dur = round(float(np.random.uniform(*charge_duration_range)), 1)
            dis_dur = ''
            current = round(float(np.random.uniform(*charge_current_range)), 2)
            speed = 0.0
            daily_miles = 0.0
            soc = round(float(np.random.uniform(88.0, 93.0)), 1)
            pack_v = round(v_max_pack - 2.0 + float(np.random.uniform(-1.0, 1.5)), 2)
            cell_avg = pack_v / pack_cells
            c_max = round(cell_avg + 0.008, 3)
            c_min = round(cell_avg - 0.008, 3)
            temp = round(ambient_temp_mean + float(np.random.uniform(-0.8, 1.2)), 1)
            t_max = round(temp + 0.7, 1)
            t_min = round(temp - 0.5, 1)
        else:
            op_type = 'discharge'
            chg_dur = ''
            event_type = day % 4  # 0: acceleration, 1: highway cruise, 2: city regen, 3: urban commute

            if event_type == 0:
                # Acceleration: high discharge current, Ohm's law voltage sag
                speed = round(float(np.random.uniform(46.0, 58.0)), 1)
                daily_miles = daily_miles_mean + float(np.random.uniform(-3.0, 3.0))
                odometer += daily_miles
                dis_dur = int(round(daily_miles / (speed / 3600.0)))
                current = round(float(np.random.uniform(-98.0, -72.0)), 2)
                soc = float(np.clip(84.0 - (day % 5) * 12.0 + np.random.uniform(-1.5, 1.5), 18.0, 90.0))
                ocv = v_min_pack + (soc / 100.0) * (v_max_pack - v_min_pack)
                pack_v = round(ocv - 7.5 + float(np.random.uniform(-0.6, 0.6)), 2)
                cell_avg = pack_v / pack_cells
                c_max = round(cell_avg + 0.012, 3)
                c_min = round(cell_avg - 0.012, 3)
                temp = round(ambient_temp_mean + 1.2 + float(np.random.uniform(-1.0, 1.5)), 1)
                t_max = round(temp + 0.8, 1)
                t_min = round(temp - 0.6, 1)
                v_load = round(pack_v - 4.2, 2)
                i_load = current
            elif event_type == 1:
                # Highway Cruising
                speed = round(float(np.random.uniform(62.0, 72.0)), 1)
                daily_miles = daily_miles_mean * 1.25 + float(np.random.uniform(-4.0, 4.0))
                odometer += daily_miles
                dis_dur = int(round(daily_miles / (speed / 3600.0)))
                current = round(float(np.random.uniform(-38.0, -28.0)), 2)
                soc = float(np.clip(76.0 - (day % 5) * 12.0 + np.random.uniform(-1.5, 1.5), 18.0, 90.0))
                ocv = v_min_pack + (soc / 100.0) * (v_max_pack - v_min_pack)
                pack_v = round(ocv - 3.0 + float(np.random.uniform(-0.6, 0.6)), 2)
                cell_avg = pack_v / pack_cells
                c_max = round(cell_avg + 0.008, 3)
                c_min = round(cell_avg - 0.008, 3)
                temp = round(ambient_temp_mean + 0.8 + float(np.random.uniform(-1.0, 1.0)), 1)
                t_max = round(temp + 0.7, 1)
                t_min = round(temp - 0.5, 1)
            elif event_type == 2:
                # Regenerative Braking during city slowdown
                speed = round(float(np.random.uniform(18.0, 26.0)), 1)
                daily_miles = daily_miles_mean * 0.85 + float(np.random.uniform(-2.0, 2.0))
                odometer += daily_miles
                dis_dur = int(round(daily_miles / (speed / 3600.0)))
                current = round(float(np.random.uniform(-14.0, -5.0)), 2)
                soc = float(np.clip(66.0 - (day % 5) * 12.0 + np.random.uniform(-1.5, 1.5), 18.0, 90.0))
                ocv = v_min_pack + (soc / 100.0) * (v_max_pack - v_min_pack)
                pack_v = round(ocv + 2.2 + float(np.random.uniform(-0.5, 0.5)), 2)
                cell_avg = pack_v / pack_cells
                c_max = round(cell_avg + 0.009, 3)
                c_min = round(cell_avg - 0.009, 3)
                temp = round(ambient_temp_mean + float(np.random.uniform(-1.0, 1.0)), 1)
                t_max = round(temp + 0.7, 1)
                t_min = round(temp - 0.5, 1)
            else:
                # Standard commute
                speed = round(float(np.random.uniform(*avg_speed_range)), 1)
                daily_miles = daily_miles_mean + float(np.random.uniform(-3.0, 3.0))
                odometer += daily_miles
                dis_dur = int(round(daily_miles / (speed / 3600.0)))
                current = round(float(np.random.uniform(-26.0, -16.0)), 2)
                soc = float(np.clip(82.0 - (day % 5) * 13.0 + np.random.uniform(-2.0, 2.0), 18.0, 88.0))
                ocv = v_min_pack + (soc / 100.0) * (v_max_pack - v_min_pack)
                pack_v = round(ocv + float(np.random.uniform(-1.0, 1.0)), 2)
                cell_avg = pack_v / pack_cells
                c_max = round(cell_avg + 0.009, 3)
                c_min = round(cell_avg - 0.009, 3)
                temp = round(ambient_temp_mean + float(np.random.uniform(-1.5, 1.5)), 1)
                t_max = round(temp + 0.7, 1)
                t_min = round(temp - 0.5, 1)

        # Apply controlled anomalies if configured for this day
        if anomalies_config and day in anomalies_config:
            c_max, c_min, temp, t_max, t_min = anomalies_config[day](c_max, c_min, temp, t_max, t_min)

        # Periodic EIS check
        re_val = f'{eis_base[0] + period_idx * 0.0015:.4f}' if day in (0, 75) else ''
        rct_val = f'{eis_base[1] + period_idx * 0.0025:.4f}' if day in (0, 75) else ''
        z_val = f'{eis_base[2] + period_idx * 0.0040:.4f}' if day in (0, 75) else ''
        rect_z = f'{eis_base[3] + period_idx * 0.0035:.4f}' if day in (0, 75) else ''

        rows.append({
            'battery_id': battery_id,
            'Timestamp': ts_str,
            'date': date_str,
            'Time': time_str,
            'Cycle': cyc,
            'Capacity': cap_val,
            'Voltage': pack_v,
            'Current': current,
            'voltage_load': v_load,
            'current_load': i_load,
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

    end_odometer = odometer
    return pd.DataFrame(rows, columns=CANONICAL_COLUMNS), end_odometer


def generate_tesla_suite():
    """Tesla Model 3 Long Range AWD (82 kWh, 96s NCA/NMC, 210 Ah nominal)"""
    battery_id = 'TESLA-M3-LR-2023-01'
    base_kwargs = dict(
        battery_id=battery_id,
        total_days=150,
        nominal_pack_capacity=210.0,
        pack_cells=96,
        nominal_pack_voltage=389.4,
        voltage_range=(352.0, 396.0),
        charge_current_range=(28.0, 32.0),
        charge_duration_range=(45.0, 60.0),
        daily_miles_mean=32.5,
        ambient_temp_mean=24.0,
        eis_base=(0.0425, 0.0520, 0.0945, 0.0910),
    )

    # First period: Jan 1, 2026 -> May 30, 2026 (Cycles 1-30, 210.0 -> 206.85 Ah, 98.5% SOH)
    df1, odo1 = generate_vehicle_period(
        period_idx=0,
        start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
        start_cycle=1,
        cycles_in_period=30,
        start_capacity=210.0,
        end_capacity=206.85,
        start_odometer=18500.0,
        **base_kwargs
    )

    # Second period: Jun 1, 2026 -> Oct 28, 2026 (Cycles 31-60, 206.85 -> 203.70 Ah, 97.0% SOH)
    df2, odo2 = generate_vehicle_period(
        period_idx=1,
        start_date=datetime(2026, 6, 1, tzinfo=timezone.utc),
        start_cycle=31,
        cycles_in_period=30,
        start_capacity=206.85,
        end_capacity=203.70,
        start_odometer=odo1,
        **base_kwargs
    )

    # Third period: Nov 1, 2026 -> Mar 31, 2027 (Cycles 61-90, 203.70 -> 200.55 Ah, 95.5% SOH)
    df3, odo3 = generate_vehicle_period(
        period_idx=2,
        start_date=datetime(2026, 11, 1, tzinfo=timezone.utc),
        start_cycle=61,
        cycles_in_period=30,
        start_capacity=203.70,
        end_capacity=200.55,
        start_odometer=odo2,
        **base_kwargs
    )

    return [('first.csv', df1), ('second.csv', df2), ('third.csv', df3)]


def generate_byd_suite():
    """BYD Atto 3 Extended Range (60.5 kWh, 126s Blade LFP, 150 Ah nominal)"""
    battery_id = 'BYD-ATTO3-ER-2023-02'
    base_kwargs = dict(
        battery_id=battery_id,
        total_days=150,
        nominal_pack_capacity=150.0,
        pack_cells=126,
        nominal_pack_voltage=403.2,
        voltage_range=(394.0, 413.0),
        charge_current_range=(35.0, 45.0),
        charge_duration_range=(40.0, 55.0),
        daily_miles_mean=36.0,
        ambient_temp_mean=24.5,
        eis_base=(0.0480, 0.0585, 0.1065, 0.1020),
    )

    # Day 68 cell imbalance anomaly in period 1
    anom1 = {
        67: lambda cmax, cmin, temp, tmax, tmin: (3.425, 3.260, temp, tmax, tmin)
    }

    df1, odo1 = generate_vehicle_period(
        period_idx=0,
        start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
        start_cycle=1,
        cycles_in_period=37,
        start_capacity=150.0,
        end_capacity=147.90,
        start_odometer=12200.0,
        anomalies_config=anom1,
        **base_kwargs
    )

    df2, odo2 = generate_vehicle_period(
        period_idx=1,
        start_date=datetime(2026, 6, 1, tzinfo=timezone.utc),
        start_cycle=38,
        cycles_in_period=37,
        start_capacity=147.90,
        end_capacity=145.80,
        start_odometer=odo1,
        **base_kwargs
    )

    df3, odo3 = generate_vehicle_period(
        period_idx=2,
        start_date=datetime(2026, 11, 1, tzinfo=timezone.utc),
        start_cycle=75,
        cycles_in_period=36,
        start_capacity=145.80,
        end_capacity=143.70,
        start_odometer=odo2,
        **base_kwargs
    )

    return [('first.csv', df1), ('second.csv', df2), ('third.csv', df3)]


def generate_tata_suite():
    """Tata Nexon EV Max (40.5 kWh, 100s Ziptron LFP, 126 Ah nominal)"""
    battery_id = 'TATA-NEXON-MAX-2023-03'
    base_kwargs = dict(
        battery_id=battery_id,
        total_days=150,
        nominal_pack_capacity=126.0,
        pack_cells=100,
        nominal_pack_voltage=320.0,
        voltage_range=(312.0, 330.0),
        charge_current_range=(22.0, 26.0),
        charge_duration_range=(50.0, 70.0),
        daily_miles_mean=22.0,
        avg_speed_range=(22.0, 32.0),
        ambient_temp_mean=28.5,
        eis_base=(0.0510, 0.0620, 0.1130, 0.1080),
    )

    # Day 112 afternoon thermal spike in period 1
    anom1 = {
        111: lambda cmax, cmin, temp, tmax, tmin: (cmax, cmin, 46.5, 46.5, 43.2)
    }

    df1, odo1 = generate_vehicle_period(
        period_idx=0,
        start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
        start_cycle=1,
        cycles_in_period=25,
        start_capacity=126.0,
        end_capacity=123.85,
        start_odometer=9400.0,
        anomalies_config=anom1,
        **base_kwargs
    )

    df2, odo2 = generate_vehicle_period(
        period_idx=1,
        start_date=datetime(2026, 6, 1, tzinfo=timezone.utc),
        start_cycle=26,
        cycles_in_period=25,
        start_capacity=123.85,
        end_capacity=121.70,
        start_odometer=odo1,
        **base_kwargs
    )

    df3, odo3 = generate_vehicle_period(
        period_idx=2,
        start_date=datetime(2026, 11, 1, tzinfo=timezone.utc),
        start_cycle=51,
        cycles_in_period=25,
        start_capacity=121.70,
        end_capacity=119.55,
        start_odometer=odo2,
        **base_kwargs
    )

    return [('first.csv', df1), ('second.csv', df2), ('third.csv', df3)]


def generate_hyundai_suite():
    """Hyundai Ioniq 5 LR AWD (77.4 kWh, 192s 800V NCM, 111 Ah nominal)"""
    battery_id = 'HYUNDAI-IONIQ5-AWD-2023-04'
    base_kwargs = dict(
        battery_id=battery_id,
        total_days=150,
        nominal_pack_capacity=111.0,
        pack_cells=192,
        nominal_pack_voltage=697.0,
        voltage_range=(655.0, 720.0),
        charge_current_range=(55.0, 75.0),
        charge_duration_range=(30.0, 45.0),
        daily_miles_mean=48.0,
        avg_speed_range=(46.0, 58.0),
        ambient_temp_mean=23.5,
        eis_base=(0.0380, 0.0460, 0.0840, 0.0810),
    )

    # Day 42 CAN thermistor dropout and Day 95 under-voltage in period 1
    anom1 = {
        41: lambda cmax, cmin, temp, tmax, tmin: (cmax, cmin, temp, '', ''),
        94: lambda cmax, cmin, temp, tmax, tmin: (2.860, 2.740, temp, tmax, tmin)
    }

    df1, odo1 = generate_vehicle_period(
        period_idx=0,
        start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
        start_cycle=1,
        cycles_in_period=42,
        start_capacity=111.0,
        end_capacity=108.35,
        start_odometer=22100.0,
        anomalies_config=anom1,
        **base_kwargs
    )

    df2, odo2 = generate_vehicle_period(
        period_idx=1,
        start_date=datetime(2026, 6, 1, tzinfo=timezone.utc),
        start_cycle=43,
        cycles_in_period=42,
        start_capacity=108.35,
        end_capacity=105.70,
        start_odometer=odo1,
        **base_kwargs
    )

    df3, odo3 = generate_vehicle_period(
        period_idx=2,
        start_date=datetime(2026, 11, 1, tzinfo=timezone.utc),
        start_cycle=85,
        cycles_in_period=41,
        start_capacity=105.70,
        end_capacity=103.05,
        start_odometer=odo2,
        **base_kwargs
    )

    return [('first.csv', df1), ('second.csv', df2), ('third.csv', df3)]


def main():
    print("==================================================")
    print("VoltSense Longitudinal Real-World EV Dataset Generator")
    print("==================================================")

    os.makedirs(SAMPLE_DATA_DIR, exist_ok=True)

    suites = [
        ('tesla', generate_tesla_suite, 'owner_1.csv', 'Tesla Model 3 Long Range AWD (2023)'),
        ('byd_atto', generate_byd_suite, 'owner_2.csv', 'BYD Atto 3 Extended Range (2023)'),
        ('tata_nexon', generate_tata_suite, 'owner_3.csv', 'Tata Nexon EV Max (2023)'),
        ('hyundai_ioniq', generate_hyundai_suite, 'owner_4.csv', 'Hyundai Ioniq 5 LR AWD (2023)'),
    ]

    for folder_name, gen_fn, owner_alias, desc in suites:
        folder_path = os.path.join(SAMPLE_DATA_DIR, folder_name)
        os.makedirs(folder_path, exist_ok=True)

        periods = gen_fn()
        for filename, df in periods:
            out_path = os.path.join(folder_path, filename)
            df.to_csv(out_path, index=False)
            print(f"[OK] Generated {folder_name}/{filename} ({desc}): {len(df)} rows, {len(df.columns)} cols")

        # Copy period 1 to owner alias for root test suite compatibility
        first_df = periods[0][1]
        owner_path = os.path.join(SAMPLE_DATA_DIR, owner_alias)
        first_df.to_csv(owner_path, index=False)
        print(f"[OK] Maintained root alias {owner_alias} -> {folder_name}/first.csv")

    print("\n[OK] Generation complete: All longitudinal vehicle suites successfully generated.")


if __name__ == '__main__':
    main()
