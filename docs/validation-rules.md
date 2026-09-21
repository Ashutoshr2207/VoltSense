# VoltSense Shared Validation Rules & Constraints

## 1. Overview

This document specifies the validation constraints shared across the Frontend, Backend, and Data Pipeline. Enforcing identical validation rules across both the client-side UI and server-side request pipelines prevents data corruption and improves user experience.

---

## 2. User Domain Constraints

| Attribute | Type | Required? | Validation Rules & Constraints |
|---|---|---|---|
| `name` | `String` | Yes | Minimum 2 characters, maximum 80 characters. Trim leading/trailing whitespace. |
| `email` | `String` | Yes | Standard RFC 5322 regex pattern. Normalized to lowercase. Unique in `users` collection. |
| `password` | `String` | Yes (on register) | Minimum 8 characters; must contain at least 1 uppercase letter, 1 number, and 1 special character. Plaintext never stored; hashed with bcrypt/argon2. |
| `preferences.theme` | `String` | No | Strict enum: `["light", "dark", "system"]`. Default: `"light"`. |

---

## 3. Vehicle Asset Constraints

| Attribute | Type | Required? | Validation Rules & Constraints |
|---|---|---|---|
| `userId` | `String` (ObjectId) | Yes | Valid 24-character hexadecimal string representing an existing user. |
| `manufacturer` | `String` | Yes | Strict enum: `["Tesla", "BYD", "Tata"]`. Raw variants normalized on ingestion. |
| `model` | `String` | Yes | String, minimum 1 character, maximum 50 characters. |
| `year` | `Number` | No | Integer between `2010` and `2030`. |
| `batteryVariant` | `String` | No | String, maximum 100 characters (e.g. `"Long Range AWD"`, `"Blade LFP"`). |
| `nickname` | `String` | No | String, maximum 60 characters. |
| `batteryCapacityKWh` | `Number` | No | Float, strictly positive: $10.0 \le \text{capacity} \le 250.0$. |
| `status` | `String` | No | Strict enum: `["healthy", "attention", "critical", "unknown"]`. Default: `"unknown"`. |

---

## 4. Telemetry Dataset & Upload Constraints

| Attribute | Type | Required? | Validation Rules & Constraints |
|---|---|---|---|
| `file` (Upload) | Binary | Yes | File extension must be `.csv`, `.json`, or `.parquet`. |
| `fileSize` | `Number` | Yes | Maximum size: 50 MB ($52,428,800\text{ bytes}$). Files with 0 bytes rejected immediately. |
| `vehicleId` | `String` (ObjectId) | Yes | Must match an existing vehicle record owned by the authenticated user. |
| `sourceType` | `String` | Yes | Strict enum: `["user_upload", "demo_dataset", "synthetic_dataset"]`. Default: `"user_upload"`. |
| `status` | `String` | Yes | Strict enum: `["uploaded", "processing", "processed", "failed"]`. Default: `"uploaded"`. |

---

## 5. Telemetry Time-Series & Electrochemical Sensor Bounds

During Stage 1 (Validation) and Stage 6 (Outlier Detection) of the Python data pipeline, raw sensor samples are checked against physical electrochemical limits:

| Parameter | Unit | Lower Bound | Upper Bound | Outlier Rule / Action |
|---|---|---|---|---|
| `timestamp` | UTC | Valid ISO 8601 | Non-future ($t \le \text{now}$) | Rows with non-monotonic timestamps are sorted or dropped |
| `cycle` | cycles | $0$ | $10,000$ | Must be non-negative integer |
| `packVoltage` | $\text{V}$ | $200.0\text{ V}$ | $950.0\text{ V}$ | Voltages outside boundary dropped as transducer errors |
| `cellVoltageMin` | $\text{V}$ | $2.0\text{ V}$ | $4.4\text{ V}$ | Physical chemistry limits for Li-ion / LFP cells |
| `cellVoltageMax` | $\text{V}$ | $2.0\text{ V}$ | $4.4\text{ V}$ | Flagged if $V_{\text{max}} < V_{\text{min}}$ |
| `cellImbalanceMv` | $\text{mV}$ | $0.0\text{ mV}$ | $150.0\text{ mV}$ | Imbalance $> 100\text{ mV}$ flags diagnostic warning |
| `packCurrent` | $\text{A}$ | $-800.0\text{ A}$ | $+800.0\text{ A}$ | Peak discharge (+) or regenerative charge (-) limits |
| `tempAvg` | $^\circ\text{C}$ | $-40.0^\circ\text{C}$ | $+85.0^\circ\text{C}$ | Sensor readings outside range flagged as thermistor fault |
| `tempGradient` | $^\circ\text{C}/\text{sec}$ | $-5.0^\circ\text{C}/\text{s}$ | $+5.0^\circ\text{C}/\text{s}$ | Rate of change exceeding physical thermal dissipation rate |
| `soc` | $\%$ | $0.0\%$ | $100.0\%$ | Truncated or scaled if floating point inaccuracy occurs |
| `power` | $\text{kW}$ | TBD / determined by dataset research | TBD | Calculated as $V \times I / 1000$ |
| `energy` | $\text{kWh}$ | TBD / determined by dataset research | TBD | Cumulative Ah/Wh integration |

---

## 6. Prediction Output Validation Constraints

Before an ML inference document is accepted into the MongoDB `predictions` collection, the Backend verifies:
- `soh`: Numeric value $0.0 \le \text{soh} \le 100.0$.
- `rulCycles`: Non-negative integer ($\ge 0$).
- `currentCycle`: Non-negative integer ($\ge 0$).
- `estimatedEOLCycle`: Integer $\ge \text{currentCycle}$.
- `eolThreshold`: Number typically $70.0$ or $80.0$.
- `confidence.soh`: Number $0.0 \le \text{score} \le 1.0$.
- `confidence.rul`: Number $0.0 \le \text{score} \le 1.0$.
- `degradation.historical` & `degradation.predicted`: Arrays containing under 100 downsampled `{ cycle: Number, soh: Number }` points to ensure light document weight.
