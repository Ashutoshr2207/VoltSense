# VoltSense REST API Specification

> **Implementation Status**: `IMPLEMENTED`  
> All endpoints documented here represent the active contract implemented in the Node.js / Express backend under `backend/`.

---

## 1. Global API Standards

- **Base URL**: `/api` (e.g. `http://localhost:5000/api` or `https://api.voltsense.io/api`)
- **Transport**: HTTPS
- **Content-Type**: `application/json` (except file uploads which use `multipart/form-data`)
- **Authentication**: Bearer Token in `Authorization` header (`Authorization: Bearer <jwt_token>`)
- **Uniform Response Envelope**:
  ```json
  {
    "success": true,
    "data": {},
    "message": null,
    "error": null
  }
  ```
- **Uniform Error Envelope**:
  ```json
  {
    "success": false,
    "data": null,
    "message": "Descriptive error message",
    "error": {
      "code": "ERROR_CODE_STRING",
      "details": {}
    }
  }
  ```

---

## 2. Authentication Domain

### 2.1 Register User
- **Method & Endpoint**: `POST /api/auth/register`
- **Purpose**: Creates a new user account and initializes default preferences.
- **Auth Required**: No (Public)
- **Related MongoDB Collection**: `users`
- **Subsystem Trigger**: None
- **Request Body**:
  ```json
  {
    "name": "Jane Doe",
    "email": "jane.doe@voltsense.io",
    "password": "SecurePassword123!"
  }
  ```
- **Success Response** (`201 Created`):
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "68a01f92b7c4d81234567890",
        "name": "Jane Doe",
        "email": "jane.doe@voltsense.io",
        "preferences": {
          "theme": "light",
          "emailNotifications": true,
          "batteryAlerts": true,
          "analysisNotifications": true,
          "dataQualityAlerts": true
        },
        "createdAt": "2026-09-07T14:00:00.000Z"
      },
      "token": "eyJhbGciOiJIUzI1NiIsIn..."
    },
    "message": "User registered successfully",
    "error": null
  }
  ```
- **Error Codes**: `VALIDATION_ERROR` (400), `CONFLICT` (409 - Email already exists).

### 2.2 Login
- **Method & Endpoint**: `POST /api/auth/login`
- **Purpose**: Validates credentials and returns a signed JWT.
- **Auth Required**: No (Public)
- **Related MongoDB Collection**: `users`
- **Subsystem Trigger**: None
- **Request Body**:
  ```json
  {
    "email": "jane.doe@voltsense.io",
    "password": "SecurePassword123!"
  }
  ```
- **Success Response** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "68a01f92b7c4d81234567890",
        "name": "Jane Doe",
        "email": "jane.doe@voltsense.io"
      },
      "token": "eyJhbGciOiJIUzI1NiIsIn..."
    },
    "message": "Authentication successful",
    "error": null
  }
  ```
- **Error Codes**: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401).

### 2.3 Get Current Session User
- **Method & Endpoint**: `GET /api/auth/me`
- **Purpose**: Retrieves currently authenticated user profile from token context.
- **Auth Required**: Yes (`Bearer <token>`)
- **Related MongoDB Collection**: `users`
- **Success Response** (`200 OK`): User object as shown in register response.
- **Error Codes**: `UNAUTHORIZED` (401).

### 2.4 Logout
- **Method & Endpoint**: `POST /api/auth/logout`
- **Purpose**: Invalidates client session or adds token to blacklist.
- **Auth Required**: Yes
- **Success Response** (`200 OK`):
  ```json
  {
    "success": true,
    "data": null,
    "message": "Logged out successfully",
    "error": null
  }
  ```

---

## 3. Users Domain

### 3.1 Get Profile & Settings
- **Method & Endpoint**: `GET /api/users/me`
- **Purpose**: Returns full user document including notification preferences.
- **Auth Required**: Yes
- **Related MongoDB Collection**: `users`

### 3.2 Update Profile & Settings
- **Method & Endpoint**: `PATCH /api/users/me`
- **Purpose**: Updates profile details or notification settings.
- **Auth Required**: Yes
- **Related MongoDB Collection**: `users`
- **Request Body**:
  ```json
  {
    "name": "Jane Doe",
    "preferences": {
      "theme": "dark",
      "emailNotifications": false,
      "batteryAlerts": true
    }
  }
  ```
- **Success Response** (`200 OK`): Updated user document.

---

## 4. Vehicles Domain

### 4.1 List Vehicles
- **Method & Endpoint**: `GET /api/vehicles`
- **Purpose**: Retrieves all EV assets owned by the authenticated user.
- **Auth Required**: Yes
- **Query Parameters**:
  - `status` (optional): Filter by `"healthy" | "attention" | "critical" | "unknown"`
  - `manufacturer` (optional): Filter by `"Tesla" | "BYD" | "Tata"`
  - `search` (optional): Substring match on model or nickname
- **Related MongoDB Collection**: `vehicles`
- **Success Response** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "vehicles": [
        {
          "id": "68a02a11b7c4d81234567891",
          "userId": "68a01f92b7c4d81234567890",
          "manufacturer": "Tesla",
          "model": "Model 3",
          "year": 2023,
          "batteryVariant": "Long Range AWD",
          "nickname": "Red Falcon",
          "batteryCapacityKWh": 82.0,
          "status": "healthy",
          "latestSOH": 94.2,
          "latestRUL": 680,
          "latestEOL": 1092,
          "currentCycleCount": 412,
          "latestPredictionId": "68a03b55b7c4d81234567895",
          "createdAt": "2026-09-07T10:00:00.000Z",
          "updatedAt": "2026-09-07T14:30:00.000Z"
        }
      ],
      "total": 1
    },
    "message": null,
    "error": null
  }
  ```

### 4.2 Create Vehicle
- **Method & Endpoint**: `POST /api/vehicles`
- **Purpose**: Registers a new EV asset to the authenticated user's fleet.
- **Auth Required**: Yes
- **Related MongoDB Collection**: `vehicles`
- **Request Body**:
  ```json
  {
    "manufacturer": "Tesla",
    "model": "Model 3",
    "year": 2023,
    "batteryVariant": "Long Range AWD",
    "nickname": "Daily Commuter",
    "batteryCapacityKWh": 82.0
  }
  ```
- **Success Response** (`201 Created`): Created vehicle entity with initial `status: "unknown"`.

### 4.3 Get Vehicle by ID
- **Method & Endpoint**: `GET /api/vehicles/:vehicleId`
- **Purpose**: Retrieves detailed vehicle record and latest battery summary.
- **Auth Required**: Yes
- **Path Parameters**: `vehicleId` (MongoDB ObjectId string)
- **Success Response** (`200 OK`): Single vehicle object.
- **Error Codes**: `NOT_FOUND` (404), `FORBIDDEN` (403 if user does not own asset).

### 4.4 Update Vehicle
- **Method & Endpoint**: `PATCH /api/vehicles/:vehicleId`
- **Purpose**: Updates vehicle metadata (e.g. nickname, battery variant).
- **Auth Required**: Yes
- **Success Response** (`200 OK`): Updated vehicle object.

### 4.5 Delete Vehicle
- **Method & Endpoint**: `DELETE /api/vehicles/:vehicleId`
- **Purpose**: Removes vehicle and cascading references.
- **Auth Required**: Yes
- **Success Response** (`200 OK`): Confirmation message.

---

## 5. Datasets & Upload Orchestration Domain

### 5.1 Upload Telemetry File
- **Method & Endpoint**: `POST /api/vehicles/:vehicleId/datasets`
- **Purpose**: Uploads raw battery telemetry file (CSV/JSON/Parquet), streams it to Object Storage, creates `datasets` record, and returns metadata.
- **Auth Required**: Yes
- **Content-Type**: `multipart/form-data`
- **Path Parameters**: `vehicleId`
- **Form Data Fields**:
  - `file`: Raw telemetry file binary (required)
  - `sourceType`: `"user_upload" | "demo_dataset" | "synthetic_dataset"` (default: `"user_upload"`)
- **Related MongoDB Collection**: `datasets`
- **Subsystem Trigger**: Streams file to Object Storage.
- **Success Response** (`201 Created`):
  ```json
  {
    "success": true,
    "data": {
      "dataset": {
        "id": "68a04c11b7c4d81234567892",
        "userId": "68a01f92b7c4d81234567890",
        "vehicleId": "68a02a11b7c4d81234567891",
        "manufacturer": "Tesla",
        "originalFileName": "bms_telemetry_20260907.csv",
        "fileType": "csv",
        "fileSize": 3565158,
        "sourceType": "user_upload",
        "storage": {
          "provider": "s3",
          "rawUrl": "s3://voltsense-raw/68a02a11/20260907-telemetry.csv",
          "processedUrl": null
        },
        "recordCount": null,
        "schemaVersion": "DBC_V4.2",
        "status": "uploaded",
        "uploadedAt": "2026-09-07T14:15:00.000Z",
        "processedAt": null
      }
    },
    "message": "Telemetry file uploaded successfully",
    "error": null
  }
  ```

### 5.2 Trigger Pipeline Processing
- **Method & Endpoint**: `POST /api/datasets/:datasetId/process`
- **Purpose**: Initiates asynchronous data cleaning, feature engineering, and ML prediction.
- **Auth Required**: Yes
- **Path Parameters**: `datasetId`
- **Related MongoDB Collections**: `pipelineRuns`, `datasets`
- **Subsystem Trigger**: Triggers Python Data Pipeline job asynchronously.
- **Success Response** (`202 Accepted`):
  ```json
  {
    "success": true,
    "data": {
      "pipelineRunId": "68a05d22b7c4d81234567893",
      "datasetId": "68a04c11b7c4d81234567892",
      "status": "queued",
      "startedAt": "2026-09-07T14:15:05.000Z"
    },
    "message": "Data pipeline execution initiated",
    "error": null
  }
  ```

### 5.3 Get Dataset & Pipeline Status
- **Method & Endpoint**: `GET /api/datasets/:datasetId/status`
- **Purpose**: Polls progress and stage execution checkpoints of an active pipeline run.
- **Auth Required**: Yes
- **Path Parameters**: `datasetId`
- **Related MongoDB Collections**: `datasets`, `pipelineRuns`
- **Success Response** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "datasetId": "68a04c11b7c4d81234567892",
      "status": "processing",
      "pipelineRun": {
        "id": "68a05d22b7c4d81234567893",
        "status": "processing",
        "stages": {
          "validation": { "status": "completed" },
          "schemaMapping": { "status": "completed" },
          "cleaning": { "status": "processing" },
          "missingValueHandling": { "status": "waiting" },
          "outlierDetection": { "status": "waiting" },
          "featureEngineering": { "status": "waiting" },
          "normalization": { "status": "waiting" }
        }
      }
    },
    "message": null,
    "error": null
  }
  ```

### 5.4 List Datasets for Vehicle
- **Method & Endpoint**: `GET /api/vehicles/:vehicleId/datasets`
- **Purpose**: Retrieves all uploaded telemetry datasets for a vehicle.
- **Auth Required**: Yes
- **Success Response** (`200 OK`): Array of dataset objects.

---

## 6. Predictions Domain

### 6.1 List Predictions for Vehicle
- **Method & Endpoint**: `GET /api/vehicles/:vehicleId/predictions`
- **Purpose**: Returns chronological list of ML predictions for a vehicle.
- **Auth Required**: Yes
- **Path Parameters**: `vehicleId`
- **Query Parameters**:
  - `page` (default: `1`)
  - `pageSize` (default: `20`)
- **Related MongoDB Collection**: `predictions`
- **Success Response** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "predictions": [
        {
          "id": "68a03b55b7c4d81234567895",
          "vehicleId": "68a02a11b7c4d81234567891",
          "datasetId": "68a04c11b7c4d81234567892",
          "pipelineRunId": "68a05d22b7c4d81234567893",
          "model": {
            "name": "VoltSense Bayesian SOH",
            "version": "v1.0",
            "algorithm": "Bayesian MCMC"
          },
          "prediction": {
            "soh": 94.2,
            "currentCycle": 412,
            "rulCycles": 680,
            "estimatedEOLCycle": 1092,
            "eolThreshold": 70.0
          },
          "confidence": {
            "soh": 0.94,
            "rul": 0.87
          },
          "createdAt": "2026-09-07T14:22:10.000Z"
        }
      ],
      "total": 1,
      "page": 1,
      "pageSize": 20
    },
    "message": null,
    "error": null
  }
  ```

### 6.2 Get Prediction Details with Degradation Curves
- **Method & Endpoint**: `GET /api/predictions/:predictionId`
- **Purpose**: Retrieves complete prediction document including historical and forecasted degradation curves for chart plotting.
- **Auth Required**: Yes
- **Path Parameters**: `predictionId`
- **Related MongoDB Collection**: `predictions`
- **Success Response** (`200 OK`): Full prediction record including `degradation.historical` and `degradation.predicted` arrays.

---

## 7. AI Insights & Diagnostics Domain

### 7.1 Get Prediction AI Insights
- **Method & Endpoint**: `GET /api/predictions/:predictionId/insights`
- **Purpose**: Returns electrochemical health advisories and actionable recommendations.
- **Auth Required**: Yes
- **Path Parameters**: `predictionId`
- **Related MongoDB Collection**: `aiInsights`
- **Success Response** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "insight": {
        "id": "68a06e33b7c4d81234567896",
        "vehicleId": "68a02a11b7c4d81234567891",
        "predictionId": "68a03b55b7c4d81234567895",
        "summary": "Pack degradation is strictly within baseline envelope.",
        "insights": [
          {
            "type": "degradation",
            "severity": "low",
            "title": "Nominal SEI Growth",
            "description": "Solid Electrolyte Interphase layer growth conforms to baseline expectations."
          }
        ],
        "recommendations": [
          "Maintain daily charging threshold below 80% to curtail SEI layer growth.",
          "Scheduled cell passive balance cycle nominal; next interval at 500 cycles."
        ],
        "generatedAt": "2026-09-07T14:22:15.000Z"
      }
    },
    "message": null,
    "error": null
  }
  ```

---

## 8. Notifications Domain

### 8.1 List Notifications
- **Method & Endpoint**: `GET /api/notifications`
- **Purpose**: Retrieves user alert feed with unread counts.
- **Auth Required**: Yes
- **Query Parameters**:
  - `read`: boolean filter (e.g. `read=false`)
- **Related MongoDB Collection**: `notifications`
- **Success Response** (`200 OK`): Array of notification items.

### 8.2 Mark Notification as Read
- **Method & Endpoint**: `PATCH /api/notifications/:notificationId/read`
- **Purpose**: Sets `read: true` on an alert.
- **Auth Required**: Yes
- **Path Parameters**: `notificationId`
- **Success Response** (`200 OK`): Updated notification record.
