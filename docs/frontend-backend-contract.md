# VoltSense Frontend ↔ Backend Integration Contract

## 1. Overview & Purpose

This document serves as the binding technical contract between the **React Frontend** (`frontend/`) and the **Node.js / Express Backend** (`backend/`). Its purpose is to guarantee predictable request shapes, response envelopes, serialization types, and error patterns across all HTTP boundaries.

---

## 2. Request Standards

### 2.1 Content Formatting & Headers
- **Standard Payloads**: Every JSON-based request must specify:
  ```http
  Content-Type: application/json
  Accept: application/json
  ```
- **Multipart Uploads**: When uploading telemetry files (CSV, JSON, Parquet), omit manual `Content-Type` header declarations in client fetch/axios calls to permit browsers to automatically calculate multipart boundaries (`multipart/form-data; boundary=...`).
- **Authorization Header**: Bearer token format:
  ```http
  Authorization: Bearer <jwt_string>
  ```
  Unauthenticated requests to protected endpoints return `401 Unauthorized` immediately.

### 2.2 Query Parameters & Casing
- All query string parameters must strictly use **camelCase**.
- Standard pagination parameter names:
  - `page`: 1-indexed integer (`page=1` is the first page).
  - `pageSize`: Integer count of items per page (default: `20`, max: `100`).
  - `sortBy`: Canonical property name (e.g. `createdAt`, `uploadedAt`, `latestSOH`).
  - `sortOrder`: Sorting direction enum: `"asc"` or `"desc"` (default: `"desc"`).
- Example:
  ```http
  GET /api/vehicles?page=1&pageSize=10&sortBy=latestSOH&sortOrder=desc
  ```

---

## 3. Response Structure & Serialization Invariants

### 3.1 Standard Response Envelope
All API responses—success or error—must adhere to the single canonical 4-key JSON schema.

#### Success Envelope (`200 OK`, `201 Created`, `202 Accepted`)
```json
{
  "success": true,
  "data": {},
  "message": "Optional human-readable confirmation string or null",
  "error": null
}
```

#### Error Envelope (`4xx Client Error`, `5xx Server Error`)
```json
{
  "success": false,
  "data": null,
  "message": "Human-readable error explanation for UI display",
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "details": {}
  }
}
```

### 3.2 Identification (IDs) Invariant
- **MongoDB `_id` Transposition**: The backend must never serialize raw BSON ObjectId structures (e.g., `{"$oid": "..."}`) to the frontend.
- **Top-Level Field**: The primary entity key must be serialized as a plain string named `id`.
- **Foreign Keys**: Foreign references must retain explicit camelCase identifier naming and string formatting:
  ```json
  {
    "id": "68a02a11b7c4d81234567891",
    "userId": "68a01f92b7c4d81234567890",
    "latestPredictionId": "68a03b55b7c4d81234567895"
  }
  ```

### 3.3 Timestamps & Date Invariant
- All timestamps must cross the HTTP boundary as strict **ISO 8601 UTC strings**:
  ```json
  "createdAt": "2026-09-07T14:30:00.000Z"
  ```
- **Strictly Prohibited**: Millisecond integers (`1788791400000`) or locale-specific date strings (`"Sep 7, 2026, 2:30 PM"`). The React client handles locale formatting.

### 3.4 Numerical Purity Invariant
- Numerical metrics must **always be transmitted as pure Numbers**.
- **Never append unit symbols** in backend responses:

| Metric | Correct Backend Serialization | Prohibited Backend Serialization | Reason |
|---|---|---|---|
| **SOH** | `94.2` | `"94.2%"` or `"94.2 %"` | Breaks arithmetic, sorting, and charting |
| **RUL** | `680` | `"680 cycles"` or `"680"` | Prevents numeric range filtering |
| **EOL** | `1092` | `"Cycle 1092"` | Forces client-side regex parsing |
| **Voltage** | `389.4` | `"389.4 V"` | Blocks chart interpolation |
| **Cycle Count** | `412` | `"412"` | Forces unnecessary string-to-int casts |
| **Confidence** | `0.94` | `"High"` or `"94%"` | Obscures numerical statistical margin |

- **Client Responsibility**: The React frontend component is solely responsible for rendering display units (e.g. `${vehicle.latestSOH.toFixed(1)}%` or `${vehicle.latestRUL} cycles`).

---

## 4. Entity Attribute Cross-Reference

To facilitate seamless transition from current `AppContext.jsx` mock fixtures to real backend payloads, the following mapping is established:

| Concept | Frontend Mock Key (`AppContext.jsx`) | Backend Canonical Key | Type | Notes |
|---|---|---|---|---|
| **Entity Identifier** | `id` | `id` | `String` (ObjectId) | String format |
| **User ID** | N/A (implicit) | `userId` | `String` (ObjectId) | User ownership |
| **Vehicle ID** | `vehicleId` | `vehicleId` | `String` (ObjectId) | FK reference |
| **Vehicle Name** | `name` | `manufacturer` + `model` | `String` | Backend stores atomic fields |
| **Pack Chemistry** | `chemistry` | `batteryVariant` | `String` | e.g. `"Long Range AWD"` |
| **Current Cycles** | `cycles` | `currentCycleCount` | `Number` | Monotonic odometer cycles |
| **SOH Percentage** | `soh` | `latestSOH` | `Number` | Percentage (0.0 to 100.0) |
| **RUL Cycles** | `rul` | `latestRUL` | `Number` | Remaining cycle count |
| **EOL Milestone** | `eolThreshold` | `latestEOL` | `Number` | Projected cycle at threshold |
| **Fleet Status** | `status` (`"Healthy"`) | `status` (`"healthy"`) | `String` | Lowercase enum in API |

---

## 5. Polling & Status Transition Contract

When a user initiates processing on `UploadData.jsx`:
1. Client calls `POST /api/vehicles/:vehicleId/datasets` with file -> receives `201 Created` with `dataset.id`.
2. Client calls `POST /api/datasets/:datasetId/process` -> receives `202 Accepted` with `pipelineRunId`.
3. Client polls `GET /api/datasets/:datasetId/status` every 1,500ms until `status` transitions to `"completed"` or `"failed"`.
4. Upon `"completed"`, client transitions active tab to `BatteryAnalysis` and fetches `/api/predictions/:predictionId`.
