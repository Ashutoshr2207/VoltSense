# VoltSense System Context & Actors

## 1. System Overview

VoltSense operates as an intelligent analytical boundary between electric vehicle hardware telemetry (collected from battery management systems) and fleet operators/EV owners who need operational foresight into battery degradation, safety anomalies, and remaining asset lifespan.

---

## 2. System Context Diagram

```text
                          ┌───────────────────────────┐
                          │  EV Owner / Fleet Lead    │
                          └─────────────┬─────────────┘
                                        │ HTTPS / Browser
                                        ▼
    ┌───────────────────────────────────────────────────────────────────────┐
    │                         VOLTSENSE PLATFORM                            │
    │                                                                       │
    │  ┌───────────────────┐    REST / JSON    ┌─────────────────────────┐  │
    │  │ Frontend Web App  │<----------------->│ Backend API Orchestrator│  │
    │  │ (React/Vite/Tail) │                   │    (Node.js / Express)  │  │
    │  └───────────────────┘                   └────┬──────────────┬─────┘  │
    │                                               │              │        │
    │                  ┌────────────────────────────┘              │        │
    │                  │ Wire Protocol           S3 SDK            │ Job    │
    │                  ▼                                           ▼        │
    │       ┌───────────────────┐                      ┌─────────────────┐  │
    │       │   MongoDB Atlas   │                      │  Data Pipeline  │  │
    │       │ (Metadata & State)│                      │ (Python/Pandas) │  │
    │       └───────────────────┘                      └────────┬────────┘  │
    │                  ▲                                        │           │
    │                  │ Results                                │ Features  │
    │                  │                                        ▼           │
    │       ┌───────────────────┐                      ┌─────────────────┐  │
    │       │  Cloud Storage    │                      │   ML Engine     │  │
    │       │    (S3 / GCS)     │                      │ (Python Models) │  │
    │       └───────────────────┘                      └────────┬────────┘  │
    │                  ▲                                        │           │
    │                  └────────────────────────────────────────┘           │
    │                                Inferences                             │
    └───────────────────────────────────────────────────────────────────────┘
```

---

## 3. Actors and Interactions

### 3.1 Primary External Actors

1. **EV Owner / Fleet Operations Lead (User)**:
   - **Role**: Primary human consumer and operator.
   - **Interactions**: Registers account, logs in, registers EV battery assets (specifying manufacturer, model, battery variant, nominal capacity), uploads raw BMS telemetry exports (CSV, JSON, Parquet), inspects SOH/RUL dashboards, downloads diagnostic reports, and configures alert thresholds.

### 3.2 Internal System Actors

2. **Frontend Application (`frontend/`)**:
   - **Status**: `IMPLEMENTED` (UI & local mock state).
   - **Interactions**: Interacts with the user through browser rendering. Transmits user actions, multipart file uploads, and filtering queries to the Backend API via HTTP REST. Renders interactive SVG degradation trajectories and diagnostic cards.

3. **Backend API & Orchestrator (`backend/`)**:
   - **Status**: `PLANNED`.
   - **Interactions**: Interacts with Frontend via REST/JSON, handles JWT authentication, performs RBAC, records metadata in MongoDB, transfers files to Object Storage, triggers the Data Pipeline job, queries the ML Engine, generates AI insights, and delivers notifications.

4. **Data Pipeline Service (`data-pipeline/`)**:
   - **Status**: `PLANNED`.
   - **Interactions**: Consumes raw files from Object Storage, applies manufacturer-specific mappings (Tesla CAN DBC, BYD Blade CAN, Tata Ziptron OBD-II), removes sensor noise, interpolates dropouts, calculates electrochemical degradation indicators, writes processed Parquet files back to Object Storage, and notifies ML Engine.

5. **Machine Learning Engine (`ml-service/`)**:
   - **Status**: `PLANNED`.
   - **Interactions**: Reads normalized feature datasets, loads active model weights from the `modelVersions` registry, executes Bayesian MCMC or neural regression, calculates SOH, RUL, and EOL cycle forecasts, and returns structured predictions to the Backend.

6. **MongoDB Atlas (`voltsense`)**:
   - **Status**: `LOCKED / DESIGNED`.
   - **Interactions**: Acts as the centralized operational datastore. Stores state documents for `users`, `vehicles`, `datasets`, `pipelineRuns`, `predictions`, `aiInsights`, `notifications`, and `modelVersions`.

7. **Cloud Object Storage (S3 / GCS)**:
   - **Status**: `PLANNED`.
   - **Interactions**: Acts as the immutable file sink for raw and processed time-series telemetry.

---

## 4. End-to-End User Journey

```text
[Phase 1: Onboarding & Asset Registration]
  User ──► (POST /api/auth/register) ──► Backend ──► MongoDB (users)
  User ──► (POST /api/vehicles) ──► Backend ──► MongoDB (vehicles)

[Phase 2: Telemetry Ingestion]
  User ──► (Upload CSV File) ──► Frontend ──► Backend ──► Object Storage (/raw/*.csv)
                                                │
                                                └──► MongoDB (datasets)

[Phase 3: Processing & Inference Orchestration]
  Backend ──► Data Pipeline ──► Read Raw CSV from Object Storage
                                   │
                                   ▼ Clean, Adapt, Extract Features
                                   │
                              Write Processed Parquet to Storage
                                   │
                                   ▼
                              ML Engine ──► SOH & RUL Predictions
                                               │
                                               ▼
                              Backend ◄────────┘
                                 │
                                 ├──► MongoDB (predictions)
                                 ├──► MongoDB (aiInsights)
                                 └──► MongoDB (notifications)

[Phase 4: Visualization & Diagnostics]
  User ◄── (Renders SOH Gauge & Trajectory) ◄── Frontend ◄── Backend ◄── MongoDB
```

---

## 5. Architectural Boundaries Summary

- The user operates solely through the authenticated Frontend.
- High-volume data flows into Object Storage; MongoDB retains strictly queryable metadata and downsampled chart curves.
- The pipeline isolates manufacturer-specific dirty telemetry formats from the clean, uniform feature space consumed by the ML model.
- Model inferences are coupled to explainable AI summaries before presentation to the end user.
