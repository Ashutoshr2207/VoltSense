# VoltSense Application & Inference Setup Guide

## Overview

VoltSense provides end-to-end electric vehicle battery health intelligence, multi-cycle degradation tracking, remaining useful life (RUL) estimation, and telemetry anomaly diagnostics.

The inference pipeline connects the fitted candidate model (`nasa-20261016-candidate-v3`) directly to the primary user workflow: **Upload → Process → Predict**.

No special preview flags, local experimental overrides, or separate preview buttons are needed. The system computes real SOH, RUL cycles, and capacity, clearly labeling the result as an experimental research model until full prospective EV pack validation is completed.

---

## Prerequisites

- **Node.js**: v18+ with `npm`
- **Python**: v3.10+ (with virtual environment in `ml-service/.venv`)
- **MongoDB**: Local instance or MongoDB Atlas URI (configured in `backend/.env`)

---

## Quick Start (3 Terminals)

### Terminal 1: ML Inference Service
Runs FastAPI on `http://127.0.0.1:8000`. By default, it automatically loads the active V3 model (`runs/nasa-20261016-evaluated-v3/manifest.json`).

```powershell
cd R:\PP\VoltSense\ml-service
.\.venv\Scripts\Activate.ps1
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Verify service readiness:
```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```
Expected output:
```json
{
  "status": "ok",
  "models_loaded": true,
  "model": {
    "name": "VoltSense capacity history",
    "version": "nasa-20261016-candidate-v3",
    "algorithm": "capacity: GradientBoosting; RUL: RandomForest"
  },
  "experimental": true
}
```

### Terminal 2: Backend API
Runs Express on `http://localhost:5000`.

```powershell
cd R:\PP\VoltSense\backend
npm run dev
```

Required settings in `backend/.env`:
```ini
PORT=5000
NODE_ENV=development
MONGODB_URI=your_mongodb_connection_string
MONGODB_DATABASE=voltsense
JWT_SECRET=your_jwt_secret_min_32_chars
ML_SERVICE_URL=http://127.0.0.1:8000
```

Verify backend database and API readiness:
```powershell
Invoke-RestMethod http://localhost:5000/api/health
```
Expected output:
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "database": {
      "status": "connected",
      "connected": true
    }
  }
}
```

### Terminal 3: Frontend Web Client
Runs Vite on `http://localhost:5173`.

```powershell
cd R:\PP\VoltSense\frontend
npm run dev
```

Open your browser to: **`http://localhost:5173`**

---

## Primary User Workflow: Upload → Process → Predict

1. **Sign Up / Log In**:
   - Register a user account or log into an existing one.
2. **Create Vehicle Profile**:
   - On first login, add your vehicle profile (Manufacturer, Model, Year, Pack kWh).
3. **Upload Battery Telemetry**:
   - Navigate to **SOH & RUL** tab.
   - Click **Choose CSV / Excel** and select `sample-data/demo_battery_cycles.csv` (contains 40 multi-cycle discharge records).
   - Click **Upload & analyze**.
4. **Automated Pipeline Processing**:
   - The system validates schema, cleans data, checks outliers, engineers features, and calls the ML inference service.
   - Live stage indicators track progress: *Validating schema → Cleaning → Feature Engineering → Normalization → Predicting*.
5. **Review Health Intelligence**:
   - **State of Health (SOH)**: Usable capacity relative to baseline (e.g., 94.2% SOH).
   - **Remaining Useful Life (RUL)**: Estimated full discharge cycles to 80% EOL threshold (e.g., 45 cycles).
   - **Capacity Retention**: Current predicted capacity (1.88 Ah) vs brand new reference (2.00 Ah).
   - **3D Battery Pack**: Interactive pack architecture reflectively colored by current SOH.
   - **Telemetry Anomalies**: Pack voltage spreads, temperature ranges, and threshold excursion checks.
   - **Insights & History**: Past analyses, degradation trends, and explainable AI summaries are saved to the dashboard and history.

---

## Model Candidate & Inference Specifications

| Property | Value |
|---|---|
| **Active Model Version** | `nasa-20261016-candidate-v3` |
| **Capacity Estimator** | Fitted `GradientBoostingRegressor` with `StandardScaler` |
| **RUL Estimator** | Fitted `RandomForestRegressor` with `StandardScaler` |
| **Feature Contract** | `capacity-history-v2` (13 features strictly before cycle $t$) |
| **Observed-EOL Policy** | `observed-eol-terminal-v1` (Terminal 0 RUL guard if capacity has crossed 80% SOH) |
| **Artifact SHA-256** | `d0c845dccd6524850618ccc37503b92a8753b512e013b24d3c52725b4f59ff46` |
| **Input Eligibility** | Minimum 7 consecutive complete discharge cycles starting at cycle 1 |

---

## Error Handling & Recovery

| Scenario | What Happens | How to Recover |
|---|---|---|
| **ML Service Stopped** | Pipeline returns: *"ML inference service is unreachable at http://127.0.0.1:8000"* | Start the ML service in Terminal 1 and retry the upload. |
| **Trip Driving Log (No Cycles)** | Telemetry diagnostics and anomaly screening complete; SOH/RUL notice indicates: *"Trip driving cycle detected ... requires multi-cycle discharge capacity records"* | Normal expected behavior for non-cycle logs. Upload a multi-cycle dataset to evaluate SOH/RUL. |
| **Invalid Cycle Sequence** | Validation error: *"Inference requires complete consecutive discharge history beginning at cycle 1"* | Ensure CSV contains consecutive cycles 1, 2, 3... with positive discharge capacity. |
| **Database Disconnected** | Backend reports database connection failure | Verify `MONGODB_URI` in `backend/.env` and ensure database network access is allowed. |

---

## Limitations & Truthful Validation Disclaimer

1. **Research Candidate Model**: The active V3 model was trained and evaluated on laboratory battery degradation trajectories (NASA dataset). It has not undergone prospective validation across full EV pack architectures or diverse real-world driving/thermal profiles.
2. **Experimental Result Labeling**: SOH and RUL predictions are clearly flagged in the UI and database records as **Experimental Research Candidate**. They are not certified for automotive safety or warranty decisions.
3. **No Synthetic Fallback**: If the ML service is unavailable, VoltSense reports the actual error honestly; it never fabricates or simulates SOH/RUL numbers.
