# VoltSense

VoltSense is a cutting-edge B2B SaaS platform engineered to optimize electric vehicle (EV) fleet management through AI-driven diagnostics. By ingesting raw telemetry data from diverse manufacturers, VoltSense provides predictive analytics on battery health and actionable advisories to minimize downtime.

## 🚀 Key Capabilities

- **Multi-Manufacturer Support**: Seamlessly integrates data from Tesla, BYD, Tata, and other leading EV makers.
- **AI-Powered Battery Health**: Utilizes advanced machine learning models to predict Remaining Useful Life (RUL) and State of Health (SOH).
- **Automated Pipeline**: A robust data pipeline cleans, transforms, and engineers features from raw CSV/JSON inputs.
- **Modern Tech Stack**: Built on a scalable microservices architecture featuring React, Node.js, and Python.

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Python**: v3.11 or higher
- **Docker**: (Optional, for containerized deployment)

## 🛠️ Installation & Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd VoltSense
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   # Create .env file based on .env.example if needed
   npm run dev
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Data Pipeline & ML Setup**
   ```bash
   cd data-pipeline
   pip install -r requirements.txt

   cd ../ml-service
   pip install -r requirements.txt
   # Download models if not already present
   ```

## 📡 API Documentation

The backend API follows a strict 4-key envelope schema: `{ success, data, message, error }`.

### Key Endpoints

- `POST /api/auth/register`: Register a new fleet operator.
- `POST /api/auth/login`: Authenticate and receive JWT token.
- `POST /api/vehicles`: Register a new EV with the fleet.
- `POST /api/datasets/upload`: Upload raw vehicle telemetry.
- `POST /api/process`: Trigger the data processing pipeline.
- `GET /api/vehicles/:id/predictions`: Retrieve health metrics.

## 🏗️ Architecture

VoltSense uses a microservices architecture:
- **Frontend**: React SPA (Vite) - Client-side UI.
- **Backend**: Node.js (Express) - API gateway and business logic.
- **Data Pipeline**: Python (Pandas) - ETL and feature engineering.
- **ML Service**: Python (PyTorch) - Inference engine.

## 🧪 Testing

We maintain a comprehensive test suite across all subsystems.

- **Frontend Tests**: `npm run test` (Vitest)
- **Backend Tests**: `npm test` (Jest)
- **Data Pipeline**: `pytest tests/`
- **ML Service**: `pytest tests/`
- **E2E Tests**: `npm run test:e2e` (Playwright)

## 🤝 Contributing

1. Create a feature branch: `git checkout -b feature/<short-description> develop`
2. Ensure code passes linting and tests.
3. Submit a Pull Request to the `develop` branch.
4. Await peer review and CI verification.
