# VoltSense System Architecture

## 1. Executive Summary

**VoltSense** is an AI-driven predictive health platform for Electric Vehicle (EV) batteries. The system is engineered to ingest raw Battery Management System (BMS) time-series data across heterogeneous EV manufacturers (e.g., Tesla, BYD, Tata), normalize electrochemical telemetry, extract degradation features, and execute statistical and machine learning models to forecast **State of Health (SOH)**, **Remaining Useful Life (RUL)**, and projected **End of Life (EOL)** milestones.

---

## 2. High-Level Architecture

```text
                        VOLTSENSE PLATFORM
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
  CLIENT LAYER            SERVICE LAYER           STORAGE LAYER
┌──────────────┐        ┌──────────────┐      ┌──────────────────┐
│ React 18 SPA │<------>│ Node Express │<---->│  MongoDB Atlas   │
│ Vite/Tailwind│ HTTPS  │  REST API    │ Wire │(Operational Meta)│
└──────────────┘        └──────┬───────┘      └──────────────────┘
                               │                       ▲
                               │ S3 SDK                │ Store
                               ▼                       │ Results
                        ┌──────────────┐               │
                        │Cloud Storage │               │
                        │(S3 / GCS)    │               │
                        └──────┬───────┘               │
                               │ Read Raw /            │
                               │ Write Parquet         │
                               ▼                       │
                        ┌──────────────┐               │
                        │Data Pipeline │               │
                        │(Python Data) │               │
                        └──────┬───────┘               │
                               │ Standard Features     │
                               ▼                       │
                        ┌──────────────┐               │
                        │  ML Engine   │───────────────┘
                        │ (Python ML)  │ Inference Output
                        └──────────────┘
```

---

## 3. Detailed Component Architecture

```text
                      EV Fleet Operator / Engineer
                                   │
                                   ▼ Interacts via Browser
    ┌─────────────────────────────────────────────────────────────┐
    │                 React Frontend (Implemented)                │
    │  [Dashboard]  [MyVehicles]  [UploadData]  [BatteryAnalysis] │
    └──────────────────────────────┬──────────────────────────────┘
                                   │ REST Requests / JWT Bearer
                                   ▼
    ┌─────────────────────────────────────────────────────────────┐
    │             Node.js / Express Backend (Planned)             │
    │  [Auth] [Vehicles] [Datasets] [Orchestration] [Predictions] │
    └──────┬───────────────────────┬───────────────────────┬──────┘
           │                       │                       │
           │ Read/Write            │ Stream                │ Dispatch
           ▼ Metadata              ▼ Raw Files             ▼ Processing
┌─────────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│  MongoDB Atlas      │  │ Cloud Object     │  │ Data Pipeline        │
│  (Locked Schema)    │  │ Storage (Planned)│  │ (Python) (Planned)   │
│  - users            │  │ - /raw/*.csv     │  │ 1. Validation        │
│  - vehicles         │  │ - /proc/*.parquet│  │ 2. Adapter (Tesla/   │
│  - datasets         │  │ - /models/*.pkl  │  │    BYD/Tata)         │
│  - pipelineRuns     │  └────────┬─────────┘  │ 3. Schema Mapping    │
│  - predictions      │           │            │ 4. Cleaning          │
│  - aiInsights       │           │            │ 5. Imputation        │
│  - notifications    │           │            │ 6. Outlier Filter    │
│  - modelVersions    │           │            │ 7. Feature Eng (LLI) │
└─────────────────────┘           │            │ 8. Normalization     │
           ▲                      │            └──────────┬───────────┘
           │                      │                       │
           │ Store                │ Read Features         │ Standard
           │ Predictions          ▼                       ▼ Features
           │            ┌───────────────────────────────────┐
           │            │   ML Inference Engine (Planned)   │
           └────────────┤   [SOH]  [RUL]  [EOL]  [Curves]   │
                        └───────────────────────────────────┘
```

---

## 4. Subsystem Responsibilities & Boundary Invariants

To maintain strict modularity, each subsystem has unambiguous responsibilities and strict negative invariants (what it must **NOT** do).

### 4.1 Frontend Layer (`frontend/`)
- **Technology**: React 18, Vite, Tailwind CSS, Material Symbols.
- **Responsibilities**:
  - Render user interface, forms, telemetry dashboards, degradation charts, and audit tables.
  - Manage client navigation, route guarding, and UI state.
  - Validate client-side inputs (e.g., file extension, form field presence) before transmission.
  - Present electrochemical metrics, confidence intervals, and health alerts.
- **Explicit Invariants (Must NOT do)**:
  - Must **not** connect directly to MongoDB Atlas.
  - Must **not** execute heavy telemetry calculations, interpolation, or ML inference.
  - Must **not** store raw telemetry files directly to cloud storage without backend authorization.
  - Must **not** perform business-critical validation or authentication checks client-side.

### 4.2 Backend Layer (`backend/`)
- **Technology**: Node.js, Express, Mongoose/MongoDB Driver.
- **Responsibilities**:
  - Expose RESTful APIs for Frontend consumption.
  - Authenticate users, verify credentials, issue JWT tokens, and enforce RBAC.
  - Orchestrate data ingestion: receive uploads, stream raw files to Object Storage, register dataset records in MongoDB.
  - Dispatch pipeline execution jobs to the Python Data Pipeline.
  - Interface with the ML service to request inferences and persist predictions to MongoDB.
  - Manage notification dispatch and user settings.
- **Explicit Invariants (Must NOT do)**:
  - Must **not** parse millions of raw time-series telemetry rows in Node.js event loops.
  - Must **not** execute numerical ML tensor models or electrochemical differential equations.
  - Must **not** store large file blobs (CSV/Parquet) directly in MongoDB documents.
  - Must **not** alter the locked MongoDB schema collections.

### 4.3 Data Pipeline Layer (`data-pipeline/`)
- **Technology**: Python 3.11+, Pandas, NumPy, SciPy.
- **Responsibilities**:
  - Ingest raw telemetry files (CSV, JSON, Parquet) from cloud object storage.
  - Validate file headers, sampling rates, and data consistency.
  - Route files through manufacturer-specific adapters (Tesla, BYD, Tata).
  - Clean missing values, synchronize multi-sensor sampling rates, and filter sensor spikes.
  - Compute electrochemical features (e.g., Loss of Lithium Inventory, Loss of Active Material, cell imbalance $\Delta V$, temperature variance $\Delta T$).
  - Export standardized, normalized Parquet files ready for ML consumption.
  - Emit status updates to MongoDB `pipelineRuns` collection.
- **Explicit Invariants (Must NOT do)**:
  - Must **not** expose public-facing client authentication endpoints.
  - Must **not** run ML regression or neural inference models (delegated to ML Engine).
  - Must **not** serve UI requests directly.

### 4.4 Machine Learning Layer (`ml-service/`)
- **Technology**: Python 3.11+, Scikit-learn, PyTorch / NumPyro (Bayesian inference).
- **Responsibilities**:
  - Ingest standardized features generated by the Data Pipeline.
  - Execute SOH (State of Health) prediction models.
  - Execute RUL (Remaining Useful Life) cycle forecasting models.
  - Project End-of-Life (EOL) cycles based on cell threshold limits (e.g., 70% or 80% SOH).
  - Compute model confidence scores and credible intervals.
  - Generate downsampled degradation curve points for visualization.
  - Interface with the `modelVersions` registry.
- **Explicit Invariants (Must NOT do)**:
  - Must **not** consume un-normalized, raw manufacturer telemetry files directly.
  - Must **not** perform user management or session handling.
  - Must **not** write arbitrary ad-hoc collections to MongoDB.

### 4.5 MongoDB Atlas (`voltsense`)
- **Technology**: MongoDB Atlas v7.0+ (WiredTiger).
- **Role**: Operational metadata store, execution state repository, and structured prediction log.
- **Contents**: Strictly the 8 locked collections (`users`, `vehicles`, `datasets`, `pipelineRuns`, `predictions`, `aiInsights`, `notifications`, `modelVersions`).
- **Explicit Invariants (Must NOT do)**:
  - Must **not** store raw continuous time-series sensor traces (which belong in Object Storage).
  - Must **not** store unindexed arbitrary binary blobs larger than 16 MB.

### 4.6 Object Storage Layer (Cloud S3 / GCS)
- **Technology**: AWS S3 or Google Cloud Storage.
- **Role**: High-capacity blob storage for raw uploads, interim transformed arrays, and model binary weights.
- **Contents**:
  - `raw/{vehicleId}/{datasetId}.csv`
  - `processed/{vehicleId}/{pipelineRunId}.parquet`
  - `models/{modelVersion}/weights.pkl`
- **Explicit Invariants (Must NOT do)**:
  - Must **not** serve as the transactional query store for application state.
