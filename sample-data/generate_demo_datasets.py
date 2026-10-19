"""
Script to generate canonical synthetic battery datasets:
- demo1_battery_cycles.csv (Cycles 1-40, ending 2025-01-15)
- demo2_battery_cycles.csv (Cycles 1-80, ending 2025-06-14, +150 days)
- demo3_battery_cycles.csv (Cycles 1-120, ending 2025-11-11, +150 days)
- demo4_battery_cycles.csv (Cycles 1-160, ending 2026-04-10, +150 days)

All 4 files share the exact 13 canonical columns in the exact canonical order:
battery_id,timestamp,date,time,Cycle,type,Capacity,mean_voltage,mean_current,mean_temperature,discharge_duration,charge_duration,soc
"""
import csv
import math
from datetime import datetime, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
SRC_PATH = BASE_DIR / "demo_battery_cycles.csv"

# Load original demo_battery_cycles.csv to preserve cycles 1 to 40 base values
lines = SRC_PATH.read_text(encoding="utf-8").strip().splitlines()
reader = csv.DictReader(lines)
orig_cycles = list(reader)

# Dates: exactly 150 days apart
d1_end = datetime(2025, 1, 15)
d2_end = datetime(2025, 6, 14)
d3_end = datetime(2025, 11, 11)
d4_end = datetime(2026, 4, 10)

assert (d2_end - d1_end).days == 150
assert (d3_end - d2_end).days == 150
assert (d4_end - d3_end).days == 150

d1_start = d1_end - timedelta(days=39) # 2024-12-07

def build_cycle_dates(start_d, end_d, count):
    total_days = (end_d - start_d).days
    dates = []
    for idx in range(count):
        prog = idx / float(count - 1) if count > 1 else 1.0
        dt = start_d + timedelta(days=round(prog * total_days))
        dates.append(dt.strftime("%Y-%m-%d"))
    return dates

dates_seg1 = build_cycle_dates(d1_start, d1_end, 40)
dates_seg2 = build_cycle_dates(d1_end + timedelta(days=1), d2_end, 40)
dates_seg3 = build_cycle_dates(d2_end + timedelta(days=1), d3_end, 40)
dates_seg4 = build_cycle_dates(d3_end + timedelta(days=1), d4_end, 40)

all_dates = dates_seg1 + dates_seg2 + dates_seg3 + dates_seg4
assert len(all_dates) == 160

# Generate physical discharge data for cycles 41..160
def generate_discharge_cycles(start_cycle, end_cycle, start_cap, target_end_cap, start_v, end_v, base_temp):
    num_cycles = end_cycle - start_cycle + 1
    results = []
    for idx in range(num_cycles):
        cyc = start_cycle + idx
        prog = idx / float(num_cycles - 1) if num_cycles > 1 else 1.0
        
        fluctuation = 0.0018 * math.sin(cyc * 0.45) + 0.0008 * math.cos(cyc * 0.9)
        cap = start_cap - (start_cap - target_end_cap) * (prog ** 1.04) + fluctuation
        cap = round(cap, 4)
        
        v_drop = 0.004 * math.sin(cyc * 0.4)
        v = round(start_v - (start_v - end_v) * prog + v_drop, 3)
        current = -1.500
        
        temp_osc = 0.6 * math.sin(cyc * 0.3) + 0.3 * math.cos(cyc * 0.7)
        temp = round(base_temp + 0.8 * prog + temp_osc, 2)
        
        dur_min = round((cap / 1.5) * 60.0 * (0.9995 - 0.00004 * cyc), 1)
        
        results.append({
            "Cycle": cyc,
            "Capacity": cap,
            "mean_voltage": v,
            "mean_current": current,
            "mean_temperature": temp,
            "discharge_duration": dur_min,
        })
    return results

dis_seg2 = generate_discharge_cycles(41, 80, 1.8835, 1.7820, 3.646, 3.615, 26.4)
dis_seg3 = generate_discharge_cycles(81, 120, 1.7795, 1.6850, 3.612, 3.582, 26.9)
dis_seg4 = generate_discharge_cycles(121, 160, 1.6820, 1.5980, 3.579, 3.548, 27.4)

all_discharges = []
for orig in orig_cycles:
    cyc = int(orig["Cycle"])
    cap = float(orig["Capacity"])
    v = float(orig["mean_voltage"])
    current = float(orig["mean_current"])
    temp = float(orig["mean_temperature"])
    dur_min = round(float(orig["discharge_duration"]) / 60.0, 1)
    all_discharges.append({
        "Cycle": cyc,
        "Capacity": cap,
        "mean_voltage": v,
        "mean_current": current,
        "mean_temperature": temp,
        "discharge_duration": dur_min,
    })

all_discharges.extend(dis_seg2)
all_discharges.extend(dis_seg3)
all_discharges.extend(dis_seg4)
assert len(all_discharges) == 160

BATTERY_ID = "SYNTHETIC_DEMO_CELL_001"

def build_cycle_rows(cyc_idx):
    cyc = cyc_idx + 1
    date_str = all_dates[cyc_idx]
    dis = all_discharges[cyc_idx]
    
    # 1. Charge row at 03:00:00
    chg_time = "03:00:00"
    chg_ts = f"{date_str}T{chg_time}Z"
    
    chg_v = round(4.145 + 0.00022 * cyc + 0.006 * math.sin(cyc * 0.35), 3)
    chg_i = round(1.200 + 0.02 * math.sin(cyc * 0.4), 3)
    chg_temp = round(24.2 + 0.007 * cyc + 0.35 * math.cos(cyc * 0.5), 2)
    chg_dur = round(58.5 + 0.025 * cyc + 1.1 * math.sin(cyc * 0.45), 1)
    chg_soc = round(96.0 + 0.8 * math.sin(cyc * 0.25), 1)
    
    charge_row = {
        "battery_id": BATTERY_ID,
        "timestamp": chg_ts,
        "date": date_str,
        "time": chg_time,
        "Cycle": cyc,
        "type": "charge",
        "Capacity": "0.0000",
        "mean_voltage": f"{chg_v:.3f}",
        "mean_current": f"{chg_i:.3f}",
        "mean_temperature": f"{chg_temp:.2f}",
        "discharge_duration": "0.0",
        "charge_duration": f"{chg_dur:.1f}",
        "soc": f"{chg_soc:.1f}",
    }
    
    # 2. Discharge row at 08:00:00
    dis_time = "08:00:00"
    dis_ts = f"{date_str}T{dis_time}Z"
    dis_soc = round(15.2 + 1.2 * math.sin(cyc * 0.35), 1)
    
    discharge_row = {
        "battery_id": BATTERY_ID,
        "timestamp": dis_ts,
        "date": date_str,
        "time": dis_time,
        "Cycle": cyc,
        "type": "discharge",
        "Capacity": f"{dis['Capacity']:.4f}",
        "mean_voltage": f"{dis['mean_voltage']:.3f}",
        "mean_current": f"{dis['mean_current']:.3f}",
        "mean_temperature": f"{dis['mean_temperature']:.2f}",
        "discharge_duration": f"{dis['discharge_duration']:.1f}",
        "charge_duration": "0.0",
        "soc": f"{dis_soc:.1f}",
    }
    
    return [charge_row, discharge_row]

all_canonical_rows = []
for idx in range(160):
    all_canonical_rows.extend(build_cycle_rows(idx))

assert len(all_canonical_rows) == 320

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

demo1_rows = all_canonical_rows[:80]
demo2_rows = all_canonical_rows[:160]
demo3_rows = all_canonical_rows[:240]
demo4_rows = all_canonical_rows[:320]

def save_csv(filename, rows):
    out_path = BASE_DIR / filename
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CANONICAL_HEADERS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Saved {filename}: {len(rows)} rows ({len(rows)//2} cycles), date range {rows[0]['date']} to {rows[-1]['date']}")

if __name__ == "__main__":
    save_csv("demo1_battery_cycles.csv", demo1_rows)
    save_csv("demo2_battery_cycles.csv", demo2_rows)
    save_csv("demo3_battery_cycles.csv", demo3_rows)
    save_csv("demo4_battery_cycles.csv", demo4_rows)
    print("All 4 demo datasets successfully generated!")
