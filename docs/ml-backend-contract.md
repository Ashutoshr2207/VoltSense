# VoltSense ML Service ↔ Backend Service Contract

> **Implementation Status**: `PLANNED / NOT IMPLEMENTED`  
> This document specifies the internal remote invocation contract between the **Node.js / Express Backend** and the **Python ML Inference Service**. All endpoints and schemas documented here are contract specifications for future implementation.

---

## 1. Protocol & Transport Options

The ML service can be invoked either synchronously via an internal REST API or asynchronously via a message queue:

- **Protocol**: HTTP/1.1 REST (or gRPC)
- **Base Endpoint**: `http://ml-service:8000/internal/predict`
- **Internal Security**: Mutual TLS (mTLS) or shared service token (`X-Internal-Token`)
- **Timeout**: 10,000 ms (10 seconds)

---

## 2. Inference Request Specification

### Request
```http
POST /internal/predict HTTP/1.1
Host: ml-service.internal:8000
Content-Type: application/json
X-Internal-Token: ${ML_SERVICE_SECRET}

{
  "datasetId": "68a04c11b7c4d81234567892",
  "vehicleId": "68a02a11b7c4d81234567891",
  "userId": "68a01f92b7c4d81234567890",
  "pipelineRunId": "68a05d22b7c4d81234567893",
  "modelVersion": "v1.0.0",
  "dataLocation": "s3://voltsense-processed/68a02a11b7c4d81234567891/68a05d22b7c4d81234567893.parquet",
  "batteryVariant": "Long Range AWD",
  "nominalCapacityKWh": 82.0,
  "eolThreshold": 70.0
}
```

### Request Parameter Definitions

| Field | Type | Description |
|---|---|---|
| `datasetId` | `String` (ObjectId) | Identifier of the ingested dataset |
| `vehicleId` | `String` (ObjectId) | Target EV asset identifier |
| `userId` | `String` (ObjectId) | Asset owner identifier |
| `pipelineRunId` | `String` (ObjectId) | Completed pipeline run that produced the Parquet file |
| `modelVersion` | `String` | Target model release tag registered in `modelVersions` |
| `dataLocation` | `String` (URI) | Cloud Object Storage URI of the processed feature array |
| `batteryVariant` | `String` | Cell chemistry descriptor (e.g. `"Long Range AWD"`, `"Blade LFP"`) |
| `nominalCapacityKWh` | `Number` | Factory pack capacity rating |
| `eolThreshold` | `Number` | SOH percentage defining end-of-life milestone (default: `70.0`) |

---

## 3. Inference Response Specification

### Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "model": {
      "name": "VoltSense Bayesian SOH",
      "version": "v1.0.0",
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
    "credibleInterval": {
      "sohLower": 93.7,
      "sohUpper": 94.5,
      "confidenceLevel": 0.95
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
    "executionLatencyMs": 38.2
  },
  "error": null
}
```

---

## 4. Backend Database Ingestion Mapping

Upon receiving the `200 OK` inference response, the Node.js backend performs atomic persistence into the authoritative MongoDB schema:

1. **Insert into `predictions` collection**:
   - Maps `req.userId` $\rightarrow$ `predictions.userId`
   - Maps `req.vehicleId` $\rightarrow$ `predictions.vehicleId`
   - Maps `req.datasetId` $\rightarrow$ `predictions.datasetId`
   - Maps `req.pipelineRunId` $\rightarrow$ `predictions.pipelineRunId`
   - Embeds `data.model`, `data.prediction`, `data.confidence`, `data.degradation`, and `data.metrics`.
   - Sets `createdAt = new Date()`.

2. **Update `vehicles` collection**:
   - Sets `vehicles.latestSOH = data.prediction.soh`
   - Sets `vehicles.latestRUL = data.prediction.rulCycles`
   - Sets `vehicles.latestEOL = data.prediction.estimatedEOLCycle`
   - Sets `vehicles.currentCycleCount = data.prediction.currentCycle`
   - Sets `vehicles.latestPredictionId = newlyCreatedPredictionId`
   - Evaluates and updates status:
     - `healthy` if `soh >= 90.0`
     - `attention` if `75.0 <= soh < 90.0`
     - `critical` if `soh < 75.0`
   - Sets `updatedAt = new Date()`.

3. **Trigger AI Insight Generation**:
   - Emits an internal event with prediction context to generate diagnostic advice for the `aiInsights` collection.
