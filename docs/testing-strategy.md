# VoltSense Comprehensive Testing Strategy

## 1. Multi-Tier Testing Pyramid

VoltSense enforces a multi-tier testing methodology spanning unit, integration, contract, and end-to-end (E2E) verification across its web, backend, and numerical computing subsystems.

```text
├─────────────────────────────────────────────────────────────────┤
│               CONTRACT TESTS (OpenAPI / Schema Valid)           │
│         Frontend <-> Backend & Backend <-> ML Interoperability  │
├─────────────────────────────────────────────────────────────────┤
│            INTEGRATION TESTS (Supertest / Pytest / Mongo)       │
│         Database queries, pipeline transforms, IPC services     │
├─────────────────────────────────────────────────────────────────┤
│                 UNIT TESTS (Vitest / Jest / Pytest)             │
│    Component rendering, utility functions, adapter signal parsing│
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Subsystem Test Specifications

| Testing Tier | Technology | Target Subsystem | Scope & Coverage |
|---|---|---|---|
| **Frontend Unit & Component** | Vitest, React Testing Library | `frontend/` | Component rendering, user interaction, modal toggles, mock context actions, SVG chart point math. |
| **Backend Unit** | Jest, Supertest | `backend/` | Controller request handlers, JWT token issuance/verification, validation schema execution. |
| **Backend Integration** | Jest, `mongodb-memory-server` | `backend/` | Transactional CRUD against MongoDB collections, index uniqueness enforcement, cascade deletions. |
| **Data Pipeline Tests** | Pytest, Pandas testing utilities | `data-pipeline/` | Manufacturer DBC mapping fidelity, outlier rejection math, interpolation stability, Parquet output. |
| **ML Inference Tests** | Pytest, NumPy | `ml-service/` | Model output tensor shape verification, non-negativity of RUL, SOH within $[0, 100]\%$, latency checks. |
| **API Contract Tests** | Prism / Dredd / Pact | `frontend/` $\leftrightarrow$ `backend/` | Verifies real Express endpoints match `api-specification.md` JSON schemas and envelopes. |
| **End-to-End (E2E)** | Playwright | Full System | Automated browser execution of full user journey (sign in $\rightarrow$ add EV $\rightarrow$ upload telemetry $\rightarrow$ view SOH chart). |

---

## 3. Cross-Boundary Integration Testing

### 3.1 Frontend ↔ Backend Contract Tests
- **Objective**: Verify that every response emitted by the Node.js backend conforms to the 4-key envelope (`success`, `data`, `message`, `error`).
- **Test Scenarios**:
  - `GET /api/vehicles` returns `id` as string, not `_id` or BSON structure.
  - SOH and RUL metrics are strictly numeric values (no `%` or `cycles` strings).
  - All timestamps parse into valid browser `Date` objects (ISO 8601).
  - Error responses produce structured field maps under `error.details`.

### 3.2 Backend ↔ MongoDB Integration Tests
- **Objective**: Validate Mongoose/native driver queries against the authoritative 8 collections.
- **Test Scenarios**:
  - Unique index on `users.email` rejects duplicate registrations.
  - Compound indexes (`{ vehicleId: 1, createdAt: -1 }` on `predictions`) execute with indexed scans (`IXSCAN`) rather than collection scans (`COLLSCAN`).
  - Insertion of documents with unapproved extra fields is rejected when strict schema validation is enabled.

### 3.3 Backend ↔ Data Pipeline Integration Tests
- **Objective**: Verify that backend job dispatch correctly starts the Python pipeline and receives progress updates.
- **Test Scenarios**:
  - Successful execution updates all 7 stage statuses in `pipelineRuns.stages`.
  - Corrupted raw CSV causes pipeline to mark `pipelineRuns.status = "failed"` without crashing the backend daemon.

### 3.4 Data Pipeline ↔ ML Subsystem Integration Tests
- **Objective**: Verify seamless feature handoff.
- **Test Scenarios**:
  - Pipeline output Parquet contains all canonical columns (`lli_ratio`, `lam_ratio`, `internal_resistance_mohm`).
  - ML loader reads Parquet without missing column errors.
  - Features are appropriately scaled within $[-3.0, +3.0]$ or $[0.0, 1.0]$.

### 3.5 Backend ↔ ML Subsystem Service Tests
- **Objective**: Validate synchronous or asynchronous inference handoff.
- **Test Scenarios**:
  - ML service returns `200 OK` with valid `soh`, `rulCycles`, and `estimatedEOLCycle`.
  - Inference response maps cleanly into the `predictions` collection schema.
  - Backend updates `vehicles.latestSOH` upon prediction storage.

---

## 4. Test Execution Commands (Planned)

```bash
# Frontend unit tests
cd frontend && npm run test

# Backend unit and integration tests
cd backend && npm test

# Python data pipeline unit tests
cd data-pipeline && pytest tests/ -v

# Python ML model tests
cd ml-service && pytest tests/ -v

# End-to-End browser tests
npm run test:e2e
```
