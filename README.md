# VoltSense — EV Battery Health & Remaining Useful Life Intelligence

VoltSense is a full-stack engineering application for Electric Vehicle (EV) owners and researchers. It provides accurate State of Health (SOH) and Remaining Useful Life (RUL) estimation using pre-trained machine learning models, an interactive 3D vehicle & battery pack visualizer, public charging station discovery, and Groq-powered natural language explanations.

---

## 1. System Architecture

- **Frontend**: React 18, Vite, Tailwind CSS, Three.js 3D engine, and Material Symbols.
- **Backend API**: Node.js, Express, Mongoose (MongoDB).
- **ML Inference Service**: Python FastAPI with pre-trained Scikit-Learn Random Forest and Gradient Boosting ensembles (`ml-service/`).
- **Explainable AI**: Groq API integration (LLaMA 3.3) through the backend, explaining authoritative predictions with a deterministic fallback when offline.
- **Charging Discovery**: Open Charge Map API (secured on backend) with OpenStreetMap Overpass fallback.
- **Virtual EV Simulator**: Built-in software-only virtual telemetry stream for live demonstrations without real hardware.

---

## 2. Machine Learning Pipeline & Provenance

- **Models Preserved**: The trained model artifacts in `ml-service/models/` (`capacity_model.pkl`, `soh_model.pkl`, `rul_model.pkl`) are loaded directly without retraining.
- **SOH Algorithm**: Capacity prediction followed by SOH calculation (`SOH = predicted_capacity / initial_capacity * 100`) using Gradient Boosting.
- **RUL Algorithm**: Random Forest + Gradient Boosting weighted ensemble predicting remaining full charge-discharge cycles before usable capacity drops to 80% SOH.
- **Feature Vector**: 14 engineered electrochemical features (`cycle_idx`, `log_cycle`, `cycle_squared`, `cycle_sqrt`, `cap_lag1`, `cap_lag2`, `cap_lag5`, `cap_roll3`, `cap_roll5`, `deg_rate`, `deg_rate5`, `initial_cap`, `cap_drop_pct`, `ambient_temperature`).
- **Inference Requirement**: At least 7 valid consecutive cycles are required for time-lag and rolling window features.

---

## 3. Supported File Formats & NASA Datasets

1. **NASA Battery Aging CSV (`.csv`)**:
   - Tabular files containing `Cycle`, `Capacity`, `Voltage_measured`, `Current_measured`, `Temperature_measured`, and `Time`.
MATLAB `.mat` and image/screenshot uploads are not supported.

---

## 4. Local Development & Setup

### Prerequisites
- Node.js 18+ (tested on Node v20/v25)
- Python 3.10+ (tested on Python 3.13)
- MongoDB running locally on port 27017

### Step 1: Start Python ML Service
```bash
cd ml-service
pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```
Health check: `http://127.0.0.1:8000/health`

### Step 2: Configure and Start Backend API
```bash
cd backend
npm install
# backend/.env is already included; edit it if needed
# Edit .env and set MONGODB_URI, JWT_SECRET, and optional OCM_API_KEY / GROQ_API_KEY
npm run dev
```
Seed demo user and vehicle:
```bash
npm run seed
```
Demo Credentials:
- **Email**: `reed.parmar@voltsense.io`
- **Password**: `VoltSense#2026`

### Step 3: Start Frontend Application
```bash
cd frontend
npm install
npm run dev
```
Open your browser at `http://localhost:5173`.

---

## 5. Automated Test Suites

### Backend Integration Tests (Jest + In-Memory MongoDB)
```bash
cd backend
npm test
```
All test suites pass:
- `auth.test.js` (User registration, login, JWT validation)
- `vehicles.test.js` (Vehicle CRUD, access control)
- `datasets.test.js` (CSV upload, rejection of unsupported files, validation, pipeline polling)
- `predictions.test.js` (Prediction retrieval, explainability `/explain` endpoint)
- `notifications.test.js` (Notification generation and read state)
- `errors.test.js` (404, rate limiting, and global error middleware)
- `health.test.js` (System status endpoints)

### Frontend Smoke Tests (Vitest)
```bash
cd frontend
npm run test:smoke
```

---

## 6. Security & Privacy Guarantees
- **No Client Secrets**: `OCM_API_KEY` and `GROQ_API_KEY` reside strictly on the backend.
- **Fail-Safe Fallbacks**: If external APIs are unavailable, deterministic offline engines handle charging (OpenStreetMap) and AI explanations without halting the core ML predictions.
- **Data Minimization**: Groq receives only structured numeric summary predictions and factors, never raw database records or personally identifiable user data.

## Quick start
1. MongoDB: `docker run -d -p 27017:27017 mongo:7` (or local service / Atlas; dev mode falls back to a temporary in-memory DB).
2. ML service: `cd ml-service && pip install -r requirements.txt && python -m uvicorn app:app --port 8000`
3. Backend: `cd backend && npm install && # backend/.env is already included; edit it if needed` (set JWT_SECRET) then `npm run dev`
4. Frontend: `cd frontend && npm install && npm run dev`
Demo: click "Open Demo Account" on the sign-in page (POST /api/auth/demo; disable with DEMO_ACCOUNT_ENABLED=false).
