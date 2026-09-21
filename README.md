# VoltSense

VoltSense is a full-stack EV battery diagnostics platform. It estimates a
vehicle's **State of Health (SOH)** and **Remaining Useful Life (RUL)** from
uploaded battery management system (BMS) telemetry, explains *why* the
number came out the way it did, tracks performance history over time, and
surfaces nearby charging stations.

The project has three parts that run independently:

| Part       | Tech                                   | Purpose                                                             |
|------------|-----------------------------------------|----------------------------------------------------------------------|
| `frontend` | React 18 + Vite + Tailwind CSS         | Dashboard, upload UI, charts, charging map                          |
| `backend`  | Node.js + Express + MongoDB (Mongoose) | REST API, auth, dataset processing pipeline, orchestration           |
| `ml`       | Python (scikit-learn, pandas, numpy)   | Trained SOH/RUL models, invoked by the backend as a subprocess       |

---

## 1. Architecture at a glance

```
┌─────────── ─┐        REST API (JWT)         ┌─────────────┐
│  frontend   │  ───────────────────────────▶│   backend   │
│ (React/Vite)│ ◀─────────────────────────── │ (Express/   │
└─────────── ─┘                              |   MongoDB)   |
                                              ──────┬───────┘
                                                     │ execFile('python', ['ml/predict.py', ...])
                                                     ▼
                                              ┌───────────── ─┐
                                              │ ml/predict.py │
                                              │ (RandomForest │
                                              │  + GradBoost) │
                                              └────────────── ┘
```

- The frontend calls the backend's REST API only — it never touches Mongo or
  Python directly.
- When a dataset is uploaded and processing is triggered, the backend runs
  `ml/predict.py` as a child process against the stored CSV. If Python isn't
  available in the environment, it automatically falls back to a
  deterministic rule-based estimate (`latestCapacity / initialCapacity * 100`
  and linear RUL extrapolation) so the app still works end-to-end without a
  Python runtime.
- Charging station data comes from the free, keyless OpenChargeMap API,
  proxied through the backend.

More detail on each piece lives in [`docs/`](docs/) — see
[`docs/architecture.md`](docs/architecture.md),
[`docs/data-flow.md`](docs/data-flow.md), and
[`docs/api-reference.md`](docs/api-reference.md).

---

## 2. Prerequisites

Install these before you start:

- **Node.js** 18+ and npm (for both `frontend` and `backend`)
- **MongoDB** — either a local install (`mongod`) or a free cloud cluster
  (e.g. MongoDB Atlas). You'll need a connection string either way.
- **Python** 3.9+ with `pip` — only required if you want real ML predictions
  instead of the rule-based fallback (see §5)

---

## 3. Running the backend

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and fill in at minimum:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/voltsense   # or your Atlas connection string
MONGODB_DATABASE=voltsense
JWT_SECRET=replace-with-a-real-secret              # e.g. run: openssl rand -base64 48
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:5173
MAX_FILE_SIZE_MB=50
ML_SERVICE_URL=http://localhost:8000
```

Then seed a demo account and start the server:

```bash
npm run seed     # creates a demo user + one EV with sample history
npm run dev      # starts on http://localhost:5000
```

**Demo login** (created by `npm run seed`):
```
Email:    reed.parmar@voltsense.io
Password: VoltSense#2026
```

Re-running `npm run seed` wipes and recreates this same demo account — safe
to run repeatedly during development.

### Backend tests
```bash
cd backend
npm test
```
Uses `mongodb-memory-server`, which downloads a local MongoDB binary the
first time you run it — make sure you have internet access for that first
run.

---

## 4. Running the frontend

```bash
cd frontend
npm install
npm run dev      # starts on http://localhost:5173
```

The frontend talks to the backend at whatever `VITE_API_URL` is set to
(default `http://localhost:5000/api`). Check/create `frontend/.env` if you
need to point it elsewhere:

```env
VITE_API_URL=http://localhost:5000/api
```

To build a production bundle:
```bash
npm run build      # outputs to frontend/dist
npm run preview    # serves the production build locally
```

---

## 5. Running the ML pipeline (optional but recommended)

The backend can produce predictions without Python (see the rule-based
fallback above), but for real model output you'll want the trained models
in place.

```bash
cd ml
pip install -r requirements.txt
```

The trained models (`rul_model.joblib`, `soh_model.joblib`) are already
included in `ml/models/`, so no training is required to just run
predictions:

```bash
python ml/predict.py --file path/to/telemetry.csv --eol 70
```

This prints JSON with `soh`, `rul`, `degradation.historical`,
`degradation.predicted`, `cycleCount`, and `recordCount`. The backend calls
this same script automatically when you upload and process a dataset
through the app — see `backend/src/services/pipelineSimulationService.js`.

**To retrain from scratch** (uses the NASA Li-ion Battery Aging dataset):
```bash
python ml/preprocess.py   # rebuilds ml/data/nasa_battery_cycles.csv
python ml/train.py        # retrains and overwrites ml/models/*.joblib
```

Model performance on held-out test batteries:

| Model | Algorithm | Test MAE | Test RMSE | Test R² |
|---|---|---|---|---|
| SOH Regressor | Random Forest Regressor | 3.04% | 4.52% | 0.729 |
| RUL Regressor | Gradient Boosting Regressor | 19.55 cycles | 24.61 cycles | 0.790 |

Full methodology, feature list, and dataset details are in
[`ml/README.md`](ml/README.md).

---

## 6. Using the app once it's running

1. Go to `http://localhost:5173` and sign in with the demo credentials above
   (or register a new account).
2. Each account manages exactly **one EV** — set it up with a nickname,
   battery capacity, and optional VIN/starting SOH.
3. Go to **Upload Data** and either upload a real BMS telemetry CSV or click
   **Load Sample BMS Log** to generate and upload a synthetic one.
4. The dataset progresses through `queued → validating → cleaning →
   feature engineering → normalization → complete`, polled automatically by
   the frontend every 1.5s.
5. Once complete, view:
   - **Battery Analysis** — SOH/RUL prediction plus an explainable
     breakdown of contributing factors
   - **Prediction History / Performance Dashboard** — SOH trend over time
     from your real prediction history
   - **Charging Map** — nearby charging stations based on your browser's
     geolocation

### Expected CSV format
Telemetry CSVs are expected to have charge/discharge/impedance-cycle
columns:
```
cycle, step, voltage_v, current_a, temperature_c, impedance_mohm, capacity_ah
```

---

## 7. API overview

All routes are prefixed with `/api`. Full request/response shapes are in
[`docs/api-reference.md`](docs/api-reference.md) and
[`docs/api-specification.md`](docs/api-specification.md).

| Method | Route | Description |
|---|---|---|
| POST | `/auth/register` | Create an account |
| POST | `/auth/login` | Log in, receive a JWT |
| GET | `/auth/me` | Get the current user |
| POST | `/auth/logout` | Log out |
| GET | `/users/me` | Get profile |
| PATCH | `/users/me` | Update profile |
| GET | `/vehicles` | List your vehicle(s) |
| POST | `/vehicles` | Create your EV (one per account) |
| GET \| PATCH \| DELETE | `/vehicles/:vehicleId` | Get, update, or delete your EV |
| GET | `/vehicles/:vehicleId/datasets` | List uploaded datasets |
| POST | `/vehicles/:vehicleId/datasets` | Upload a telemetry CSV |
| GET | `/vehicles/:vehicleId/predictions` | List predictions for the vehicle |
| GET \| DELETE | `/datasets/:datasetId` | Get or delete a dataset |
| POST | `/datasets/:datasetId/process` | Kick off the processing pipeline |
| GET | `/datasets/:datasetId/status` | Poll processing status |
| GET | `/predictions/:predictionId` | Get a prediction |
| GET | `/predictions/:predictionId/analysis` | Get the structured explainability breakdown |
| GET | `/predictions/:predictionId/insights` | Get AI-generated recommendations |
| GET | `/notifications` | List notifications |
| PATCH | `/notifications/:notificationId/read` | Mark a notification read |
| GET | `/charging-stations` | Nearby charging stations (OpenChargeMap proxy) |
| GET | `/health` | Health check |

All routes except `/auth/*`, `/health`, and `/charging-stations` require a
`Bearer` JWT from `/auth/login`.

---

## 8. Project structure

```
VoltSense-final/
├── frontend/          React + Vite app
│   └── src/
│       ├── api/         API client functions
│       ├── components/  Shared UI (layout, modals, etc.)
│       ├── context/     App-wide React context
│       ├── pages/       Dashboard, Battery Analysis, Charging Map, etc.
│       └── utils/
├── backend/           Express + MongoDB API
│   └── src/
│       ├── config/
│       ├── controllers/
│       ├── middleware/
│       ├── models/
│       ├── routes/
│       ├── services/    Includes pipelineSimulationService.js (ML orchestration)
│       ├── utils/
│       └── validators/
├── ml/                Python ML pipeline
│   ├── data/           Preprocessed NASA battery dataset
│   ├── models/         Trained .joblib models
│   ├── preprocess.py
│   ├── train.py
│   └── predict.py
└── docs/              In-depth design docs (architecture, data flow, schema, etc.)
```

See [`docs/project-structure.md`](docs/project-structure.md) for a fuller
breakdown and [`docs/naming-conventions.md`](docs/naming-conventions.md) for
conventions used throughout the codebase.

---

