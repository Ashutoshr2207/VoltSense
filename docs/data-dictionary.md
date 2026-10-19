# VoltSense Data Dictionary

## 1. Overview & Purpose

This document establishes the canonical data dictionary for VoltSense. It provides an unambiguous specification of data types, physical engineering units, producers, consumers, and validation bounds across the Frontend, Backend, Data Pipeline, Machine Learning Engine, and MongoDB Atlas persistence layers.

---

## 2. Core Entities & Identifiers

| Field | Canonical Name | Type | Unit | Meaning | Producer | Consumer | Req/Opt | Allowed Range |
|---|---|---|---|---|---|---|---|---|
| **User Identifier** | `userId` | `String` (ObjectId) | None | Unique identifier for registered user account | Backend / MongoDB | Frontend, Pipeline, ML | Required | 24-hex string |
| **Vehicle Identifier** | `vehicleId` | `String` (ObjectId) | None | Unique identifier for an EV battery pack asset | Backend / MongoDB | Frontend, Pipeline, ML | Required | 24-hex string |
| **Dataset Identifier** | `datasetId` | `String` (ObjectId) | None | Unique identifier for an uploaded telemetry archive | Backend / MongoDB | Frontend, Pipeline, ML | Required | 24-hex string |
| **Pipeline Run ID** | `pipelineRunId` | `String` (ObjectId) | None | Unique identifier for a pipeline transform execution | Backend / MongoDB | Pipeline, ML, Frontend | Required | 24-hex string |
| **Prediction Identifier** | `predictionId` | `String` (ObjectId) | None | Unique identifier for an ML inference execution | ML / Backend / DB | Frontend, AI Insights | Required | 24-hex string |
| **Timestamp** | `timestamp` | `String` (ISO 8601) | None | Time boundary formatted in UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`) | Vehicle BMS / Pipeline | Backend, ML, Frontend | Required | Valid ISO 8601 |

---

## 3. Vehicle & Battery Asset Attributes

| Field | Canonical Name | Type | Unit | Meaning | Producer | Consumer | Req/Opt | Allowed Range |
|---|---|---|---|---|---|---|---|---|
| **Manufacturer** | `manufacturer` | `String` | None | Automotive brand name (normalized) | Frontend / User | Pipeline, Backend, ML | Required | `"Tesla"`, `"BYD"`, `"Tata"` |
| **Vehicle Model** | `model` | `String` | None | Commercial vehicle model designation | Frontend / User | Backend, Frontend | Required | 1–50 characters |
| **Battery Variant** | `batteryVariant` | `String` | None | Chemistry, pack configuration, or commercial trim | Frontend / User | Pipeline, ML, Backend | Optional | e.g. `"Long Range AWD"`, `"Blade LFP"` |
| **Model Year** | `year` | `Number` | Year | Automotive manufacturing model year | Frontend / User | Backend, Frontend | Optional | $2010 \le \text{year} \le 2030$ |
| **Battery Capacity** | `batteryCapacityKWh` | `Number` | $\text{kWh}$ | Nameplate nominal battery pack capacity rating | Frontend / User | Pipeline, ML, Frontend | Optional | $10.0 \le \text{capacity} \le 250.0$ |
| **Current Cycle Count** | `currentCycleCount` | `Number` | cycles | Cumulative equivalent full discharge cycles logged | Pipeline / BMS | Backend, ML, Frontend | Optional | $\ge 0$ |

---

## 4. Electrochemical Telemetry & Sensor Readings

| Field | Canonical Name | Type | Unit | Meaning | Producer | Consumer | Req/Opt | Allowed Range |
|---|---|---|---|---|---|---|---|---|
| **Pack Voltage** | `voltage` (or `packVoltage`) | `Number` | $\text{V}$ (Volts) | Total terminal DC potential of the battery pack | BMS / Pipeline | ML, Frontend | Required | $200.0 \le \text{V} \le 900.0$ (TBD by chemistry) |
| **Pack Current** | `current` (or `packCurrent`) | `Number` | $\text{A}$ (Amps) | Instantaneous current (+ = discharge, - = charge) | BMS / Pipeline | ML, Frontend | Required | $-800.0 \le \text{A} \le 800.0$ |
| **Pack Temperature** | `temperature` (or `tempAvg`) | `Number` | $^\circ\text{C}$ (Celsius) | Mean temperature across monitored pack thermistors | BMS / Pipeline | ML, Frontend | Required | $-40.0 \le ^\circ\text{C} \le 85.0$ |
| **State of Charge** | `soc` | `Number` | $\%$ | Usable battery charge level relative to capacity | BMS / Pipeline | ML, Frontend | Required | $0.0 \le \text{SOC} \le 100.0$ |
| **Cycle Number** | `cycle` | `Number` | cycles | Sequence index of the active battery charge cycle | BMS / Pipeline | ML, Frontend | Required | $\ge 0$ |
| **Cell Min Voltage** | `cellVoltageMin` | `Number` | $\text{V}$ (Volts) | Minimum recorded individual cell voltage | BMS / Pipeline | ML, AI Insights | Optional | $2.0 \le \text{V} \le 4.4$ |
| **Cell Max Voltage** | `cellVoltageMax` | `Number` | $\text{V}$ (Volts) | Maximum recorded individual cell voltage | BMS / Pipeline | ML, AI Insights | Optional | $2.0 \le \text{V} \le 4.4$ |
| **Cell Imbalance** | `cellImbalanceMv` | `Number` | $\text{mV}$ | Voltage delta ($\text{Max} - \text{Min}$) across cell bank | Pipeline | Frontend, AI Insights | Optional | $0 \le \text{mV} \le 100$ |
| **Instantaneous Power** | `power` | `Number` | $\text{W}$ (Watts) | Real-time electrical power ($\text{Voltage} \times \text{Current}$) | Pipeline | Frontend, ML | Optional | TBD |
| **Cumulative Energy** | `energy` | `Number` | $\text{Wh}$ | Integral energy throughput during sample window | Pipeline | ML | Optional | TBD |
| **Capacity** | `capacity` | `Number` | $\text{Ah}$ | Integrated charge capacity | Pipeline | ML | Optional | TBD |

---

## 5. Machine Learning Prediction & Health Metrics

| Field | Canonical Name | Type | Unit | Meaning | Producer | Consumer | Req/Opt | Allowed Range |
|---|---|---|---|---|---|---|---|---|
| **State of Health** | `soh` | `Number` | $\%$ | Current battery health relative to original factory state | ML Engine | Backend, Frontend | Required | $0.0 \le \text{SOH} \le 100.0$ |
| **Remaining Useful Life** | `rulCycles` | `Number` | cycles | Forecasted remaining full equivalent charge cycles | ML Engine | Backend, Frontend | Required | $\ge 0$ |
| **Current Cycle Index** | `currentCycle` | `Number` | cycles | Measured cycle position at time of inference | ML / Pipeline | Backend, Frontend | Required | $\ge 0$ |
| **Estimated EOL Cycle** | `estimatedEOLCycle` | `Number` | cycles | Projected lifetime cycle count when SOH reaches threshold | ML Engine | Backend, Frontend | Required | $\ge \text{currentCycle}$ |
| **EOL Threshold** | `eolThreshold` | `Number` | $\%$ | SOH boundary defining battery retirement milestone | Config / User | ML Engine, Frontend | Required | Typically $70.0$ or $80.0$ |
| **SOH Confidence** | `confidence.soh` | `Number` | Ratio | Model confidence metric for SOH prediction | ML Engine | Backend, Frontend | Optional | $0.0 \le \text{score} \le 1.0$ |
| **RUL Confidence** | `confidence.rul` | `Number` | Ratio | Model confidence metric for RUL prediction | ML Engine | Backend, Frontend | Optional | $0.0 \le \text{score} \le 1.0$ |

---

## 6. Software & Artifact Versioning Fields

| Field | Canonical Name | Type | Unit | Meaning | Producer | Consumer | Req/Opt | Allowed Range |
|---|---|---|---|---|---|---|---|---|
| **Schema Version** | `schemaVersion` | `String` | None | Manufacturer DBC / telemetry signal layout tag | Pipeline / Adapter | Backend, MongoDB | Required | e.g. `"DBC_V4.2"` |
| **Pipeline Version** | `pipelineVersion` | `String` | None | Semantic release tag of the data pipeline software | Pipeline | Backend, MongoDB | Required | e.g. `"2.4.0"` |
| **Model Version** | `modelVersion` | `String` | None | Registry release tag of the trained ML model | Model Registry | ML, Backend | Required | e.g. `"v1.0.0"` or `"v1.0"` |
