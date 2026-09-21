# VoltSense ⚡

### EV Battery Health Monitoring, SOH & RUL Prediction Platform

VoltSense is a web-based EV battery monitoring platform designed to analyze battery telemetry, estimate **State of Health (SOH)** and **Remaining Useful Life (RUL)**, visualize battery degradation, provide battery-health insights, maintain prediction history, and help users find nearby EV charging stations.

The project combines a **React + Vite frontend**, **Node.js + Express backend**, **MongoDB**, and a separate **Python machine-learning pipeline** based on the NASA Randomized Li-ion Battery Aging Dataset.

VoltSense is currently designed around a **single personal EV**, rather than fleet management.

---

## ✨ Features

### 🔋 Battery Health Monitoring

VoltSense provides a central dashboard for monitoring the health of a connected EV battery.

The application can display:

- Current State of Health (SOH)
- Remaining Useful Life (RUL)
- Battery cycle information
- Battery degradation
- Estimated battery condition
- Prediction history
- Battery-health insights
- Notifications related to the vehicle

---

## 📂 Telemetry Dataset Upload

Users can upload battery telemetry data through the application.

The current telemetry workflow supports CSV data containing battery-cycle measurements such as:

```text
cycle
step
voltage_v
current_a
temperature_c
impedance_mohm
capacity_ah
```

The upload flow is:

```text
CSV Upload
    ↓
Dataset Creation
    ↓
Dataset Validation
    ↓
Dataset Processing
    ↓
Feature Processing
    ↓
Prediction Generation
    ↓
Battery Analysis
    ↓
Prediction History
```

VoltSense also includes a **Load Sample BMS Log** option that generates a synthetic telemetry CSV for testing the application's upload and analysis workflow.

---

# 🧠 Battery Prediction

VoltSense has two separate aspects related to machine learning.

### Current application pipeline

The currently connected Node.js application uses a **deterministic/rule-based prediction simulation** in:

```text
backend/src/services/pipelineSimulationService.js
```

This allows the complete application workflow to function without requiring the Python ML service to be running.

The simulated pipeline generates:

- SOH
- RUL
- Confidence
- Degradation information
- Loss/contribution breakdown
- Battery-health insights
- Recommendations

This is the prediction implementation currently wired into the web application's processing flow.

### Separate Python ML pipeline

The project also contains a dedicated machine-learning implementation in:

```text
ml/
```

This pipeline contains:

```text
preprocess.py
train.py
predict.py
evaluation_results.json
requirements.txt
```

The ML pipeline is based on the NASA Randomized Li-ion Battery Aging Dataset and contains trained models for SOH and RUL prediction.

---

# 🤖 Machine Learning Pipeline

## Dataset

The Python ML pipeline uses the:

**NASA Randomized Li-ion Battery Aging Dataset**

The preprocessing pipeline produces:

```text
ml/data/nasa_battery_cycles.csv
```

The processed dataset contains approximately:

```text
2,551 battery-cycle records
33 batteries
```

The evaluation configuration uses:

```text
Training batteries: 29
Testing batteries: 4

Test batteries:
B0007
B0018
B0042
B0048
```

The End-of-Life threshold used by the ML pipeline is:

```text
70% SOH
```

---

# 🔬 SOH Prediction Model

The ML implementation uses:

```text
RandomForestRegressor
```

The SOH model uses battery-cycle and telemetry-related features including:

- Cycle
- Mean voltage
- Minimum voltage
- Maximum voltage
- Voltage range
- Mean current
- Maximum current
- Mean temperature
- Maximum temperature
- Discharge duration
- Ambient temperature
- Re
- Rct
- Battery impedance
- Rectified impedance

The SOH ground truth is based on:

```text
SOH = (Discharge Capacity / Initial Capacity) × 100
```

### SOH evaluation

The included evaluation results report:

| Metric | Test Result |
|---|---:|
| MAE | 3.04 |
| RMSE | 4.52 |
| R² | 0.729 |

These values are from the included ML evaluation and should not be interpreted as guaranteed performance on real-world EV batteries.

---

# ⏳ RUL Prediction Model

The ML pipeline uses:

```text
GradientBoostingRegressor
```

for Remaining Useful Life estimation.

The RUL model uses features including:

- Cycle
- SOH
- Discharge capacity
- Mean voltage
- Minimum voltage
- Maximum voltage
- Voltage range
- Mean temperature
- Maximum temperature
- Discharge duration
- Ambient temperature
- Re
- Rct

RUL is expressed as an estimated number of remaining battery cycles until the configured:

```text
70% SOH
```

End-of-Life threshold.

### RUL evaluation

The included evaluation results report:

| Metric | Test Result |
|---|---:|
| MAE | 19.55 cycles |
| RMSE | 24.61 cycles |
| R² | 0.790 |

---

# 📊 Explainable Battery Predictions

VoltSense includes an explanation section on the Battery Analysis page.

Instead of only displaying a numerical prediction, the application provides a breakdown of factors associated with the battery-health result.

Examples include:

- Charge-cycle accumulation
- Thermal exposure
- Cell-balance drift
- Battery degradation factors

The currently connected application implementation generates these explanations through the backend prediction/insight pipeline.

---

# 📈 Historical Performance

VoltSense maintains prediction history for the user's EV.

The Performance History page can display the user's actual prediction records rather than relying on a permanently hardcoded chart.

The history can be used to observe:

- SOH changes
- RUL changes
- Battery degradation
- Prediction progression
- Previous analysis results

This allows users to monitor battery-health trends across multiple uploaded datasets.

---

# 📍 Charging Station Finder

VoltSense includes a **Charging Map** page for finding nearby EV charging stations.

### How it works

The application can obtain the user's location through:

```text
Browser Geolocation
        ↓
Latitude + Longitude
        ↓
VoltSense Charging Search
        ↓
OpenStreetMap location data
        ↓
Nearby charging stations
```

The current implementation uses public OpenStreetMap services such as:

- Nominatim
- Overpass

The frontend also uses an OpenStreetMap map embed.

### Important

VoltSense does **not** require a charging-service API key for its primary charging-station search.

There is also fallback code for OpenChargeMap if an appropriate API key is configured, but the normal charging-station flow is based on OpenStreetMap data.

The application does **not** use a permanently hardcoded list of fake charging stations for the nearby-station search.

Users can:

- Use live browser GPS
- Enter a location/address
- Search within a configurable radius
- View nearby charging stations
- See station information and distance
- View the location on the map

---

# 🚗 Single-EV Design

VoltSense is intentionally designed for **one EV per user account**.

The application does not currently implement fleet management.

The vehicle setup includes information such as:

- EV nickname
- Battery capacity
- VIN
- Initial SOH
- Initial cycle count

Additional battery-health information is generated through telemetry analysis.

---

# 🏗️ Architecture

```text
                         ┌──────────────────────┐
                         │        User          │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │   React + Vite       │
                         │     Frontend         │
                         └──────────┬───────────┘
                                    │
                              REST Requests
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │ Node.js + Express    │
                         │      Backend         │
                         └──────┬───────┬───────┘
                                │       │
                    ┌───────────┘       └────────────┐
                    ▼                                ▼
           ┌─────────────────┐             ┌──────────────────┐
           │     MongoDB     │             │ Prediction /     │
           │                 │             │ Processing       │
           │ Users           │             │ Pipeline         │
           │ Vehicles        │             └──────────────────┘
           │ Datasets        │
           │ Predictions     │
           │ Insights        │
           │ Notifications   │
           └─────────────────┘

                         Separate ML Pipeline
                                │
                                ▼
                         ┌──────────────────┐
                         │      Python      │
                         │        ML        │
                         ├──────────────────┤
                         │ Preprocessing    │
                         │ SOH Model        │
                         │ RUL Model        │
                         │ Evaluation       │
                         └──────────────────┘

                         Charging Map
                                │
                                ▼
                      Browser Geolocation
                                │
                                ▼
                       OpenStreetMap Data
```

---

# 🛠️ Technology Stack

## Frontend

- React 18
- Vite
- JavaScript / JSX
- Tailwind CSS
- Browser Geolocation API
- REST API communication
- OpenStreetMap map integration

## Backend

- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT authentication
- bcryptjs
- Multer
- Helmet
- CORS
- Jest
- Supertest

## Machine Learning

- Python
- Pandas
- NumPy
- Scikit-learn
- Joblib
- Random Forest Regression
- Gradient Boosting Regression

## External Location Data

- OpenStreetMap
- Nominatim
- Overpass

---

# 📁 Actual Project Structure

The current ZIP contains the following main structure:

```text
VoltSense-v1/
└── VoltSense-final/
    │
    ├── backend/
    │   ├── src/
    │   │   ├── config/
    │   │   ├── controllers/
    │   │   ├── middleware/
    │   │   ├── models/
    │   │   ├── routes/
    │   │   ├── services/
    │   │   ├── utils/
    │   │   ├── validators/
    │   │   ├── app.js
    │   │   └── server.js
    │   │
    │   ├── scripts/
    │   │   └── seed.js
    │   │
    │   ├── tests/
    │   ├── uploads/
    │   ├── package.json
    │   └── .env.example
    │
    ├── frontend/
    │   ├── src/
    │   │   ├── api/
    │   │   ├── components/
    │   │   ├── context/
    │   │   ├── pages/
    │   │   ├── utils/
    │   │   ├── App.jsx
    │   │   ├── index.css
    │   │   └── main.jsx
    │   │
    │   ├── public/
    │   ├── dist/
    │   ├── package.json
    │   ├── vite.config.js
    │   └── tailwind.config.js
    │
    ├── ml/
    │   ├── data/
    │   ├── models/
    │   ├── preprocess.py
    │   ├── train.py
    │   ├── predict.py
    │   ├── evaluation_results.json
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
    │   ├── deployment.md
    │   ├── environment-variables.md
    │   ├── error-handling.md
    │   ├── frontend-backend-contract.md
    │   ├── ml-architecture.md
    │   ├── ml-backend-contract.md
    │   ├── testing-strategy.md
    │   ├── validation-rules.md
    │   └── ...
    │
    └── README.md
```

---

# 🔌 Backend API

The Express backend provides routes for:

### Authentication

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
```

### User

```text
GET   /api/users/me
PATCH /api/users/me
```

### Vehicle

```text
GET    /api/vehicles
POST   /api/vehicles
GET    /api/vehicles/:vehicleId
PATCH  /api/vehicles/:vehicleId
DELETE /api/vehicles/:vehicleId
```

### Dataset

```text
GET    /api/vehicles/:vehicleId/datasets
POST   /api/vehicles/:vehicleId/datasets
GET    /api/datasets/:datasetId
DELETE /api/datasets/:datasetId
POST   /api/datasets/:datasetId/process
GET    /api/datasets/:datasetId/status
```

### Predictions

```text
GET /api/vehicles/:vehicleId/predictions
GET /api/predictions/:predictionId
GET /api/predictions/:predictionId/insights
```

### Notifications

```text
GET   /api/notifications
PATCH /api/notifications/:notificationId/read
```

### Charging

```text
GET /api/charging-stations
```

The charging endpoint is handled by the backend charging service, which queries location data from public OpenStreetMap-based services.

---

# ⚙️ Installation

## Prerequisites

Install:

- Node.js 18+ or newer
- npm
- MongoDB or MongoDB Atlas
- Python 3.x if working with the ML pipeline

---

# 1. Clone / Open the Project

Open a terminal inside:

```text
VoltSense-v1/VoltSense-final
```

---

# 2. Backend

```bash
cd backend
npm install
```

Create your environment file:

```bash
cp .env.example .env
```

On Windows:

```powershell
Copy-Item .env.example .env
```

Configure the required MongoDB and JWT values in `.env`.

Example:

```env
PORT=5000
NODE_ENV=development

MONGODB_URI=your_mongodb_connection_string
MONGODB_DATABASE=voltsense

JWT_SECRET=your_secret
JWT_EXPIRES_IN=7d

CORS_ORIGIN=http://localhost:5173

MAX_FILE_SIZE_MB=50
```

Start the backend:

```bash
npm run dev
```

The backend normally runs on:

```text
http://localhost:5000
```

---

# 3. Frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend normally runs on:

```text
http://localhost:5173
```

The frontend API configuration is controlled through:

```text
frontend/.env
```

---

# 4. Seed Demo Data

The backend includes a seed script:

```bash
cd backend
npm run seed
```

This creates demo application data for development and testing.

The seed script can be rerun during development to recreate the demo state.

---

# 🧪 Testing

Backend tests use:

- Jest
- Supertest
- MongoDB Memory Server

Run:

```bash
cd backend
npm test
```

For the frontend production build:

```bash
cd frontend
npm run build
```

---

# 📦 Machine Learning Setup

To work with the separate Python ML pipeline:

```bash
cd ml
pip install -r requirements.txt
```

### Preprocessing

```bash
python preprocess.py
```

### Training

```bash
python train.py
```

### Prediction

```bash
python predict.py
```

The trained models and evaluation information are stored within:

```text
ml/models/
ml/evaluation_results.json
```

---

# 🔄 Complete Application Workflow

The main VoltSense workflow is:

```text
                    USER
                      │
                      ▼
                 Sign In
                      │
                      ▼
                 Set Up EV
                      │
                      ▼
              Upload Telemetry
                      │
                      ▼
             Dataset Validation
                      │
                      ▼
              Dataset Processing
                      │
                      ▼
             Battery Prediction
                      │
             ┌────────┴────────┐
             ▼                 ▼
            SOH               RUL
             │                 │
             └────────┬────────┘
                      ▼
             Battery Analysis
                      │
                      ▼
            Explainable Insights
                      │
                      ▼
             Prediction History
```

Separately:

```text
User Location
      │
      ▼
Browser GPS / Manual Location
      │
      ▼
OpenStreetMap Search
      │
      ▼
Nearby Charging Stations
      │
      ▼
Charging Map
```

---

# 🔐 Security

The backend includes application-level security mechanisms including:

- JWT authentication
- Password hashing using bcrypt
- Authentication middleware
- Authorization checks
- Helmet
- CORS configuration
- Request validation
- File-upload restrictions
- Environment-variable based secrets

Do not commit real secrets or credentials.

The following should remain private:

```text
.env
MongoDB credentials
JWT secret
Private API keys
Authentication tokens
```

---

# ⚠️ Current Limitations

VoltSense is currently a development/research project.

### Prediction pipeline

The web application's currently connected processing pipeline uses a deterministic simulation rather than directly calling the Python-trained models.

The Python ML implementation exists separately under:

```text
ml/
```

and contains the NASA-based SOH/RUL models.

### Battery data

The ML models are based on the NASA battery-aging dataset and therefore should not be assumed to represent every commercial EV battery, battery chemistry, vehicle platform, or operating environment.

### Cell-level data

The application does not currently receive a complete real-time per-cell BMS telemetry stream.

Some battery-analysis visualizations therefore represent derived or illustrative information rather than direct measurements from individual cells.

### Charging stations

Charging-station information depends on publicly available OpenStreetMap data and the availability/accuracy of those location records.

Browser location permission is required when using live GPS.

### Settings

Some application settings are currently local-only rather than being persisted as complete backend configuration.

---

# 🚫 Features Intentionally Not Included

VoltSense does **not** currently include a driving simulator.

Fleet management was also removed in favor of a:

```text
Single User → Single EV
```

architecture.

The application does not currently use AWS as a required deployment dependency.

---

# 🔮 Future Improvements

Potential future improvements include:

- Connect the production prediction workflow directly to the trained Python models
- Real-time BMS telemetry ingestion
- CAN-bus integration
- More EV battery datasets
- Additional battery chemistries
- Improved time-series modeling
- Cell-level battery monitoring
- Real-time battery alerts
- Improved RUL uncertainty estimation
- Model version management
- Automated model retraining
- More detailed charging-station information
- Charging-route planning
- Production deployment and monitoring

---

# 📚 Documentation

Additional technical documentation is available in:

```text
docs/
```

Important documents include:

```text
architecture.md
api-reference.md
api-specification.md
database-schema.md
data-dictionary.md
data-flow.md
ml-architecture.md
ml-backend-contract.md
frontend-backend-contract.md
testing-strategy.md
validation-rules.md
deployment.md
environment-variables.md
```

---

# 🎯 Project Objective

VoltSense aims to provide an accessible software platform for understanding EV battery condition from telemetry data.

The project brings together:

```text
EV Battery Telemetry
        +
Data Processing
        +
SOH Estimation
        +
RUL Estimation
        +
Explainable Insights
        +
Historical Analysis
        +
Charging-Station Discovery
```

into a single web application.

The long-term goal is to move from simulated application-level predictions toward a fully connected battery-health intelligence system using validated real-world BMS data and trained machine-learning models.
