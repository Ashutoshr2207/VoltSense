# VoltSense ⚡
### EV Battery State-of-Health & Remaining Useful Life Prediction Platform

VoltSense is a web-based EV battery intelligence platform that analyzes battery telemetry to estimate **State of Health (SOH)** and **Remaining Useful Life (RUL)**, visualize battery degradation, provide explainable diagnostic insights, and locate real nearby EV charging stations.

The platform combines a **React frontend**, **Node.js/Express backend**, **MongoDB**, and a **Python machine-learning pipeline** trained on the NASA Li-ion Battery Aging Dataset.

---

## 🚀 Key Features

### 🔋 Battery Health Analysis
Upload EV battery telemetry in CSV format and generate a battery diagnostic containing:

- State of Health (SOH)
- Remaining Useful Life (RUL)
- Current battery cycle
- Estimated End-of-Life cycle
- Battery degradation trend
- Temperature and voltage information
- Battery impedance indicators
- Diagnostic status
- Prediction confidence
- Historical prediction data

### 📊 SOH Prediction

VoltSense uses a **Random Forest Regressor** to estimate battery State of Health from telemetry and battery-cycle characteristics.

The model uses features such as:

- Cycle number
- Mean/min/max voltage
- Voltage range
- Mean/max current
- Mean/max temperature
- Discharge duration
- Ambient temperature
- Electrochemical resistance
- Battery impedance
- Rectified impedance

### ⏳ RUL Prediction

A **Gradient Boosting Regressor** estimates the number of remaining cycles before the battery reaches the configured End-of-Life threshold.

The current EOL threshold is:

```text
70% SOH
```

RUL is represented as the estimated number of remaining battery cycles until this threshold is reached.

### 🧠 Explainable Predictions

VoltSense does not only display a prediction.

The Battery Analysis interface also provides an explanation of factors contributing to the diagnostic, such as:

- Charge-cycle accumulation
- Thermal exposure
- Cell/battery balance variation
- Voltage behavior
- Resistance/impedance changes

This helps users understand the factors associated with the predicted battery condition.

### 📈 Historical Performance

The application stores prediction history and visualizes changes in battery health over time.

Users can inspect:

- Previous SOH predictions
- RUL estimates
- Battery degradation trends
- Prediction confidence
- Historical analysis records

### 📍 Real-Time Charging Station Map

VoltSense includes a charging-station map that uses:

- Browser geolocation
- OpenChargeMap API
- Backend API proxying

The application can retrieve **real nearby charging stations based on the user's current location**, rather than relying on hardcoded charging-station coordinates.

### 🚗 Single-EV Architecture

VoltSense is currently designed around **one personal EV per account** rather than fleet management.

Each account can configure one vehicle with information such as:

- Vehicle nickname
- Battery capacity
- VIN
- Initial SOH
- Initial cycle count

Battery-specific diagnostic information is subsequently derived from uploaded telemetry.

---

# 🏗️ System Architecture

```text
                    ┌─────────────────────┐
                    │      User / EV      │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   React Frontend    │
                    │     Vite + CSS      │
                    └──────────┬──────────┘
                               │
                         REST API / JSON
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Node.js + Express   │
                    │     Backend API     │
                    └──────┬───────┬──────┘
                           │       │
                ┌──────────┘       └──────────────┐
                ▼                                 ▼
       ┌─────────────────┐              ┌──────────────────┐
       │    MongoDB      │              │ Python ML Layer  │
       │                 │              │                  │
       │ Users           │              │ Preprocessing    │
       │ Vehicles        │              │ SOH Model        │
       │ Datasets        │              │ RUL Model        │
       │ Predictions     │              │ Feature          │
       │ Insights        │              │ Engineering      │
       │ Notifications   │              └──────────────────┘
       └─────────────────┘
                          

                    Charging Station Flow
                           
       Browser Geolocation
                │
                ▼
       React Charging Map
                │
                ▼
       Express Backend
                │
                ▼
       OpenChargeMap API
                │
                ▼
       Real Nearby Charging Stations
```

---

# 🛠️ Technology Stack

## Frontend

| Technology | Purpose |
|---|---|
| React 18 | User interface |
| Vite | Frontend build/development environment |
| Tailwind CSS | Styling |
| JavaScript / JSX | Application logic |
| Browser Geolocation API | User location |
| REST APIs | Backend communication |

## Backend

| Technology | Purpose |
|---|---|
| Node.js | Server runtime |
| Express.js | REST API |
| MongoDB / Mongoose | Database |
| JWT | Authentication |
| Multer | CSV/file uploads |
| Helmet | HTTP security |
| CORS | Cross-origin communication |
| Jest | Backend testing |
| Supertest | API testing |

## Machine Learning

| Technology | Purpose |
|---|---|
| Python | ML pipeline |
| Pandas | Data processing |
| NumPy | Numerical processing |
| Scikit-learn | Machine-learning models |
| Joblib | Model persistence |
| Random Forest | SOH prediction |
| Gradient Boosting | RUL prediction |

## External Data

| Service | Purpose |
|---|---|
| NASA Li-ion Battery Aging Dataset | Model training/evaluation |
| OpenChargeMap | Real charging-station data |

---

# 🧠 Machine Learning Pipeline

VoltSense's ML pipeline is located in:

```text
ml/
├── data/
│   ├── nasa_battery_cycles.csv
│   └── test_sample.csv
│
├── models/
│   ├── soh_model.joblib
│   ├── rul_model.joblib
│   └── model_metadata.json
│
├── preprocess.py
├── train.py
├── predict.py
├── evaluation_results.json
├── requirements.txt
└── README.md
```

## Dataset

The models are trained using the **NASA Randomized Li-ion Battery Aging Dataset**.

The processed dataset contains approximately:

```text
2,551 battery-cycle records
33 batteries
```

The data includes battery measurements covering voltage, current, temperature, discharge capacity, impedance and cycle information.

---

# 📐 SOH Model

The SOH model uses:

```text
RandomForestRegressor
```

Configuration:

```text
n_estimators = 120
max_depth    = 14
```

SOH is based on the relationship between current battery capacity and the initial reference capacity:

```text
SOH = (Current Capacity / Initial Capacity) × 100
```

The machine-learning model additionally considers electrical, thermal and cycle-level features.

### SOH Test Performance

The held-out battery test set achieved approximately:

| Metric | Result |
|---|---:|
| MAE | 3.04% |
| RMSE | 4.52% |
| R² | 0.729 |

The test evaluation was performed on previously unseen battery groups rather than randomly mixing cycles from the same battery between training and testing.

---

# 📉 RUL Model

The RUL model uses:

```text
GradientBoostingRegressor
```

Configuration:

```text
n_estimators = 150
learning_rate = 0.08
max_depth = 5
```

The model estimates remaining battery cycles before reaching:

```text
EOL SOH = 70%
```

### RUL Test Performance

| Metric | Result |
|---|---:|
| MAE | 19.55 cycles |
| RMSE | 24.61 cycles |
| R² | 0.790 |

These metrics represent evaluation on the held-out battery test set in the included ML experiment.

---

# 🔄 Prediction Workflow

The main VoltSense workflow is:

```text
1. User signs in
        ↓
2. User configures EV
        ↓
3. User uploads telemetry CSV
        ↓
4. Backend validates upload
        ↓
5. Dataset processing starts
        ↓
6. Telemetry is cleaned
        ↓
7. Features are extracted
        ↓
8. ML models generate predictions
        ↓
9. SOH + RUL are calculated
        ↓
10. Degradation curve is generated
        ↓
11. Diagnostic insights are generated
        ↓
12. Results are stored
        ↓
13. Frontend displays battery analysis
```

---

# 📄 Telemetry CSV Format

The application supports telemetry containing battery-cycle information.

A typical input can contain fields such as:

```csv
cycle,step,voltage_v,current_a,temperature_c,impedance_mohm,capacity_ah
1,1,4.12,2.1,25.4,42.5,2.91
1,2,4.08,2.2,25.8,42.8,2.89
2,1,4.11,2.0,26.1,43.0,2.87
```

The exact features required for ML prediction depend on the preprocessing and prediction pipeline.

---

# 📁 Project Structure

```text
VoltSense/
│
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   └── server.js
│   │
│   ├── scripts/
│   ├── tests/
│   ├── uploads/
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── context/
│   │   ├── pages/
│   │   ├── App.jsx
│   │   └── main.jsx
│   │
│   ├── public/
│   ├── package.json
│   └── vite.config.js
│
├── ml/
│   ├── data/
│   ├── models/
│   ├── preprocess.py
│   ├── train.py
│   ├── predict.py
│   ├── requirements.txt
│   └── README.md
│
├── docs/
│   ├── architecture.md
│   ├── api-reference.md
│   ├── api-specification.md
│   ├── data-dictionary.md
│   ├── data-flow.md
│   ├── database-schema.md
│   ├── ml-architecture.md
│   ├── deployment.md
│   └── ...
│
└── README.md
```

---

# ⚙️ Installation

## Prerequisites

Install the following before running VoltSense:

- Node.js
- npm
- Python 3.11+
- MongoDB / MongoDB Atlas
- Git

Verify the installations:

```bash
node --version
npm --version
python --version
```

---

# 🔧 Backend Setup

Open a terminal in the backend directory:

```bash
cd backend
```

Install dependencies:

```bash
npm install
```

Create the environment file:

```bash
cp .env.example .env
```

On Windows PowerShell, you can instead copy it manually:

```powershell
Copy-Item .env.example .env
```

Configure the required environment variables:

```env
PORT=5000
NODE_ENV=development

MONGODB_URI=your_mongodb_connection_string
MONGODB_DATABASE=voltsense

JWT_SECRET=your_secure_secret
JWT_EXPIRES_IN=7d

CORS_ORIGIN=http://localhost:5173

ML_SERVICE_URL=http://localhost:8000
MAX_FILE_SIZE_MB=50
```

Start the backend:

```bash
npm run dev
```

The backend runs by default at:

```text
http://localhost:5000
```

---

# 🎨 Frontend Setup

Open another terminal:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The frontend runs by default at:

```text
http://localhost:5173
```

The frontend communicates with the backend through the configured API base URL.

---

# 🤖 Machine Learning Setup

From the project root:

```bash
cd ml
```

Install Python dependencies:

```bash
pip install -r requirements.txt
```

## Preprocess Dataset

```bash
python preprocess.py
```

## Train Models

```bash
python train.py
```

The trained models are saved under:

```text
ml/models/
```

including:

```text
soh_model.joblib
rul_model.joblib
```

## Run a Prediction

```bash
python predict.py --file path/to/telemetry.csv --eol 70
```

The prediction pipeline returns information including:

```text
SOH
RUL
Cycle count
Record count
Historical degradation
Predicted degradation
```

---

# 🗺️ Charging Station Integration

VoltSense uses browser geolocation to determine the user's approximate current location.

The flow is:

```text
Browser
   ↓
Geolocation API
   ↓
Latitude + Longitude
   ↓
VoltSense Backend
   ↓
OpenChargeMap
   ↓
Nearby Charging Stations
   ↓
Charging Map
```

The frontend does not rely on a permanently hardcoded list of charging stations.

Location access must be permitted by the browser for the nearby-station feature to work correctly.

---

# 🔐 Security

VoltSense includes several application-level security mechanisms:

- JWT-based authentication
- Password hashing
- Environment-variable configuration
- CORS configuration
- Helmet security middleware
- File-upload validation
- File-size limits
- Backend authorization middleware
- Separation of frontend and backend secrets

### Important

Never commit the following to Git:

```text
.env
MongoDB passwords
JWT secrets
API keys
Cloud credentials
Private tokens
```

Use:

```text
.env.example
```

to document required configuration without exposing actual credentials.

---

# 🧪 Testing

Backend tests can be executed with:

```bash
cd backend
npm test
```

The backend test stack includes:

- Jest
- Supertest
- MongoDB Memory Server

Frontend production build:

```bash
cd frontend
npm run build
```

Preview the production build:

```bash
npm run preview
```

---

# 📚 API Overview

The backend exposes REST APIs for:

```text
Authentication
     │
     ├── Sign in
     └── User management
     
Vehicle
     │
     └── EV configuration

Dataset
     │
     ├── Upload telemetry
     ├── Process dataset
     └── Check processing status

Predictions
     │
     ├── SOH
     ├── RUL
     ├── Degradation
     └── Historical predictions

Insights
     │
     └── Explainable battery diagnostics

Charging
     │
     └── Nearby charging stations

Notifications
     │
     └── User notifications
```

Detailed API contracts are available in:

```text
docs/api-specification.md
docs/api-reference.md
```

---

# ⚠️ Current Scope & Limitations

VoltSense is currently a development/research project rather than a production automotive diagnostic system.

Important limitations include:

1. Predictions are based on the available dataset and trained models.
2. The primary training/evaluation dataset is the NASA Li-ion Battery Aging Dataset.
3. NASA laboratory battery data does not represent every EV battery chemistry, vehicle platform, climate or driving condition.
4. Model predictions should therefore be treated as estimates rather than certified battery diagnostics.
5. The current system is designed around a single EV per account.
6. True per-cell telemetry is not currently stored as a complete time-series dataset by the application.
7. Some user settings are currently local-only.
8. Charging-station availability depends on external OpenChargeMap data and browser location permission.
9. Cloud deployment infrastructure described in the documentation is not required for local development.
10. A production deployment would require additional monitoring, security hardening, model validation and automotive-domain validation.

---

# 🔮 Future Improvements

Potential future development includes:

- Real-time BMS telemetry ingestion
- CAN-bus integration
- Additional EV battery datasets
- Battery-chemistry-specific models
- More advanced time-series models
- Improved uncertainty estimation
- Real-time battery monitoring
- Cell-level diagnostics
- Automated model retraining
- Model version management
- Cloud deployment
- Production monitoring
- More charging-station metadata
- Charging-route optimization
- Battery degradation forecasting under different usage conditions

---

# 📊 Project Highlights

VoltSense demonstrates an end-to-end workflow combining:

```text
Web Development
       +
REST APIs
       +
Database Management
       +
Data Processing
       +
Machine Learning
       +
Battery Analytics
       +
Explainable Diagnostics
       +
Geolocation
       +
Real Charging-Station Data
```

The core objective is to transform raw EV battery telemetry into understandable battery-health information that can support monitoring and maintenance decisions.

---

# 👩‍💻 Development

VoltSense is structured as a modular application so that the frontend, backend, data-processing logic and machine-learning components can evolve independently.

The main development areas are:

```text
frontend/   → User experience and visualization
backend/    → API, authentication and application logic
ml/         → Data preprocessing, training and inference
docs/       → Architecture and technical specifications
```

---
