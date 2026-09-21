# VoltSense Documentation Index

Welcome to the technical documentation repository for **VoltSense**, an AI-powered EV battery health and lifespan prediction platform.

VoltSense analyzes battery management system (BMS) telemetry data across multiple automotive manufacturers (Tesla, BYD, Tata) to forecast State of Health (SOH), Remaining Useful Life (RUL), and End of Life (EOL) cycles using electrochemical feature engineering and machine learning inference.

---

## 1. System Implementation Status

| Subsystem | Technology | Current Status | Notes |
|---|---|---|---|
| **Frontend** | React 18, Vite, Tailwind CSS | **IMPLEMENTED** | Interactive dashboard, vehicles view, telemetry upload simulator, degradation charts, inference history. Uses client state/mock data. |
| **Backend** | Node.js, Express REST API | **IMPLEMENTED** | Orchestration layer, REST endpoints, JWT auth, database queries, storage dispatch, and test suite. |
| **Data Pipeline** | Python (pandas, numpy, scipy) | **PLANNED** | Ingestion, validation, manufacturer adapters, cleaning, outlier detection, feature engineering. |
| **ML Engine** | Python (Bayesian MCMC, NeuralODE) | **PLANNED** | SOH & RUL model inference, degradation curves, credible intervals, confidence scoring. |
| **Database** | MongoDB Atlas (v7.0+ WiredTiger) | **LOCKED / DESIGNED** | Authoritative 8-collection schema locked in `database-schema.md`. |
| **Object Storage** | Cloud Object Store (S3 / GCS) | **PLANNED** | Raw and processed telemetry storage (CSV, JSON, Parquet). |

### Status Indicators Used in Documentation

- `IMPLEMENTED`: Actively written and functional in the codebase.
- `PLANNED`: Designed and specified; awaiting implementation in subsequent phases.
- `LOCKED`: Authoritative design that must not be altered without formal consensus (e.g., MongoDB Atlas schema).
- `PLACEHOLDER`: Temporary mock or fixture data utilized for client-side demonstrations.

---

## 2. Documentation Map

```text
docs/
├── README.md                     # Documentation index & status guide (This file)
├── architecture.md               # High-level and detailed system architecture
├── system-context.md             # System context, external actors, and end-to-end user journey
├── project-structure.md          # Current workspace layout vs. planned target tree
├── api-specification.md          # Complete REST API specifications & endpoints
├── api-reference.md              # Detailed API endpoint reference with sample payloads
├── data-flow.md                  # Ingestion, processing, inference, and insight flows
├── frontend-backend-contract.md  # HTTP protocols, payload schemas, formats, and conventions
├── data-pipeline.md              # Python ingestion, cleaning, and feature engineering pipeline
├── ml-architecture.md            # ML models, features, degradation curves, and evaluation
├── ml-backend-contract.md        # Service contract between Node.js Backend & Python ML service
├── database-schema.md            # Authoritative MongoDB Atlas 8-collection schema
├── data-dictionary.md            # Canonical field definitions, types, units, and ranges
├── naming-conventions.md         # Project-wide naming rules across JS, Python, API, and DB
├── environment-variables.md      # Configuration parameters, secrets, and defaults
├── error-handling.md             # Global error classifications, codes, and response envelopes
├── validation-rules.md           # Entity and telemetry field validation constraints
├── testing-strategy.md           # Multi-tier testing approach and cross-boundary verification
├── deployment.md                 # Infrastructure topology, containerization, and hosting
└── development-workflow.md       # Git branching, PR checklist, and contract change policy
```

---

## 3. Source-of-Truth Hierarchy

To eliminate ambiguity across cross-functional engineering teams, the project adheres to the following strict source-of-truth hierarchy:

```text
MongoDB Schema (docs/database-schema.md)
   └── Authoritative for all persistent collection names, field names, and relationships.
         │
API Specification (docs/api-specification.md & docs/frontend-backend-contract.md)
   └── Authoritative for HTTP routes, query parameters, request/response bodies, and status codes.
         │
Data Dictionary (docs/data-dictionary.md)
   └── Authoritative for shared field names, electrochemical physical units, and numeric types.
         │
Naming Conventions (docs/naming-conventions.md)
   └── Authoritative for capitalization, file names, directory names, and terminology.
         │
Pipeline & ML Contracts (docs/data-pipeline.md & docs/ml-backend-contract.md)
   └── Authoritative for raw-to-processed feature contracts and model inference payloads.
```

> **Precedence Invariant**: If code or documentation conflicts with the locked MongoDB schema, the MongoDB schema is authoritative. If documentation conflicts with active code, documentation must be updated or the issue flagged rather than making uncoordinated changes.

---

## 4. Cross-System Contract Matrix

| Producer | Consumer | Protocol / Format | Data Transferred | Contract Specification |
|---|---|---|---|---|
| **Frontend** | **Backend** | HTTP / JSON & Multipart | Telemetry file uploads, user actions, vehicle crud, filter queries | [frontend-backend-contract.md](file:///r:/PP/VoltSense/docs/frontend-backend-contract.md) |
| **Backend** | **MongoDB** | MongoDB Wire Protocol | Application state, entity metadata, pipeline checkpoints, predictions | [database-schema.md](file:///r:/PP/VoltSense/docs/database-schema.md) |
| **Backend** | **Object Storage** | S3 / GCS HTTPS SDK | Raw telemetry uploads (`.csv`, `.json`), processed datasets (`.parquet`) | [architecture.md](file:///r:/PP/VoltSense/docs/architecture.md) |
| **Backend** | **Data Pipeline** | Job Dispatch (HTTP/Queue) | Job ID, raw file storage URL, vehicle manufacturer adapter name | [data-pipeline.md](file:///r:/PP/VoltSense/docs/data-pipeline.md) |
| **Data Pipeline** | **ML Engine** | Object Store / Shared Parquet | Cleaned, normalized, and feature-engineered electrochemical arrays | [ml-backend-contract.md](file:///r:/PP/VoltSense/docs/ml-backend-contract.md) |
| **ML Engine** | **Backend** | HTTP / JSON RPC | SOH (%), RUL (cycles), EOL cycle, confidence scores, degradation curves | [ml-backend-contract.md](file:///r:/PP/VoltSense/docs/ml-backend-contract.md) |
| **ML / Backend** | **AI Insights** | Context Generator | Structured diagnostic flags, thermal anomalies, degradation rates | [data-flow.md](file:///r:/PP/VoltSense/docs/data-flow.md) |
| **Backend** | **Frontend** | HTTP / JSON | Fleet telemetry summaries, predictions, diagnostic advisories | [api-specification.md](file:///r:/PP/VoltSense/docs/api-specification.md) |

---

## 5. How Developers Should Use This Documentation

1. **Frontend Engineers**:
   - Consult [frontend-backend-contract.md](file:///r:/PP/VoltSense/docs/frontend-backend-contract.md) for request and response structures, pagination rules, and data formatting.
   - Reference [api-specification.md](file:///r:/PP/VoltSense/docs/api-specification.md) and [api-reference.md](file:///r:/PP/VoltSense/docs/api-reference.md) when migrating components from mock `AppContext.jsx` state to API client hooks.
   - Follow [naming-conventions.md](file:///r:/PP/VoltSense/docs/naming-conventions.md) for component and file naming.

2. **Backend Engineers**:
   - Treat [database-schema.md](file:///r:/PP/VoltSense/docs/database-schema.md) as immutable truth for Mongoose/Prisma models or native MongoDB drivers.
   - Implement controllers according to [api-specification.md](file:///r:/PP/VoltSense/docs/api-specification.md).
   - Use [error-handling.md](file:///r:/PP/VoltSense/docs/error-handling.md) to structure all API error envelopes.
   - Implement pipeline orchestration adhering to [ml-backend-contract.md](file:///r:/PP/VoltSense/docs/ml-backend-contract.md).

3. **Data & ML Engineers**:
   - Build ingestion adapters adhering to the stages described in [data-pipeline.md](file:///r:/PP/VoltSense/docs/data-pipeline.md).
   - Ensure feature sets output the canonical fields listed in [data-dictionary.md](file:///r:/PP/VoltSense/docs/data-dictionary.md).
   - Consume standardized features in the ML engine as outlined in [ml-architecture.md](file:///r:/PP/VoltSense/docs/ml-architecture.md).
   - Format inference responses strictly according to [ml-backend-contract.md](file:///r:/PP/VoltSense/docs/ml-backend-contract.md).
