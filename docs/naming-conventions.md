# VoltSense Universal Naming Conventions & Project Authority

## 1. Core Principle & Authority

To guarantee seamless interoperability between the **Frontend (React)**, **Backend (Node.js)**, **Data Pipeline (Python)**, **ML Subsystem (Python)**, and **MongoDB Atlas (Database)**, this document serves as the single project-wide naming authority.

> **Universal Equivalence Rule**: Use the exact same concept name across all architectural layers. Never invent localized synonyms for existing concepts.

```text
Bad:   vehicle_id (API) vs. carId (Frontend) vs. evId (Backend) vs. vehicleId (MongoDB)
Good:  vehicleId (Universal canonical concept)
```

---

## 2. Language & Framework Specific Conventions

### 2.1 JavaScript & TypeScript Variables
- Use **`camelCase`** for all variables, constants, functions, and properties.
  - Good: `vehicleId`, `datasetId`, `currentCycle`, `estimatedEOLCycle`, `latestSOH`, `pipelineRunId`
  - Bad: `vehicle_id`, `CurrentCycle`, `latest_soh`

### 2.2 Python Variables & Functions
- Use **`snake_case`** for internal Python code, local variables, class methods, and functions.
  - Good: `vehicle_id`, `dataset_id`, `current_cycle`, `estimated_eol_cycle`, `pipeline_run_id`
  - Bad: `vehicleId`, `currentCycle`
- **Data Boundary Exception**: When Python code emits data across the API boundary or serializes documents into MongoDB, it must map internal `snake_case` variables to the canonical API **`camelCase`** field names:
  - Python internal: `estimated_eol_cycle` $\rightarrow$ API / Mongo: `estimatedEOLCycle`
  - Python internal: `rul_cycles` $\rightarrow$ API / Mongo: `rulCycles`

### 2.3 MongoDB Field Names
- Use **`camelCase`** for all document field keys.
  - Good: `userId`, `vehicleId`, `batteryCapacityKWh`, `currentCycleCount`, `latestPredictionId`, `pipelineVersion`
  - Bad: `user_id`, `battery_capacity_kwh`, `LatestPredictionId`

### 2.4 MongoDB Collection Names
- Use **`lower camelCase` / plural nouns**.
- The 8 locked collections must be written exactly as:
  ```text
  users
  vehicles
  datasets
  pipelineRuns
  predictions
  aiInsights
  notifications
  modelVersions
  ```
- **Strict Invariant**: Do NOT rename, alter casing, or singularize these collection names.

### 2.5 REST API Endpoints
- Use **`lowercase plural nouns`** representing resources.
  - Good: `/api/vehicles`, `/api/datasets`, `/api/predictions`, `/api/notifications`
  - Bad: `/api/getVehicles`, `/api/vehicle`, `/api/create_dataset`
- Use nested resources only when parent ownership is structurally significant:
  - Good: `/api/vehicles/:vehicleId/datasets`
  - Good: `/api/vehicles/:vehicleId/predictions`
- Express actions using HTTP verbs (`GET`, `POST`, `PATCH`, `DELETE`) rather than verb tokens in URLs:
  - Good: `DELETE /api/vehicles/:vehicleId`
  - Bad: `POST /api/vehicles/:vehicleId/delete`

### 2.6 HTTP Query Parameters
- Use **`camelCase`** for all query string keys.
  - Good: `page`, `pageSize`, `sortBy`, `sortOrder`, `vehicleId`, `manufacturer`, `sourceType`, `status`
  - Bad: `page_size`, `sort_by`, `vehicle_id`

### 2.7 JSON API Request & Response Fields
- Use **`camelCase`** for all JSON payload keys:
  ```json
  {
    "vehicleId": "68a02a11b7c4d81234567891",
    "currentCycle": 412,
    "rulCycles": 680,
    "estimatedEOLCycle": 1092
  }
  ```

### 2.8 Python File Names
- Use **`snake_case.py`** for all Python module and script files.
  - Good: `data_loader.py`, `schema_mapper.py`, `outlier_detector.py`, `feature_engineering.py`, `soh_predictor.py`, `rul_predictor.py`, `model_registry.py`
  - Bad: `dataLoader.py`, `SOHPredictor.py`

### 2.9 JavaScript / TypeScript File Names
- Use **`camelCase`** for utilities, service modules, and helpers:
  - Good: `apiClient.js`, `vehicleService.js`, `formatters.js`
- Use **`PascalCase`** for React component files:
  - Good: `VehicleCard.jsx`, `BatteryHealthChart.jsx`, `PredictionSummary.jsx`

### 2.10 React Component Names
- Use **`PascalCase`** for all component definitions and exports:
  - Good: `VehicleCard`, `BatteryHealthChart`, `PredictionSummary`, `DataQualityCard`, `PipelineStatus`

### 2.11 Backend Controllers & Services
- Use **`camelCase`** module exports or descriptive **`PascalCase`** classes:
  - Modules: `vehicleController.js`, `datasetController.js`, `predictionController.js`
  - Services: `vehicleService.js`, `datasetService.js`, `predictionService.js`

### 2.12 Backend Route Files
- Use plural lowercase resource terminology:
  - Good: `vehicles.routes.js`, `datasets.routes.js`, `predictions.routes.js`
  - Bad: `cars.routes.js`, `ev.routes.js`

---

## 3. Domain Terminology & Invariants

### 3.1 Data Pipeline Terminology
The seven canonical pipeline stages must be referenced using these exact casing names in documentation, database records (`pipelineRuns.stages`), and logs:
```text
validation
schemaMapping
cleaning
missingValueHandling
outlierDetection
featureEngineering
normalization
```

### 3.2 Machine Learning Terminology
Use these universal acronyms and canonical field names:
- **SOH**: State of Health $\rightarrow$ JSON field: `soh`
- **RUL**: Remaining Useful Life $\rightarrow$ JSON field: `rulCycles`
- **EOL**: End of Life $\rightarrow$ JSON field: `estimatedEOLCycle`
- **Threshold**: Retirement limit $\rightarrow$ JSON field: `eolThreshold`

> **Forbidden Alternatives**: Do not use `healthPercentage`, `batteryHealth`, `remainingLife`, or `endOfLife` for canonical prediction fields.

### 3.3 Automotive Manufacturer Names
Use standard TitleCase spelling:
```text
Tesla
BYD
Tata
```
> Raw files with `TESLA`, `tesla`, `Tesla Motors`, or `BYD Auto` must be normalized to canonical TitleCase by the manufacturer adapter layer.

### 3.4 Dataset Source Types
Permitted values for `datasets.sourceType`:
```text
user_upload
demo_dataset
synthetic_dataset
```

### 3.5 System Status Enums
The project defines immutable status values for lifecycle tracking. Do not invent alternative spellings:

- **Vehicle Asset Status (`vehicles.status`)**:
  - `healthy`
  - `attention`
  - `critical`
  - `unknown`
- **Dataset Ingestion Status (`datasets.status`)**:
  - `uploaded`
  - `processing`
  - `processed`
  - `failed`
- **Pipeline Run Status (`pipelineRuns.status`)**:
  - `queued`
  - `processing`
  - `completed`
  - `failed`
- **Pipeline Stage Status (`pipelineRuns.stages.<stage>.status`)**:
  - `waiting`
  - `processing`
  - `completed`
  - `failed`
  - `skipped`
- **Model Lifecycle Status (`modelVersions.status`)**:
  - `development`
  - `testing`
  - `production`
  - `deprecated`

### 3.6 Software & Model Versioning
- Follow Semantic Versioning: `MAJOR.MINOR.PATCH` (e.g. `1.0.0`, `2.4.0`).
- Where existing database records contain prefixed format tags (e.g. `v1.0`), preserve existing database compatibility.

### 3.7 Git Branching
Use structured prefixes:
```text
feature/<area>-<short-description>
fix/<area>-<short-description>
refactor/<area>-<short-description>
docs/<short-description>
```
Examples:
- `feature/backend-auth`
- `feature/ml-soh`
- `feature/data-pipeline-validation`
- `fix/prediction-response`
- `docs/api-contract`

### 3.8 Environment Variables
Use **`UPPER_SNAKE_CASE`**:
```text
MONGODB_URI
MONGODB_DATABASE
PORT
JWT_SECRET
ML_SERVICE_URL
```

### 3.9 Documentation Files
Use **`kebab-case.md`**:
```text
api-specification.md
system-context.md
data-pipeline.md
ml-architecture.md
naming-conventions.md
```

### 3.10 Explicit Identifiers
Always qualify resource IDs explicitly rather than using generic `id` or `ref`:
- `userId`
- `vehicleId`
- `datasetId`
- `pipelineRunId`
- `predictionId`

### 3.11 Electrochemical Physical Units
Always preserve standard physical units across all documentation, telemetry records, and models:
- **Capacity**: Kilowatt-hours (`kWh`) or Ampere-hours (`Ah`)
- **Temperature**: Degrees Celsius (`°C`)
- **Voltage**: Volts (`V`) or Millivolts (`mV`)
- **Current**: Amperes (`A`)
- **Power**: Watts (`W`) or Kilowatts (`kW`)
- **Energy**: Watt-hours (`Wh`) or Kilowatt-hours (`kWh`)
- **SOH**: Percentage (`%`, numeric `0.0` to `100.0`)
- **RUL**: Cycles (`cycles`, integer)
- **Confidence**: Ratio (`0.0` to `1.0`)

### 3.12 Time Representation
- API & JSON: Strict **ISO 8601** UTC string (`2026-09-07T14:30:00.000Z`)
- MongoDB: BSON `Date`
- Python: `datetime.datetime` with UTC timezone

---

## 4. Naming Consistency Rule & Conflict Resolution

Before adding a new field, endpoint, parameter, or database key:
1. Search `docs/database-schema.md`
2. Search `docs/data-dictionary.md`
3. Search `docs/api-specification.md`
4. If an existing term represents the concept, **reuse it verbatim**.
5. Never introduce alternative synonyms (`carId`, `evId`, `healthScore`, `remainingTime`) for existing canonical definitions.
