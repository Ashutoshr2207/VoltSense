# VoltSense API Developer Reference

> **Important Note**: All payloads, ObjectIds (e.g. `68a01f92b7c4d81234567890`), tokens, and values in this document are **illustrative examples** designed to guide frontend and backend integration. They do not represent live data.

---

## 1. Authentication Headers & Base Conventions

All endpoints under `/api` requiring authentication expect standard HTTP Bearer authorization:

```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
Accept: application/json
```

---

## 2. Vehicles Endpoint Reference

### 2.1 Get All Registered Vehicles

#### Request
```http
GET /api/vehicles?status=healthy&manufacturer=Tesla HTTP/1.1
Host: api.voltsense.io
Authorization: Bearer eyJhbGciOi...
```

#### Example Response (`200 OK`)
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
        "nickname": "Daily Commuter",
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

---

### 2.2 Register an EV Asset

#### Request
```http
POST /api/vehicles HTTP/1.1
Host: api.voltsense.io
Authorization: Bearer eyJhbGciOi...
Content-Type: application/json

{
  "manufacturer": "BYD",
  "model": "Atto 3",
  "year": 2022,
  "batteryVariant": "Extended Range Blade LFP",
  "nickname": "Fleet Unit #4",
  "batteryCapacityKWh": 60.5
}
```

#### Example Response (`201 Created`)
```json
{
  "success": true,
  "data": {
    "vehicle": {
      "id": "68a07c44b7c4d81234567897",
      "userId": "68a01f92b7c4d81234567890",
      "manufacturer": "BYD",
      "model": "Atto 3",
      "year": 2022,
      "batteryVariant": "Extended Range Blade LFP",
      "nickname": "Fleet Unit #4",
      "batteryCapacityKWh": 60.5,
      "status": "unknown",
      "latestSOH": null,
      "latestRUL": null,
      "latestEOL": null,
      "currentCycleCount": null,
      "latestPredictionId": null,
      "createdAt": "2026-09-07T14:45:00.000Z",
      "updatedAt": "2026-09-07T14:45:00.000Z"
    }
  },
  "message": "Vehicle registered successfully",
  "error": null
}
```

---

## 3. Telemetry Dataset Upload & Processing Reference

### 3.1 Upload Telemetry File

#### Request (Multipart Form)
```http
POST /api/vehicles/68a02a11b7c4d81234567891/datasets HTTP/1.1
Host: api.voltsense.io
Authorization: Bearer eyJhbGciOi...
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW

------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="sourceType"

user_upload
------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="file"; filename="bms_telemetry_20260907.csv"
Content-Type: text/csv

timestamp,cycle,pack_voltage,pack_current,cell_v_min,cell_v_max,temp_avg,soc
2026-09-07T08:00:00Z,412,389.4,45.2,4.091,4.103,28.4,85.0
...
------WebKitFormBoundary7MA4YWxkTrZu0gW--
```

#### Example Response (`201 Created`)
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
        "rawUrl": "s3://voltsense-raw/68a02a11b7c4d81234567891/20260907_bms.csv",
        "processedUrl": null
      },
      "recordCount": null,
      "schemaVersion": "DBC_V4.2",
      "status": "uploaded",
      "dataQuality": {
        "missingPercentage": null,
        "outlierPercentage": null,
        "duplicateRecords": null,
        "invalidRecords": null,
        "overallQuality": null
      },
      "uploadedAt": "2026-09-07T14:15:00.000Z",
      "processedAt": null
    }
  },
  "message": "Telemetry file uploaded successfully",
  "error": null
}
```

---

### 3.2 Trigger Pipeline Processing

#### Request
```http
POST /api/datasets/68a04c11b7c4d81234567892/process HTTP/1.1
Host: api.voltsense.io
Authorization: Bearer eyJhbGciOi...
```

#### Example Response (`202 Accepted`)
```json
{
  "success": true,
  "data": {
    "pipelineRunId": "68a05d22b7c4d81234567893",
    "datasetId": "68a04c11b7c4d81234567892",
    "status": "queued",
    "startedAt": "2026-09-07T14:15:05.000Z"
  },
  "message": "Pipeline run queued for execution",
  "error": null
}
```

---

### 3.3 Query Processing Status

#### Request
```http
GET /api/datasets/68a04c11b7c4d81234567892/status HTTP/1.1
Host: api.voltsense.io
Authorization: Bearer eyJhbGciOi...
```

#### Example Response (`200 OK`)
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
        "validation": { "status": "completed", "startedAt": "2026-09-07T14:15:06.000Z", "completedAt": "2026-09-07T14:15:08.000Z" },
        "schemaMapping": { "status": "completed", "startedAt": "2026-09-07T14:15:08.000Z", "completedAt": "2026-09-07T14:15:09.000Z" },
        "cleaning": { "status": "completed", "startedAt": "2026-09-07T14:15:09.000Z", "completedAt": "2026-09-07T14:15:11.000Z" },
        "missingValueHandling": { "status": "completed", "startedAt": "2026-09-07T14:15:11.000Z", "completedAt": "2026-09-07T14:15:12.000Z" },
        "outlierDetection": { "status": "processing", "startedAt": "2026-09-07T14:15:12.000Z", "completedAt": null },
        "featureEngineering": { "status": "waiting", "startedAt": null, "completedAt": null },
        "normalization": { "status": "waiting", "startedAt": null, "completedAt": null }
      },
      "inputRecords": 18450,
      "outputRecords": null,
      "errors": []
    }
  },
  "message": null,
  "error": null
}
```

---

## 4. Predictions & Diagnostics Reference

### 4.1 Get Prediction Details with Degradation Curves

#### Request
```http
GET /api/predictions/68a03b55b7c4d81234567895 HTTP/1.1
Host: api.voltsense.io
Authorization: Bearer eyJhbGciOi...
```

#### Example Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "prediction": {
      "id": "68a03b55b7c4d81234567895",
      "userId": "68a01f92b7c4d81234567890",
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
      "degradation": {
        "historical": [
          { "cycle": 0, "soh": 100.0 },
          { "cycle": 100, "soh": 98.4 },
          { "cycle": 200, "soh": 97.1 },
          { "cycle": 300, "soh": 95.8 },
          { "cycle": 412, "soh": 94.2 }
        ],
        "predicted": [
          { "cycle": 500, "soh": 92.9 },
          { "cycle": 700, "soh": 88.5 },
          { "cycle": 900, "soh": 82.3 },
          { "cycle": 1092, "soh": 70.0 }
        ]
      },
      "metrics": {
        "mae": 0.35,
        "rmse": 0.48,
        "r2": 0.994
      },
      "createdAt": "2026-09-07T14:22:10.000Z"
    }
  },
  "message": null,
  "error": null
}
```

---

### 4.2 Get AI Insights for Prediction

#### Request
```http
GET /api/predictions/68a03b55b7c4d81234567895/insights HTTP/1.1
Host: api.voltsense.io
Authorization: Bearer eyJhbGciOi...
```

#### Example Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "insight": {
      "id": "68a06e33b7c4d81234567896",
      "userId": "68a01f92b7c4d81234567890",
      "vehicleId": "68a02a11b7c4d81234567891",
      "predictionId": "68a03b55b7c4d81234567895",
      "summary": "Pack degradation is nominal. Estimated remaining useful cycles: 680.",
      "insights": [
        {
          "type": "health",
          "severity": "low",
          "title": "Nominal Baseline Degradation",
          "description": "Degradation conforms to factory specifications for NCA 2170 cell chemistry."
        },
        {
          "type": "temperature",
          "severity": "low",
          "title": "Coolant Thermistor Delta Optimal",
          "description": "Pack temperature gradient maintained within ±0.8°C across all modules."
        }
      ],
      "recommendations": [
        "Maintain daily charging threshold below 80% to curtail SEI layer growth.",
        "Scheduled cell passive balance cycle nominal; next interval at 500 cycles."
      ],
      "generatedAt": "2026-09-07T14:22:15.000Z",
      "generator": {
        "model": "VoltSense Rule Classifier",
        "version": "v1.2"
      }
    }
  },
  "message": null,
  "error": null
}
```
