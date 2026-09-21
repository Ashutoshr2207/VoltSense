# VoltSense Error Handling Strategy

## 1. Global Error Architecture

VoltSense enforces a unified error management model across all architectural layers. Whether an error originates in the browser, an Express validation middleware, a Python CAN DBC parser, or a PyTorch matrix inversion, errors must be caught, categorized, logged, and translated into the canonical API error envelope before reaching the client.

---

## 2. Standard API Error Response Envelope

All error responses return `success: false` and follow this immutable structure:

```json
{
  "success": false,
  "data": null,
  "message": "Human-readable error explanation suitable for UI presentation",
  "error": {
    "code": "ERROR_CATEGORY_CODE",
    "details": {}
  }
}
```

- **`success`**: Always `false`.
- **`data`**: Always `null`.
- **`message`**: A concise, user-friendly sentence explaining the operational problem.
- **`error.code`**: Machine-readable string enum (see categories below).
- **`error.details`**: Structured key-value pairs with field-specific errors, constraint violations, or diagnostic metadata.

---

## 3. Error Categories & HTTP Status Mapping

| Error Code | HTTP Status | Description | Responsible Layer |
|---|---|---|---|
| `VALIDATION_ERROR` | `400 Bad Request` | Malformed JSON, missing mandatory fields, invalid numeric ranges | Backend Middleware / Frontend |
| `FILE_UPLOAD_ERROR` | `400 Bad Request` | Unsupported file extension, file size $> 50\text{ MB}$, corrupt headers | Backend Upload Middleware |
| `UNAUTHORIZED` | `401 Unauthorized` | Missing, malformed, or expired JWT bearer token | Backend Auth Middleware |
| `FORBIDDEN` | `403 Forbidden` | Authenticated user lacks permission to access target vehicle/dataset | Backend RBAC Middleware |
| `NOT_FOUND` | `404 Not Found` | Requested vehicle, dataset, prediction, or user does not exist | Backend Controller |
| `CONFLICT` | `409 Conflict` | Duplicate resource (e.g. email already registered, concurrent processing) | Backend Controller |
| `PIPELINE_ERROR` | `422 Unprocessable` | Data pipeline failed (corrupt CAN trace, unrecognized manufacturer DBC) | Python Data Pipeline |
| `ML_ERROR` | `422 Unprocessable` | Model inference failed (posterior non-convergence, mathematical singularity) | Python ML Subsystem |
| `DATABASE_ERROR` | `500 Internal Error` | MongoDB connection timeout, unique constraint failure, disk quota | Backend Database Layer |
| `INTERNAL_ERROR` | `500 Internal Error` | Unhandled runtime exception or crash | Global Backend Handler |

---

## 4. Layer-Specific Error Handling Responsibilities

### 4.1 Frontend Layer (`frontend/`)
- **Pre-flight Validation**: Catch format and size errors (e.g. selecting a `.exe` or a $120\text{ MB}$ file) in the browser before network transmission.
- **Error Interceptor**: Axios / Fetch response interceptors parse the 4-key JSON envelope.
- **UI Presentation**:
  - Map `VALIDATION_ERROR.details` directly to inline form input fields.
  - Present toast notifications or alert banners for `PIPELINE_ERROR` or `ML_ERROR`.
  - Redirect to `/signin` upon encountering `UNAUTHORIZED`.

### 4.2 Backend Layer (`backend/`)
- **Schema Validation Middleware**: Validate all incoming `req.body`, `req.params`, and `req.query` using Joi or Zod before hitting business controllers.
- **Global Error Handling Middleware**: Catch all synchronous and asynchronous promise rejections. Transform unhandled exceptions into `INTERNAL_ERROR` without leaking stack traces in production (`NODE_ENV === "production"`).
- **Audit Logging**: Log error stacks, request IDs, user IDs, and endpoint paths to standard output or a centralized logging collector.

### 4.3 Data Pipeline Layer (`data-pipeline/`)
- **Structured Failure Exit**: When a pipeline stage encounters irrecoverable data corruption (e.g. 100% missing voltage readings), catch the exception.
- **Database Status Update**: Mark `pipelineRuns.status = "failed"` and append the error string to `pipelineRuns.errors` in MongoDB.
- **Notify Backend**: Return a structured JSON failure payload containing the stage name and trace excerpt.

### 4.4 ML Subsystem Layer (`ml-service/`)
- **Degradation Failure Fallback**: If an experimental algorithm (e.g. NeuralODE) fails to converge within its iteration budget, catch the numerical exception.
- **Fallback or Diagnostic Alert**: Attempt fallback to standard polynomial/empirical regression or return a structured `ML_ERROR` with reason `"NON_CONVERGENCE"`.

---

## 5. Concrete Error Response Examples

### 5.1 Validation Error (`400 Bad Request`)
```json
{
  "success": false,
  "data": null,
  "message": "Invalid vehicle registration payload",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": {
      "manufacturer": "Manufacturer must be one of: 'Tesla', 'BYD', 'Tata'",
      "batteryCapacityKWh": "Capacity must be a positive number between 10.0 and 250.0"
    }
  }
}
```

### 5.2 File Upload Error (`400 Bad Request`)
```json
{
  "success": false,
  "data": null,
  "message": "File exceeds maximum allowable size of 50 MB",
  "error": {
    "code": "FILE_UPLOAD_ERROR",
    "details": {
      "fileName": "large_can_trace.csv",
      "fileSize": 68420100,
      "maxAllowedBytes": 52428800
    }
  }
}
```

### 5.3 Pipeline Processing Failure (`422 Unprocessable Entity`)
```json
{
  "success": false,
  "data": null,
  "message": "Data pipeline halted: Unrecognized CAN signal headers for manufacturer 'Tesla'",
  "error": {
    "code": "PIPELINE_ERROR",
    "details": {
      "stage": "schemaMapping",
      "missingRequiredSignals": ["BMS_packVoltage", "BMS_packCurrent"],
      "detectedSignals": ["raw_can_id_0x102", "raw_can_id_0x108"]
    }
  }
}
```
