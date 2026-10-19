# VoltSense — MongoDB Atlas Database Schema Documentation

## 1. Database Overview

- **Database Name**: `voltsense`
- **Engine**: MongoDB Atlas (v7.0+ / WiredTiger)
- **Role**: Operational metadata, telemetry pipeline tracking, electrochemical degradation metrics, and AI insights layer.
- **Architectural Principle**: Heavy telemetry files (raw/processed CSV, JSON, Parquet) live in cloud object storage (e.g. S3, GCS, Cloudinary). MongoDB stores metadata, pipeline execution states, structured diagnostic outputs, and model predictions using relational `ObjectId` references.

---

## 2. Entity-Relationship Model (ER Diagram)

```text
                     users
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
      vehicles                 notifications
         │
         ▼
      datasets
         │
         ▼
   pipelineRuns
         │
         ▼
    predictions ◄────── modelVersions (logical/version ref)
         │
         ▼
    aiInsights
```

---

## 3. Collections & Schema Specifications

### 3.1 `users`
Stores user accounts, operator profiles, and application notification preferences.

```javascript
{
  _id: ObjectId,
  name: String,                      // Required
  email: String,                     // Required, Unique
  passwordHash: String,              // For future auth (no plaintext passwords)
  profileImage: String | null,
  preferences: {
    theme: String,                   // "light" | "dark" | "system" (Default: "light")
    emailNotifications: Boolean,     // Default: true
    batteryAlerts: Boolean,          // Default: true
    analysisNotifications: Boolean,  // Default: true
    dataQualityAlerts: Boolean       // Default: true
  },
  createdAt: Date,
  updatedAt: Date
}
```

- **Validation / Constraints**:
  - `name`: string, required
  - `email`: string, required, regex email pattern
  - `preferences.theme`: enum `["light", "dark", "system"]`
- **Indexes**:
  - `{ email: 1 }` (Unique)

---

### 3.2 `vehicles`
Stores EV battery pack assets registered to a user/operator.

```javascript
{
  _id: ObjectId,
  userId: ObjectId,                  // References users._id (Required)
  manufacturer: String,              // e.g. "Tesla", "BYD", "Tata" (Required)
  model: String,                     // e.g. "Model 3", "Atto 3", "Nexon EV" (Required)
  year: Number,                      // e.g. 2023
  batteryVariant: String,            // e.g. "Long Range AWD", "Blade LFP"
  nickname: String,                  // Optional custom identifier
  batteryCapacityKWh: Number,        // e.g. 82.0
  status: String,                    // "healthy" | "attention" | "critical" | "unknown"
  latestSOH: Number | null,          // Numeric percentage (e.g. 94.2)
  latestRUL: Number | null,          // Remaining useful cycles (e.g. 680)
  latestEOL: Number | null,          // Projected EOL cycle (e.g. 1092)
  currentCycleCount: Number | null,  // Current odometer/charge cycles
  latestPredictionId: ObjectId | null,// References predictions._id
  createdAt: Date,
  updatedAt: Date
}
```

- **Relationships**:
  - `userId` → `users._id`
  - `latestPredictionId` → `predictions._id`
- **Indexes**:
  - `{ userId: 1 }`
  - `{ userId: 1, manufacturer: 1 }`

---

### 3.3 `datasets`
Represents uploaded or connected battery telemetry files and data quality assessments.

```javascript
{
  _id: ObjectId,
  userId: ObjectId,                  // References users._id (Required)
  vehicleId: ObjectId,               // References vehicles._id (Required)
  manufacturer: String,              // Manufacturer adapter identifier
  originalFileName: String,          // e.g. "bms_telemetry_20260907.csv"
  fileType: String,                  // "csv" | "json" | "parquet"
  fileSize: Number,                  // Bytes
  sourceType: String,                // "user_upload" | "demo_dataset" | "synthetic_dataset"
  storage: {
    provider: String,                // e.g. "s3", "gcs", "local"
    rawUrl: String | null,           // Cloud object storage path
    processedUrl: String | null      // Cleaned/normalized file path
  },
  recordCount: Number | null,        // Total telemetry records (e.g. 18450)
  schemaVersion: String,             // e.g. "DBC_V4.2"
  status: String,                    // "uploaded" | "processing" | "processed" | "failed"
  dataQuality: {
    missingPercentage: Number | null,
    outlierPercentage: Number | null,
    duplicateRecords: Number | null,
    invalidRecords: Number | null,
    overallQuality: String | null    // "excellent" | "good" | "fair" | "poor" | "unknown"
  },
  uploadedAt: Date,
  processedAt: Date | null
}
```

- **Relationships**:
  - `userId` → `users._id`
  - `vehicleId` → `vehicles._id`
- **Indexes**:
  - `{ userId: 1 }`
  - `{ vehicleId: 1 }`
  - `{ vehicleId: 1, uploadedAt: -1 }`

---

### 3.4 `pipelineRuns`
Tracks dataset transformation through the VoltSense data ingestion & feature engineering pipeline.

```javascript
{
  _id: ObjectId,
  datasetId: ObjectId,               // References datasets._id (Required)
  vehicleId: ObjectId,               // References vehicles._id (Required)
  userId: ObjectId,                  // References users._id (Required)
  manufacturerAdapter: String,       // e.g. "Tesla_BMS_V4"
  pipelineVersion: String,           // e.g. "2.4.0"
  status: String,                    // "queued" | "processing" | "completed" | "failed"
  stages: {
    validation: {
      status: String,                // "waiting" | "processing" | "completed" | "failed" | "skipped"
      startedAt: Date | null,
      completedAt: Date | null
    },
    schemaMapping: { status: String, startedAt: Date | null, completedAt: Date | null },
    cleaning: { status: String, startedAt: Date | null, completedAt: Date | null },
    missingValueHandling: { status: String, startedAt: Date | null, completedAt: Date | null },
    outlierDetection: { status: String, startedAt: Date | null, completedAt: Date | null },
    featureEngineering: { status: String, startedAt: Date | null, completedAt: Date | null },
    normalization: { status: String, startedAt: Date | null, completedAt: Date | null }
  },
  inputRecords: Number | null,
  outputRecords: Number | null,
  featuresGenerated: [String],
  errors: [String],
  startedAt: Date,
  completedAt: Date | null
}
```

- **Relationships**:
  - `datasetId` → `datasets._id`
  - `vehicleId` → `vehicles._id`
  - `userId` → `users._id`
- **Indexes**:
  - `{ datasetId: 1 }`
  - `{ vehicleId: 1 }`
  - `{ userId: 1 }`

---

### 3.5 `predictions`
Stores ML-inferred State of Health (SOH), Remaining Useful Life (RUL), and degradation curves.

```javascript
{
  _id: ObjectId,
  userId: ObjectId,                  // References users._id (Required)
  vehicleId: ObjectId,               // References vehicles._id (Required)
  datasetId: ObjectId,               // References datasets._id (Required)
  pipelineRunId: ObjectId,           // References pipelineRuns._id (Required)
  model: {
    name: String,                    // e.g. "VoltSense Bayesian SOH"
    version: String,                 // e.g. "v1.0"
    algorithm: String                // e.g. "Bayesian MCMC", "NeuralODE", "RandomForest"
  },
  prediction: {
    soh: Number,                     // Numerical SOH % (e.g. 94.2)
    currentCycle: Number,            // Measured cycle count (e.g. 412)
    rulCycles: Number,               // Estimated remaining cycles (e.g. 680)
    estimatedEOLCycle: Number,       // Projected EOL cycle (e.g. 1092)
    eolThreshold: Number             // Threshold % (Default: 70 or 80)
  },
  confidence: {
    soh: Number | null,              // Confidence score (0.0 - 1.0)
    rul: Number | null
  },
  degradation: {
    historical: [
      { cycle: Number, soh: Number }
    ],
    predicted: [
      { cycle: Number, soh: Number }
    ]
  },
  metrics: {
    mae: Number | null,
    rmse: Number | null,
    r2: Number | null
  },
  createdAt: Date
}
```

- **Relationships**:
  - `userId` → `users._id`
  - `vehicleId` → `vehicles._id`
  - `datasetId` → `datasets._id`
  - `pipelineRunId` → `pipelineRuns._id`
- **Indexes**:
  - `{ vehicleId: 1 }`
  - `{ datasetId: 1 }`
  - `{ userId: 1 }`
  - `{ vehicleId: 1, createdAt: -1 }`

---

### 3.6 `aiInsights`
Stores explainable AI summaries and electrochemical health advisories.

```javascript
{
  _id: ObjectId,
  userId: ObjectId,                  // References users._id (Required)
  vehicleId: ObjectId,               // References vehicles._id (Required)
  predictionId: ObjectId,            // References predictions._id (Required)
  summary: String,                   // High-level operational summary
  insights: [
    {
      type: String,                  // "health" | "degradation" | "temperature" | "usage" | "data_quality" | "prediction"
      severity: String,              // "low" | "medium" | "high" | "critical"
      title: String,
      description: String
    }
  ],
  recommendations: [String],         // Actionable engineering steps
  generatedAt: Date,
  generator: {
    model: String,                   // e.g. "VoltSense Classifier"
    version: String                  // e.g. "v1.2"
  }
}
```

- **Relationships**:
  - `userId` → `users._id`
  - `vehicleId` → `vehicles._id`
  - `predictionId` → `predictions._id`
- **Indexes**:
  - `{ vehicleId: 1 }`
  - `{ predictionId: 1 }`
  - `{ userId: 1 }`

---

### 3.7 `notifications`
Stores system, diagnostic, and battery health alerts for the operator.

```javascript
{
  _id: ObjectId,
  userId: ObjectId,                  // References users._id (Required)
  vehicleId: ObjectId | null,        // Optional vehicle reference
  predictionId: ObjectId | null,     // Optional prediction reference
  type: String,                      // "analysis_complete" | "battery_health_change" | "data_quality_warning" | "system"
  title: String,
  message: String,
  read: Boolean,                     // Default: false
  createdAt: Date
}
```

- **Relationships**:
  - `userId` → `users._id`
  - `vehicleId` → `vehicles._id` (nullable)
  - `predictionId` → `predictions._id` (nullable)
- **Indexes**:
  - `{ userId: 1 }`
  - `{ userId: 1, read: 1 }`
  - `{ userId: 1, createdAt: -1 }`

---

### 3.8 `modelVersions`
Registry of machine learning models and operational performance metrics.

```javascript
{
  _id: ObjectId,
  name: String,                      // e.g. "voltsense-soh-bayesian"
  version: String,                   // e.g. "v1.0.0"
  sohModel: {
    algorithm: String,               // e.g. "Bayesian MCMC", "XGBoost", "LSTM"
    filePath: String | null,         // Object storage model artifact path
    metrics: {
      mae: Number | null,
      rmse: Number | null,
      r2: Number | null
    }
  },
  rulModel: {
    algorithm: String,
    filePath: String | null,
    metrics: {
      mae: Number | null,
      rmse: Number | null,
      r2: Number | null
    }
  },
  trainingDataset: String | null,
  featureSchemaVersion: String,
  status: String,                    // "development" | "testing" | "production" | "deprecated"
  createdAt: Date
}
```

- **Indexes**:
  - `{ name: 1, version: 1 }`
  - `{ status: 1 }`

---

## 4. Index Summary Matrix

| Collection | Index Name | Key Fields | Purpose |
|---|---|---|---|
| `users` | `email_1` | `{ email: 1 }` | Fast lookup & uniqueness |
| `vehicles` | `userId_1` | `{ userId: 1 }` | User vehicle filtering |
| `vehicles` | `userId_1_manufacturer_1` | `{ userId: 1, manufacturer: 1 }` | Manufacturer-specific user queries |
| `datasets` | `userId_1` | `{ userId: 1 }` | User dataset filtering |
| `datasets` | `vehicleId_1` | `{ vehicleId: 1 }` | Vehicle telemetry tracking |
| `datasets` | `vehicleId_1_uploadedAt_-1` | `{ vehicleId: 1, uploadedAt: -1 }` | Chronological dataset ordering |
| `pipelineRuns` | `datasetId_1` | `{ datasetId: 1 }` | Pipeline status by dataset |
| `pipelineRuns` | `vehicleId_1` | `{ vehicleId: 1 }` | Pipeline runs by vehicle |
| `pipelineRuns` | `userId_1` | `{ userId: 1 }` | User run audits |
| `predictions` | `vehicleId_1` | `{ vehicleId: 1 }` | Vehicle predictions list |
| `predictions` | `datasetId_1` | `{ datasetId: 1 }` | Predictions by dataset run |
| `predictions` | `userId_1` | `{ userId: 1 }` | User prediction query |
| `predictions` | `vehicleId_1_createdAt_-1` | `{ vehicleId: 1, createdAt: -1 }` | Latest prediction lookup |
| `aiInsights` | `vehicleId_1` | `{ vehicleId: 1 }` | Insights for vehicle dashboard |
| `aiInsights` | `predictionId_1` | `{ predictionId: 1 }` | Insights linked to prediction |
| `aiInsights` | `userId_1` | `{ userId: 1 }` | User-scoped insight queries |
| `notifications` | `userId_1` | `{ userId: 1 }` | User notification inbox |
| `notifications` | `userId_1_read_1` | `{ userId: 1, read: 1 }` | Unread badge counts |
| `notifications` | `userId_1_createdAt_-1` | `{ userId: 1, createdAt: -1 }` | Chronological feed |
| `modelVersions` | `name_1_version_1` | `{ name: 1, version: 1 }` | Model registry resolution |
| `modelVersions` | `status_1` | `{ status: 1 }` | Production model active lookup |

---

## 5. Telemetry & Storage Separation Strategy

```text
Raw Ingestion (CSV / JSON / Parquet)
              │
              ├──► Cloud Object Storage (S3 / GCS / Cloudinary)
              │       ├── Raw Files: /raw/{vehicleId}/{timestamp}.csv
              │       └── Processed: /processed/{vehicleId}/{timestamp}.parquet
              │
              └──► MongoDB Atlas
                      ├── Dataset metadata & S3 URL
                      ├── Pipeline execution checkpoints
                      ├── Numerical SOH / RUL predictions
                      └── Downsampled degradation curve points for charting
```

- **Zero Heavy Telemetry in MongoDB**: Million-row time-series points are never embedded as subdocument arrays.
- **Charts consume downsampled points**: `{ cycle: 450, soh: 94.0 }` arrays contain under 50 points per prediction, ensuring small document size (< 4 KB per prediction document).

---

## 6. Future Extension Points

1. **Multi-Tenant Organizations**: A future `organizationId` can be added to `users` and indexed across `vehicles` for commercial fleet operators.
2. **Dynamic BMS DBC Mapping**: `datasets.schemaVersion` accommodates evolving CAN bus DBC definitions across new automotive manufacturers.
3. **Pluggable ML Algorithms**: `predictions.model` and `modelVersions` decouple model training frameworks (XGBoost, PyTorch NeuralODEs, LightGBM) from database storage.
