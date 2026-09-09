# VoltSense End-to-End Data Flow

## 1. Overview

Data in VoltSense transitions through four distinct analytical stages:
1. **Telemetry Ingestion & Upload Flow** (Client to Object Store & Database Metadata)
2. **Data Pipeline Processing Flow** (Raw Multi-Manufacturer BMS Data to Standardized Features)
3. **Machine Learning Inference Flow** (Electrochemical Features to SOH/RUL Predictions)
4. **AI Insight & Diagnostic Flow** (Prediction Context to Actionable Advisories)

---

## 2. Telemetry Ingestion & Upload Flow

```text
User                  React Frontend           Express API           Object Storage         MongoDB Atlas
 │                          │                       │                      │                      │
 │ 1. Selects file (.csv)   │                       │                      │                      │
 ├─────────────────────────►│                       │                      │                      │
 │                          │ 2. Pre-flight check   │                      │                      │
 │                          ├──────────────────────►│                      │                      │
 │                          │                       │                      │                      │
 │                          │ 3. POST /datasets     │                      │                      │
 │                          ├──────────────────────►│                      │                      │
 │                          │                       │ 4. Stream Raw File   │                      │
 │                          │                       ├─────────────────────►│                      │
 │                          │                       │                      │                      │
 │                          │                       │ 5. Insert dataset    │                      │
 │                          │                       ├────────────────────────────────────────────►│
 │                          │ 6. HTTP 201 Created   │                      │                      │
 │                          │◄──────────────────────┤                      │                      │
 │                          │                       │                      │                      │
 │ 7. Clicks "Start Pipeline"                       │                      │                      │
 ├─────────────────────────►│ 8. POST /process      │                      │                      │
 │                          ├──────────────────────►│                      │                      │
 │                          │                       │ 9. Update status & Enqueue                  │
 │                          │                       ├────────────────────────────────────────────►│
 │                          │ 10. HTTP 202 Accepted │                      │                      │
 │                          │◄──────────────────────┤                      │                      │
```

### Flow Ownership:
- **Client (Frontend)**: Local pre-flight validation (MIME type, file size bounds).
- **Backend**: Streaming upload proxy to prevent memory exhaustion, metadata persistence in MongoDB `datasets`.
- **Object Storage**: Durable byte persistence.

---

## 3. Data Pipeline Transformation Flow

```text
Raw File from Object Storage (CSV / JSON / Parquet)
   │
   ▼
┌─────────────────────────────────────────────────────────────┐
│                    Python Data Pipeline                     │
│                                                             │
│  [Stage 1: Validation] ──► Format, checksum & columns       │
│           │                                                 │
│           ▼                                                 │
│  [Stage 2: Manufacturer Adapter] ──► Tesla/BYD/Tata DBC     │
│           │                                                 │
│           ▼                                                 │
│  [Stage 3: Common Schema Mapping] ──► Voltage, current, temp│
│           │                                                 │
│           ▼                                                 │
│  [Stage 4: Cleaning & Deduplication] ──► Time sorting       │
│           │                                                 │
│           ▼                                                 │
│  [Stage 5: Missing Value Handling] ──► Interpolation        │
│           │                                                 │
│           ▼                                                 │
│  [Stage 6: Outlier & Noise Filter] ──► Voltage/thermal limits│
│           │                                                 │
│           ▼                                                 │
│  [Stage 7: Feature Engineering] ──► LLI, LAM, ΔV, ΔT        │
│           │                                                 │
│           ▼                                                 │
│  [Stage 8: Normalization] ──► Scaled feature matrix         │
└───────────┬─────────────────────────────────────────────────┘
            │
            ├──► Processed Parquet File (Cloud Object Storage)
            └──► Pipeline Run Record (MongoDB Atlas)
```

### Detailed Stage Ownership & State Transitions:
1. **Validation**: Emits failure to `pipelineRuns.stages.validation` if mandatory fields are missing.
2. **Manufacturer Adapter**: Detects battery format (e.g. Tesla Model 3 NCA vs. BYD Atto 3 Blade LFP).
3. **Common Schema**: Enforces universal naming (`packVoltage`, `packCurrent`, `cellTemperatures`).
4. **Cleaning**: Eliminates duplicates caused by telemetry network retries.
5. **Missing Value Handling**: Preserves sampling rate continuity without fabricating sustained gaps.
6. **Outlier Detection**: Drops sensor noise (e.g. ADC quantization noise, inductive voltage spikes).
7. **Feature Engineering**: Derives key battery degradation predictors (Loss of Lithium Inventory, Ohmic resistance).
8. **Normalization**: Produces zero-mean or scaled arrays ready for mathematical modeling.

---

## 4. Machine Learning Inference Flow

```text
Data Pipeline           ML Engine           Object Storage        MongoDB Atlas         Express Backend
 │                          │                      │                    │                      │
 │ 1. POST /ml/predict      │                      │                    │                      │
 ├─────────────────────────►│                      │                    │                      │
 │                          │ 2. Lookup Model      │                    │                      │
 │                          ├──────────────────────────────────────────►│                      │
 │                          │ 3. Load Features/Weights                  │                      │
 │                          ├─────────────────────►│                    │                      │
 │                          │                      │                    │                      │
 │                          │ 4. Run SOH & RUL Models                   │                      │
 │                          │ 5. Calculate EOL Cycle                    │                      │
 │                          │ 6. Credible Intervals                     │                      │
 │                          │                      │                    │                      │
 │                          │ 7. Return Prediction Payload              │                      │
 │                          ├─────────────────────────────────────────────────────────────────►│
 │                          │                      │                    │                      │
 │                          │                      │                    │ 8. Store Prediction  │
 │                          │                      │                    │    & Update Vehicle  │
 │                          │                      │                    │◄─────────────────────┤
```

### Flow Ownership:
- **ML Engine**: Algorithm execution, uncertainty quantification, and downsampling degradation trajectories.
- **Backend / Database**: Registering final inferences into MongoDB `predictions` and updating operational cache fields on `vehicles`.

---

## 5. AI Insight & Diagnostic Advisory Flow

```text
Express Backend             AI Insights Engine           MongoDB Atlas             React Frontend
       │                            │                          │                         │
       │ 1. Request Insight Gen     │                          │                         │
       ├───────────────────────────►│                          │                         │
       │                            │ 2. Evaluate Heuristics   │                         │
       │                            │ 3. Synthesize Advisories │                         │
       │                            │                          │                         │
       │ 4. Return Insight JSON     │                          │                         │
       │◄───────────────────────────┤                          │                         │
       │                            │                          │                         │
       │ 5. Insert aiInsights & Notifications                  │                         │
       ├──────────────────────────────────────────────────────►│                         │
       │                                                       │                         │
       │ 6. GET /predictions/:id/insights                      │                         │
       │◄────────────────────────────────────────────────────────────────────────────────┤
       │ 7. Return Insights & Recommendations                  │                         │
       ├────────────────────────────────────────────────────────────────────────────────►│
```

### Flow Ownership:
- **AI Insights Engine**: Synthesizes numerical outputs into human-readable electrochemical explanations.
- **Backend**: Records advisories and queues user notifications.
- **Frontend**: Renders alert tags, recommendation checklists, and printable PDF reports.
