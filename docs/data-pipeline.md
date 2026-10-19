# VoltSense Data Pipeline Architecture

> **Implementation Status**: `PLANNED / NOT IMPLEMENTED`  
> This document specifies the architecture, manufacturer adapter design, transformation stages, and output contracts for the planned Python telemetry data pipeline.

---

## 1. Overview & Pipeline Philosophy

EV battery management systems across different automotive manufacturers emit proprietary CAN bus messages, varying engineering units, and distinct sensor topologies. The **VoltSense Data Pipeline** acts as a normalizing buffer that isolates heterogeneous vehicle telemetry from the machine learning inference engine.

```text
  HETEROGENEOUS RAW BMS TELEMETRY (CSV / JSON / Parquet)
   ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐
   │ Tesla BMS Logs  │  │ BYD Blade Logs  │  │ Tata Ziptron Logs│
   │ (DBC CAN matrix)│  │ (Prismatic LFP) │  │ (OBD-II PID)     │
   └────────┬────────┘  └────────┬────────┘  └────────┬─────────┘
            │                    │                    │
            ▼                    ▼                    ▼
   ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐
   │ Tesla Adapter   │  │ BYD Adapter     │  │ Tata Adapter     │
   └────────┬────────┘  └────────┬────────┘  └────────┬─────────┘
            │                    │                    │
            └────────────────────┼────────────────────┘
                                 │
                                 ▼
         UNIFIED DATA TRANSFORMATION PIPELINE
    ┌────────────────────────────────────────────────────────┐
    │  1. Common Schema Representation                       │
    │  2. Cleaning & Deduplication                           │
    │  3. Missing Value Handling                             │
    │  4. Electrochemical Outlier Filter                     │
    │  5. Feature Engineering (LLI, LAM, ΔV, ΔT)             │
    │  6. Feature Normalization                              │
    └────────────────────────────┬───────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ Processed Parquet│    │ ML Inference Engine│  │ MongoDB Atlas    │
│ (Cloud Storage)  │    │ (SOH & RUL)      │    │ (pipelineRuns)   │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

> **Fundamental Invariant**: The Machine Learning Engine must **never** ingest raw manufacturer-specific files directly. It operates solely against the standardized, normalized features output by Stage 8 of this pipeline.

---

## 2. Pipeline Execution Stages

The pipeline executes eight sequential stages. These stages correspond directly to the keys tracked in the authoritative MongoDB `pipelineRuns.stages` subdocument.

### Stage 1: Validation (`pipelineRuns.stages.validation`)
- **Objective**: Verify file integrity, non-empty content, supported file formats (`.csv`, `.json`, `.parquet`), and valid UTF-8 encoding.
- **Rules**:
  - Max allowable raw file size: 50 MB (configurable via environment variables).
  - Must contain minimum 100 consecutive sampling intervals.
  - Failures immediately halt execution and mark `pipelineRuns.status = "failed"`.

### Stage 2: Manufacturer Adaptation (`pipelineRuns.stages.schemaMapping` - Part A)
- **Objective**: Ingest proprietary manufacturer telemetry signals and convert them into an intermediate canonical dictionary.
- **Supported Adapters**:
  1. **Tesla Adapter**:
     - Maps high-speed CAN signals (`BMS_packVoltage`, `BMS_packCurrent`, `BMS_cellVoltages`, `BMS_thermalAverage`).
     - Normalizes cell telemetry across 96s (or 108s) pack arrangements.
  2. **BYD Adapter**:
     - Decodes Blade LFP battery bus messages containing 128 to 135 series cells.
     - Maps cell group differential voltages and thermistor channels.
  3. **Tata Adapter**:
     - Parses Ziptron OBD-II telemetry streams (e.g. Nexon EV, Tiago EV).
     - Decodes aggregate min/max cell voltages, instantaneous power demand, and SOC.

### Stage 3: Common Schema Mapping (`pipelineRuns.stages.schemaMapping` - Part B)
- **Objective**: Project decoded manufacturer streams into standardized columnar data types:
  - `timestamp`: UTC datetime (ISO 8601).
  - `cycle`: Monotonic integer cycle index.
  - `packVoltage`: Float (Volts).
  - `packCurrent`: Float (Amperes; positive = discharge, negative = charge).
  - `cellVoltageMin`: Float (Volts).
  - `cellVoltageMax`: Float (Volts).
  - `cellImbalanceMv`: Float (Millivolts, `cellVoltageMax - cellVoltageMin`).
  - `tempAvg`: Float (Degrees Celsius).
  - `tempMin`: Float (Degrees Celsius).
  - `tempMax`: Float (Degrees Celsius).
  - `soc`: Float (0.0 to 100.0%).

### Stage 4: Cleaning & Deduplication (`pipelineRuns.stages.cleaning`)
- **Objective**: Resolve telemetry transport artifacts.
- **Actions**:
  - Sort rows strictly by ascending `timestamp`.
  - Deduplicate records matching identical timestamps and cycle indices.
  - Remove corrupted records where numeric fields cannot be cast.

### Stage 5: Missing Value Handling (`pipelineRuns.stages.missingValueHandling`)
- **Objective**: Impute sensor dropouts without distorting physical dynamics.
- **Actions**:
  - Short dropouts ($\le 2$ seconds): Apply cubic spline or linear interpolation.
  - Extended dropouts ($> 2$ seconds): Segment the telemetry trace into independent driving/charging sessions rather than fabricating synthetic data.
  - Compute `dataQuality.missingPercentage` for the dataset audit log.

### Stage 6: Outlier & Noise Filter (`pipelineRuns.stages.outlierDetection`)
- **Objective**: Remove electromagnetic noise, CAN bus transmission corruptions, and transducer spikes.
- **Actions**:
  - Voltage Filter: Flag cell voltages outside physical chemical limits (e.g. $< 2.0\text{ V}$ or $> 4.4\text{ V}$).
  - Temperature Gradient Filter: Reject temperature deltas $> 5.0^\circ\text{C}$ per second (physically impossible thermal mass change).
  - Record outlier counts to `dataQuality.outlierPercentage`.

### Stage 7: Feature Engineering (`pipelineRuns.stages.featureEngineering`)
- **Objective**: Compute electrochemical health degradation features from time-series traces.
- **Derived Features**:
  1. **Loss of Lithium Inventory (LLI)**: Derived from incremental capacity analysis ($dQ/dV$) during constant-current charge segments.
  2. **Loss of Active Material (LAM)**: Derived from peak differential voltage shifts ($dV/dQ$).
  3. **Ohmic Internal Resistance ($R_0$)**: Calculated from instantaneous voltage drop over current step ($\Delta V / \Delta I$).
  4. **Cell Voltage Variance Matrix**: Standard deviation of individual cell group voltages under load.
  5. **Thermal Dissipation Factor**: Rate of pack cooling after peak power draws.

### Stage 8: Normalization (`pipelineRuns.stages.normalization`)
- **Objective**: Scale features for numeric stability in ML inference models.
- **Actions**:
  - Apply RobustScaler or MinMax scaling based on battery chemistry calibration profiles (NCA vs. LFP).
  - Output compressed `.parquet` file with snappy compression.
  - Save file to cloud object storage: `s3://voltsense-processed/{vehicleId}/{pipelineRunId}.parquet`.
  - Update MongoDB `pipelineRuns` record with `status: "completed"`, `outputRecords`, and `featuresGenerated`.
