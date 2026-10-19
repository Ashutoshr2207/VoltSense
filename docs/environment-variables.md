# VoltSense Environment Variables & Configuration

## 1. Overview & Security Rules

All configuration parameters in VoltSense are loaded through standard environment variables adhering to Twelve-Factor App principles. 

> **Security Mandate**: Never commit live secrets, credentials, or actual `.env` files into source control. All sample values documented below are purely illustrative non-production examples.

---

## 2. Environment Variables Matrix

| Variable Name | Status | Required? | Contains Secret? | Consumed By | Example Format | Purpose |
|---|---|---|---|---|---|---|
| `MONGODB_URI` | **Present in `.env.example`** | Yes | Yes | Backend | `mongodb+srv://app_user:pass@cluster.mongodb.net/voltsense?retryWrites=true&w=majority` | Connection string for authoritative MongoDB Atlas cluster |
| `MONGODB_DATABASE` | **Present in `.env.example`** | Yes | No | Backend | `voltsense` | Target database name within the MongoDB cluster |
| `PORT` | Planned | No (Default: 5000) | No | Backend | `5000` | HTTP port for the Node.js Express application |
| `NODE_ENV` | Planned | No (Default: `development`) | No | Backend | `production` | Node environment flag (`development`, `test`, `production`) |
| `JWT_SECRET` | Planned | Yes | Yes | Backend | `b7f92a34c8d19e0f612a4b8c...` (64+ chars) | Cryptographic key used to sign and verify session JWTs |
| `JWT_EXPIRES_IN` | Planned | No (Default: `7d`) | No | Backend | `7d` | Lifetime of issued authentication tokens |
| `CORS_ORIGIN` | Planned | Yes | No | Backend | `http://localhost:5173,https://app.voltsense.io` | Comma-delimited origins permitted by CORS middleware |
| `OBJECT_STORAGE_PROVIDER` | Planned | Yes | No | Backend, Pipeline | `s3` (or `gcs`, `local`) | Cloud storage driver selection |
| `OBJECT_STORAGE_BUCKET` | Planned | Yes | No | Backend, Pipeline | `voltsense-telemetry-us-east-1` | Primary bucket name for raw and processed telemetry blobs |
| `OBJECT_STORAGE_REGION` | Planned | Yes | No | Backend, Pipeline | `us-east-1` | Cloud region for object store bucket |
| `OBJECT_STORAGE_ACCESS_KEY` | Planned | Yes (in prod) | Yes | Backend, Pipeline | `AKIAIOSFODNN7EXAMPLE` | Cloud IAM service account access key ID |
| `OBJECT_STORAGE_SECRET_KEY` | Planned | Yes (in prod) | Yes | Backend, Pipeline | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` | Cloud IAM service account secret access key |
| `ML_SERVICE_URL` | Planned | Yes | No | Backend | `http://localhost:8000` | Base URL for internal ML inference service |
| `ML_SERVICE_SECRET` | Planned | Yes | Yes | Backend, ML Service | `ml_service_shared_auth_token_99` | Shared token for authenticating backend requests to ML service |
| `MAX_FILE_SIZE_MB` | Planned | No (Default: 50) | No | Backend, Pipeline | `50` | Maximum allowable raw telemetry file upload size in megabytes |
| `VITE_API_BASE_URL` | Planned | No (Default: `/api`) | No | Frontend | `http://localhost:5000/api` | Base HTTP endpoint queried by React frontend API client |

---

## 3. Subsystem Configuration Files

### 3.1 Backend Configuration (`backend/.env`)
```bash
# Core API Settings
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# Database Connection (from .env.example)
MONGODB_URI=mongodb+srv://dev_user:<password>@cluster0.mongodb.net/voltsense?retryWrites=true&w=majority
MONGODB_DATABASE=voltsense

# Security & Authentication
JWT_SECRET=change_me_to_a_secure_random_64_character_string
JWT_EXPIRES_IN=7d

# Cloud Object Storage (S3 / GCS)
OBJECT_STORAGE_PROVIDER=s3
OBJECT_STORAGE_BUCKET=voltsense-dev-telemetry
OBJECT_STORAGE_REGION=us-east-1
OBJECT_STORAGE_ACCESS_KEY=mock_key
OBJECT_STORAGE_SECRET_KEY=mock_secret

# ML Subsystem Link
ML_SERVICE_URL=http://localhost:8000
ML_SERVICE_SECRET=ml_secret_token_123
```

### 3.2 Frontend Configuration (`frontend/.env.development`)
```bash
# Frontend Vite Runtime Configuration
VITE_API_BASE_URL=http://localhost:5000/api
```

### 3.3 Python Pipeline & ML Service (`data-pipeline/.env` / `ml-service/.env`)
```bash
# Cloud Storage & Shared Secrets
OBJECT_STORAGE_PROVIDER=s3
OBJECT_STORAGE_BUCKET=voltsense-dev-telemetry
OBJECT_STORAGE_REGION=us-east-1
ML_SERVICE_PORT=8000
ML_SERVICE_SECRET=ml_secret_token_123
```
