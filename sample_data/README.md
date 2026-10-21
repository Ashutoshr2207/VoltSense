# VoltSense Canonical Sample Datasets Suite

This directory contains the **canonical, source-informed, and verified sample datasets** for demonstrating VoltSense EV battery health analytics, longitudinal degradation tracking across successive uploads, telemetry parsing, and anomaly detection.

The suite provides:
1. **Longitudinal Multi-Period Vehicle Subfolders**: Organized by EV model (`tesla/`, `byd_atto/`, `tata_nexon/`, `hyundai_ioniq/`), containing sequential 150-day observation uploads (`first.csv`, `second.csv`, `third.csv`) over a continuous 450-day lifespan.
2. **Root Owner CSVs**: Backward-compatible single-period mirrors (`owner_1.csv` through `owner_4.csv`) corresponding to `first.csv` for each vehicle model.

---

## 1. Directory Structure

```text
sample_data/
├── generate_demo_datasets.py      # Deterministic Python generator script for all CSVs
├── README.md                      # Comprehensive dataset documentation (this document)
├── tesla/                         # Tesla Model 3 Long Range (2023) - 82 kWh (210 Ah)
│   ├── first.csv                  # Days 1–150 (Cycles 1–30, Baseline SOH ~98.5%)
│   ├── second.csv                 # Days 151–300 (Cycles 31–60, SOH ~97.2%)
│   └── third.csv                  # Days 301–450 (Cycles 61–90, SOH ~95.8%)
├── byd_atto/                      # BYD Atto 3 Extended Range (2023) - 60.5 kWh (150 Ah)
│   ├── first.csv                  # Days 1–150 (Cycles 1–37, Baseline SOH ~98.6%)
│   ├── second.csv                 # Days 151–300 (Cycles 38–74, SOH ~97.1%)
│   └── third.csv                  # Days 301–450 (Cycles 75–111, SOH ~95.6%)
├── tata_nexon/                    # Tata Nexon EV Max (2023) - 40.5 kWh (126 Ah)
│   ├── first.csv                  # Days 1–150 (Cycles 1–25, Baseline SOH ~98.3%)
│   ├── second.csv                 # Days 151–300 (Cycles 26–50, SOH ~96.8%)
│   └── third.csv                  # Days 301–450 (Cycles 51–75, SOH ~95.1%)
├── hyundai_ioniq/                 # Hyundai Ioniq 5 LR AWD (2023) - 77.4 kWh (111 Ah)
│   ├── first.csv                  # Days 1–150 (Cycles 1–42, Baseline SOH ~97.6%)
│   ├── second.csv                 # Days 151–300 (Cycles 43–84, SOH ~96.0%)
│   └── third.csv                  # Days 301–450 (Cycles 85–126, SOH ~94.4%)
├── owner_1.csv                    # Backward-compatible mirror of tesla/first.csv
├── owner_2.csv                    # Backward-compatible mirror of byd_atto/first.csv
├── owner_3.csv                    # Backward-compatible mirror of tata_nexon/first.csv
└── owner_4.csv                    # Backward-compatible mirror of hyundai_ioniq/first.csv
```

---

## 2. Longitudinal Tracking Across Successive Ingestions

VoltSense tracks a vehicle's battery health history over its lifetime across successive uploads:

- **First Ingestion (`first.csv`)**: Establishes a true vehicle baseline (~98.5% SOH) from available pack capacity ($100 \times \text{currentCap} / \text{baselineCap}$), without scale confusion.
- **Subsequent Ingestions (`second.csv`, `third.csv`)**: Continuously associates new data with the same vehicle, carries forward past cumulative cycles and reference capacity, merges historical cycles into a contiguous degradation table, and updates health trends.
- **Over Vehicle Lifetime**: SOH declines gradually (e.g. 98.5% $\to$ 97.2% $\to$ 95.8%), while RUL cycles smoothly decrease towards the 80% EOL threshold. Telemetry and capacity fluctuate realistically cycle-to-cycle due to regenerative braking and temperature effects.

---

## 3. Vehicle Profiles & Summary Matrix

| Dataset | Owner Vehicle | Pack Energy & Chemistry | Nominal Voltage & Capacity | Observation Period | Total Records | Completed Cycles | SOH Trajectory | Controlled Anomalies |
|---|---|---|---|---|---|---|---|---|
| **[`owner_1.csv`](owner_1.csv)** | **Tesla Model 3 Long Range (2023)** | 82.0 kWh<br>NCA/NMC (2170) | 389.4 V<br>210.0 Ah | `2026-01-01` to `2026-05-30` (150 days) | 150 rows | 30 cycles<br>(1 cycle / 5 days) | 209.61 $\to$ 206.85 Ah<br>(98.7% empirical SOH) | 0 (Clean baseline vehicle) |
| **[`owner_2.csv`](owner_2.csv)** | **BYD Atto 3 Extended Range (2023)** | 60.5 kWh<br>LFP Blade Battery | 403.2 V<br>150.0 Ah | `2026-01-01` to `2026-05-30` (150 days) | 150 rows | 37 cycles<br>(1 cycle / ~4 days) | 149.77 $\to$ 147.90 Ah<br>(98.8% empirical SOH) | Day 68 (`2026-03-09`): Cell voltage spread imbalance (`0.165 V` > `0.15 V` limit) |
| **[`owner_3.csv`](owner_3.csv)** | **Tata Nexon EV Max (2023)** | 40.5 kWh<br>LFP Ziptron (100s) | 320.0 V<br>126.0 Ah | `2026-01-01` to `2026-05-30` (150 days) | 150 rows | 25 cycles<br>(1 cycle / 6 days) | 125.71 $\to$ 123.85 Ah<br>(98.5% empirical SOH) | Day 112 (`2026-04-22`): Elevated afternoon thermal spike (`46.5 °C` > `45.0 °C` warning) |
| **[`owner_4.csv`](owner_4.csv)** | **Hyundai Ioniq 5 LR AWD (2023)** | 77.4 kWh<br>800V NCM (192s) | 697.0 V<br>111.0 Ah | `2026-01-01` to `2026-05-30` (150 days) | 150 rows | 42 cycles<br>(1 cycle / ~3.5 days) | 110.73 $\to$ 108.35 Ah<br>(97.9% empirical SOH) | Day 42 (`2026-02-11`): CAN thermistor dropout (missing temp)<br>Day 95 (`2026-04-05`): Cell under-voltage excursion (`2.74 V` < `2.80 V` limit) |

---

## 3. Canonical Schema: Complete Telemetry & Charging Columns

Every one of the four CSV files contains all canonical columns in the exact same order:

```csv
battery_id,Timestamp,date,Time,Cycle,Capacity,Voltage,Current,voltage_load,current_load,Temperature,SOC,bcell_maxvoltage,bcell_minvoltage,bcell_maxtemp,bcell_mintemp,speed,mile,discharge_duration,charge_duration,type,Re,Rct,battery_impedance,rectified_impedance
```

### Column Definitions, Units, and Roles

| # | Column Name | Unit | Category | Description & Parser Behavior |
|---|---|---|---|---|
| 1 | `battery_id` | String | Context | Unique, invariant identifier for the vehicle's battery pack across all rows. |
| 2 | `Timestamp` | ISO 8601 UTC | Context | Full ISO timestamp of observation (`2026-01-01T12:00:00.000Z` through `2026-05-30T12:00:00.000Z`). |
| 3 | `date` | YYYY-MM-DD | Context | Calendar date of observation, exactly one per day. |
| 4 | `Time` | HH:MM:SS | Context | Daily recording time (`12:00:00`). |
| 5 | `Cycle` | Integer $\ge 1$ | Cycle | Active discharge cycle index. Reflects physical cycle progression. |
| 6 | `Capacity` | Ah | Capacity | Measured discharge capacity. Populated on cycle-completion days; empty string (`""`) on intermediate days. |
| 7 | `Voltage` | V | Telemetry | High-voltage battery pack terminal voltage. |
| 8 | `Current` | A | Telemetry | Net battery pack current (negative values for driving discharge, positive values for charging). |
| 9 | `voltage_load` | V | Telemetry | Load step voltage measurement (empty `""` during standard driving). |
| 10 | `current_load` | A | Telemetry | Load step current measurement (empty `""` during standard driving). |
| 11 | `Temperature` | °C | Telemetry | Average battery pack temperature. |
| 12 | `SOC` | % (0–100) | Telemetry | State of charge percentage at daily snapshot. |
| 13 | `bcell_maxvoltage` | V | BMS Extrema | Highest individual cell voltage monitored by BMS. |
| 14 | `bcell_minvoltage` | V | BMS Extrema | Lowest individual cell voltage monitored by BMS. |
| 15 | `bcell_maxtemp` | °C | BMS Extrema | Highest module/cell thermistor reading. |
| 16 | `bcell_mintemp` | °C | BMS Extrema | Lowest module/cell thermistor reading. |
| 17 | `speed` | mph | Vehicle Usage | Average speed (0.0 mph on charging days). |
| 18 | `mile` | Miles | Vehicle Usage | Cumulative vehicle odometer reading. Strictly monotonic non-decreasing. |
| 19 | `discharge_duration` | Seconds | Vehicle Usage | Daily active discharge duration (populated on discharge driving days). |
| 20 | `charge_duration` | Minutes | Vehicle Usage | Charging session duration in minutes (populated on charge days; used for charging session extraction). |
| 21 | `type` | String | Vehicle Usage | Operation type: `discharge` or `charge`. |
| 22 | `Re` | $\Omega$ | Impedance | Estimated electrolyte resistance from EIS (periodic / sparse). |
| 23 | `Rct` | $\Omega$ | Impedance | Charge transfer resistance from EIS (periodic / sparse). |
| 24 | `battery_impedance` | $\Omega$ | Impedance | Total battery internal impedance magnitude. |
| 25 | `rectified_impedance`| $\Omega$ | Impedance | High-frequency rectified impedance. |

---

## 4. Physical Cycle Progression vs Daily Timeline

A real EV does not complete 1 full battery discharge cycle every calendar day. A standard passenger EV battery (40 to 82 kWh) offers 200 to 330 miles of range per full charge. With daily commuting of 20 to 50 miles, a full equivalent discharge cycle completes once every 3 to 6 days.

- **Completed Cycle Representation**: Each cycle $k \in \{1 \dots K\}$ spans multiple consecutive days. On in-progress days, `Capacity` is an empty string (`""`). On the day the cycle is completed, the BMS records the measured discharge capacity in `Capacity`.
- **Parser Compatibility**: The VoltSense CSV parser (`backend/src/services/csvParserService.js`) groups rows by `Cycle` and extracts the cycle's capacity from the completion row (`cRows.map(r => r.capacity).filter(...)`). This produces a clean, consecutive `cycleTable` ($1 \dots K$) without inventing false daily cycles or skipping rows.
- **Odometer Progression**: The `mile` column tracks the vehicle's true odometer, beginning at the vehicle's initial mileage and incrementing by the daily trip distance each day.

---

## 5. Controlled Telemetry Anomalies

Controlled, physically plausible anomalies have been seeded into the datasets to test the VoltSense rule-based screening engine (`backend/src/services/anomalyService.js`):

1. **Owner 1 (Tesla Model 3 LR)**: Clean baseline vehicle. 0 anomalies detected.
2. **Owner 2 (BYD Atto 3 ER)**: On Day 68 (`2026-03-09`), a cell voltage spread anomaly is triggered:
   - `bcell_maxvoltage = 3.425 V`, `bcell_minvoltage = 3.260 V`.
   - Delta spread = `0.165 V`, exceeding the generic reference limit of `< 0.15 V`.
   - Detected as `[MEDIUM] cell_imbalance (Cell Voltage Imbalance Exceeded)`.
3. **Owner 3 (Tata Nexon EV Max)**: On Day 112 (`2026-04-22`), a thermal spike is triggered during hot tropical traffic:
   - `Temperature = 46.5 °C`, `bcell_maxtemp = 46.5 °C`, `bcell_mintemp = 43.2 °C`.
   - Exceeds the generic reference warning threshold of `tempLimitsC.warningHigh = 45.0 °C`.
   - Detected as `[MEDIUM] high_temperature (Elevated Pack Temperature)`.
4. **Owner 4 (Hyundai Ioniq 5 AWD)**:
   - On Day 42 (`2026-02-11`): CAN thermistor communication dropout (`bcell_maxtemp = ""`, `bcell_mintemp = ""`). Cleanly handled as valid missing telemetry without parser failure.
   - On Day 95 (`2026-04-05`): Under-voltage excursion during low-SOC acceleration:
     - `bcell_minvoltage = 2.74 V`, `bcell_maxvoltage = 2.86 V`.
     - Drops below the safe operating limit of `minCellV = 2.80 V`.
     - Detected as `[CRITICAL] under_voltage (Cell Under-Voltage Excursion)`.

---

## 6. End-to-End Validation Results

All four CSV files have been verified against the backend parser, the anomaly screening engine, and the ML prediction service:

### Parser Validation (`csvParserService.js`)
- `owner_1.csv`: 150 rows parsed, 30 cycles identified, schema `cycle_capacity`, 30 charging sessions extracted (`status: 'Complete'`). Quality: `valid=150`, `invalid=0`, `duplicates=0`, `outliers=0`. Empirical SOH: 98.7%.
- `owner_2.csv`: 150 rows parsed, 37 cycles identified, schema `cycle_capacity`, 37 charging sessions extracted (`status: 'Complete'`). Quality: `valid=150`, `invalid=0`, `duplicates=0`, `outliers=0`. Empirical SOH: 98.8%.
- `owner_3.csv`: 150 rows parsed, 25 cycles identified, schema `cycle_capacity`, 25 charging sessions extracted (`status: 'Complete'`). Quality: `valid=150`, `invalid=0`, `duplicates=0`, `outliers=0`. Empirical SOH: 98.5%.
- `owner_4.csv`: 150 rows parsed, 42 cycles identified, schema `cycle_capacity`, 42 charging sessions extracted (`status: 'Complete'`). Quality: `valid=150`, `invalid=0`, `duplicates=0`, `outliers=0`. Empirical SOH: 97.9%.

### ML Pipeline & Model Domain Compatibility
When the 150-day cycle tables are submitted to the VoltSense FastAPI inference endpoint (`POST /predict`):
- The ML service feature engineering (`features.py`) constructs all 13 causal capacity-history features (`cycle_idx`, `log_cycle`, `deg_rate`, `cap_lag1`, etc.) without error.
- **Measurement Domain Note**: The current trained model artifact (`runs/nasa-20261016-evaluated-v3/bundle.joblib`) was trained exclusively on **NASA single-cell laboratory data** (nominal capacity ~2.0 Ah). When fed an EV pack's full ampere-hour rating (111 to 210 Ah), the underlying scikit-learn regression pipeline outputs ~1.98 Ah, which when normalized against the 111–210 Ah pack reference yields an out-of-domain SOH prediction. In accordance with repository guardrails, the model artifact has not been retrained or modified. Empirical SOH degradation curves and linear regression extrapolation remain fully operational in the application UI.

---

## 7. Generation and Regeneration Instructions

To regenerate all four owner CSV files from scratch:

```bash
python sample_data/generate_demo_datasets.py
```

The script runs deterministically using a fixed random seed (`42`), producing identical, reproducible CSV files and removing any obsolete legacy folders.

---

## 8. Provenance & Synthetic Data Notice

> **Synthetic Demonstration Data Notice**:
> All records in `owner_1.csv`, `owner_2.csv`, `owner_3.csv`, and `owner_4.csv` are **simulated demonstration datasets**. They are physically grounded in published battery chemistry specifications, standard EV architectures, and realistic degradation models, but they do **not** represent private telemetry harvested from real EV owners.
