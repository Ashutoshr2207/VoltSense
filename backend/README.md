# VoltSense Backend Service

The **VoltSense Backend** is a Node.js / Express REST API and orchestration service engineered to manage EV fleet telemetry, vehicle assets, dataset ingestion, and predictive health records. It adheres strictly to the locked MongoDB Atlas schema, 4-key API response envelopes, and comprehensive role-based access control.

---

## 1. Quick Start

### Prerequisites
- Node.js v18+ or v20+ LTS
- MongoDB Atlas cluster or local MongoDB instance

### Installation
```bash
cd backend
npm install
```

### Environment Configuration
Copy the example template and supply your MongoDB connection string and JWT secret:
```bash
cp .env.example .env
```

### Running the Service
```bash
# Development mode with hot-reloading
npm run dev

# Production start
npm start
```
The server will bind to `http://localhost:5000` (or `PORT` defined in `.env`).

---

## 2. Running Automated Tests

VoltSense backend uses **Jest**, **Supertest**, and **mongodb-memory-server** for fast, zero-dependency, isolated integration tests:

```bash
npm test
```

---

## 3. Architecture & Key Features

- **Strict Schema Adherence**: All 8 collections (`users`, `vehicles`, `datasets`, `pipelineRuns`, `predictions`, `aiInsights`, `notifications`, `modelVersions`) match the authoritative schema defined in `docs/database-schema.md`.
- **Uniform 4-Key Response Envelope**:
  - Success: `{ "success": true, "data": ..., "message": ..., "error": null }`
  - Error: `{ "success": false, "data": null, "message": ..., "error": { "code": ..., "details": ... } }`
- **Data Boundary Purity**:
  - All ObjectIds are serialized as plain strings (`id`, `userId`, etc.).
  - SOH and RUL metrics are strictly numeric (`soh: 94.2`, `rulCycles: 680`).
  - Timestamps conform to UTC ISO 8601 strings.
- **Robust Authorization Barrier**: Server-side enforcement ensures operators can only view and modify their own assets and records.
- **Separation of Concerns**: Heavy raw telemetry files are stored in object storage abstractions rather than bloating MongoDB documents.
- **Data Pipeline & ML Ready**: The service exposes asynchronous pipeline triggers (`POST /api/datasets/:id/process`) and status polling endpoints (`GET /api/datasets/:id/status`) ready to link with the Python Data Pipeline and ML microservice.

---

## 4. API Endpoints Overview

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/health` | Health and MongoDB connection status | No |
| `POST` | `/api/auth/register` | Register new fleet operator | No |
| `POST` | `/api/auth/login` | Authenticate and obtain JWT | No |
| `GET` | `/api/auth/me` | Retrieve active operator profile | Yes |
| `POST` | `/api/auth/logout` | Invalidate operator session | Yes |
| `GET` | `/api/users/me` | Get user settings and notification preferences | Yes |
| `PATCH` | `/api/users/me` | Update settings and preferences | Yes |
| `GET` | `/api/vehicles` | List registered fleet assets (with status filters) | Yes |
| `POST` | `/api/vehicles` | Register new EV asset | Yes |
| `GET` | `/api/vehicles/:vehicleId` | Get vehicle details | Yes |
| `PATCH` | `/api/vehicles/:vehicleId` | Update vehicle parameters | Yes |
| `DELETE` | `/api/vehicles/:vehicleId` | Remove vehicle | Yes |
| `GET` | `/api/vehicles/:vehicleId/datasets` | List telemetry uploads for vehicle | Yes |
| `POST` | `/api/vehicles/:vehicleId/datasets` | Upload telemetry file (.csv, .json, .parquet) | Yes |
| `GET` | `/api/datasets/:datasetId` | Get dataset record | Yes |
| `DELETE` | `/api/datasets/:datasetId` | Delete dataset | Yes |
| `POST` | `/api/datasets/:datasetId/process` | Trigger data pipeline processing | Yes |
| `GET` | `/api/datasets/:datasetId/status` | Poll pipeline run stage milestones | Yes |
| `GET` | `/api/vehicles/:vehicleId/predictions` | List SOH/RUL predictions for vehicle | Yes |
| `GET` | `/api/predictions/:predictionId` | Get prediction details & degradation curves | Yes |
| `GET` | `/api/predictions/:predictionId/insights` | Get AI electrochemical health advisories | Yes |
| `GET` | `/api/notifications` | List user notification alerts | Yes |
| `PATCH` | `/api/notifications/:notificationId/read` | Mark alert as read | Yes |
