# VoltSense Machine Learning Pipeline: NASA Li-ion Battery Diagnostics

This directory contains the end-to-end Machine Learning pipeline for State of Health (SOH) estimation and Remaining Useful Life (RUL) forecasting in the VoltSense platform, trained and evaluated on the official NASA Randomized Battery Aging Dataset.

---

## 1. Dataset Used
- **Source**: NASA Prognostics Center of Excellence (PCoE) Li-ion Battery Aging Dataset (`archive.zip`).
- **Cells**: Comprises 34 cylindrical commercial 18650 Li-ion batteries (B0005 through B0056) subjected to repeated operational profiles (charge, discharge, and electrochemical impedance spectroscopy) under varying ambient temperatures (4°C, 24°C, 43°C).
- **Records**: 7,565 operations across 34 batteries containing 2,794 discharge cycles, 2,815 charge cycles, and 1,956 impedance sweeps.

---

## 2. Dataset Preprocessing (`preprocess.py`)
1. **Extraction**: Inspects `cleaned_dataset/metadata.csv` and cross-correlates discharge operations with their measured `Capacity` (Ah) and impedance parameters (`Re`, `Rct`).
2. **Cleaning**: Filters unphysical/infinite values; isolates valid battery discharge capacities between 0.4 Ah and 3.0 Ah.
3. **Sequential Alignment**: Reconstructs sequential cycle indices (1..N) per battery preserving temporal order.
4. **Output Tabular Set**: Produces `ml/data/nasa_battery_cycles.csv` containing 2,551 verified cycle records across 33 batteries with zero missing target values.

---

## 3. Extracted Features
The cycle features represent physically observable BMS telemetry:
- `cycle`: Cumulative cycle index.
- `discharge_capacity`: Measured discharge capacity (Ah).
- `initial_capacity`: Reference capacity from the initial discharge cycles (Ah).
- `soh`: Ground truth state of health: $\text{SOH} = \frac{\text{discharge\_capacity}}{\text{initial\_capacity}} \times 100\%$.
- `mean_voltage`, `min_voltage`, `max_voltage`, `voltage_range`: Terminal voltage statistics during discharge.
- `mean_current`, `max_current`: Discharge current magnitude.
- `mean_temperature`, `max_temperature`: Cell thermal response (°C).
- `discharge_duration`: Cutoff duration from discharge onset to terminal cutoff voltage (seconds).
- `ambient_temperature`: Environmental test temperature (°C).
- `Re`, `Rct`: Estimated electrolyte and charge transfer resistance from EIS sweeps (Ω).
- `battery_impedance`, `rectified_impedance`: Magnitude of raw and rectified impedance (Ω).

---

## 4. SOH Methodology
1. **Baseline**: Deterministic ratio of the current discharge capacity relative to initial reference capacity:
   $$\text{SOH}_{\text{baseline}} = \min\left(100, \frac{C_{\text{current}}}{C_{\text{initial}}} \times 100\right)$$
2. **Machine Learning Model**: **Random Forest Regressor** (`n_estimators=120`, `max_depth=14`) trained on voltage curve statistics, discharge duration, thermal response, and impedance. Captures nonlinear degradation slopes and capacity recovery knees without overfitting.

---

## 5. RUL Methodology
1. **EOL Threshold**: Defined in configuration as $\text{EOL\_SOH\_THRESHOLD} = 70.0\%$.
2. **Ground Truth RUL**: Defined as:
   $$\text{RUL} = \max(0, \text{Cycle}_{\text{EOL}} - \text{Cycle}_{\text{current}})$$
3. **Machine Learning Model**: **Gradient Boosting Regressor** (`n_estimators=150`, `learning_rate=0.08`, `max_depth=5`) predicting remaining cycles until terminal 70% SOH is reached.

---

## 6. Train / Test Split Strategy
- **Group-Based Battery Partition**: To strictly prevent cross-cycle temporal leakage, the dataset is split by **Battery ID** rather than random cycle sampling:
  - **Train Set (2,117 cycles)**: 29 batteries (B0005, B0006, B0025–B0040, B0043–B0047, etc.).
  - **Held-Out Test Set (434 cycles)**: 4 unseen batteries (`B0007`, `B0018`, `B0042`, `B0048`) covering distinct degradation regimes.

---

## 7. Evaluation Metrics
Evaluated on the held-out test batteries (`B0007`, `B0018`, `B0042`, `B0048`):

| Model | Algorithm | Test MAE | Test RMSE | Test $R^2$ |
| :--- | :--- | :--- | :--- | :--- |
| **SOH Regressor** | Random Forest Regressor | **3.04%** | **4.52%** | **0.729** |
| **RUL Regressor** | Gradient Boosting Regressor | **19.55 cycles** | **24.61 cycles** | **0.790** |

---

## 8. How to Retrain
Run the following commands from the project root:
```bash
# 1. Preprocess raw NASA dataset from archive.zip
python ml/preprocess.py

# 2. Train models and save artifacts to ml/models/
python ml/train.py
```

---

## 9. How the Backend Calls the Model
The Node.js backend (`backend/src/services/pipelineSimulationService.js`) invokes `ml/predict.py` as a child process:
```javascript
const { execFile } = require('child_process');
execFile('python', ['ml/predict.py', '--file', storedFilePath, '--eol', '70'], (err, stdout) => {
  const result = JSON.parse(stdout);
  // Returns real ML prediction, degradation curve, and confidence
});
```
If Python is not available in a minimal container environment, the service seamlessly falls back to the deterministic electrochemical rule engine (`latestCapacity / initialCapacity * 100` and linear RUL extrapolation).

---

## 10. How to Run Predictions via CLI
```bash
python ml/predict.py --file path/to/telemetry.csv --eol 70
```
Outputs JSON with `soh`, `rul`, `degradation.historical`, `degradation.predicted`, `cycleCount`, and `recordCount`.
