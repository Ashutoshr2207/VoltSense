# Synthetic battery-cycle upload demo

[demo_battery_cycles.csv](demo_battery_cycles.csv): **40 entirely synthetic discharge-cycle summaries**, cycles **1–40**, battery **SYNTHETIC_DEMO_CELL_001**. UTF-8 CSV, 2,804 bytes. These are illustrative single-cell values, not NASA observations, validated EV-pack measurements, training data, or accuracy evidence.

## Columns

| Exact header | Meaning / unit |
|---|---|
| battery_id | Constant synthetic identifier |
| Cycle | Consecutive completed discharge index, starting at 1 |
| Capacity | Complete-discharge capacity, Ah |
| mean_voltage | Cycle-average cell terminal voltage, V |
| mean_current | Discharge average, A; -1.500 follows the parser's negative-discharge convention |
| mean_temperature | Cycle-average measured temperature, degrees C; not ambient temperature |
| discharge_duration | Discharge duration, seconds |
| type | Literal discharge |

Capacity declines nonlinearly from **2.0000 to 1.8862 Ah**, with small deterministic variations. Duration is round(Capacity × 3600 / 1.5), consistent with 1.5 A discharge within rounding. Voltage and temperature vary smoothly. The parser's final 94.3% capacity ratio is arithmetic on synthetic values, **not a model prediction**.

These are summaries, not sensor traces: no charging segments, SoC, impedance or cell-spread values. Derived extrema describe the summaries, not within-cycle extrema; phase-share percentages are not measured elapsed-time shares. No future RUL is supplied.

## Manual upload

1. Start the configured backend and frontend. Log into a separate test account with an owned vehicle; this build allows one vehicle per account. If needed, create **Synthetic cycle demo**, clear the optional default Pack Capacity (kWh), and leave SOH/cycle fields blank. Do not enter a cell's Ah value as pack kWh.
2. Open **SOH & RUL**. Its active vehicle receives the upload; no manufacturer adapter is needed.
3. Click **Choose CSV / Excel**, select this CSV, inspect the 40-row preview, then **Upload & analyze**. The single battery_id is selected automatically.
4. There is **no source-type selector**: this page always sends **sourceType=user_upload**. The API also accepts demo_dataset and synthetic_dataset, but the UI does not expose them. Uploaded data labels do not make this file authentic; its battery ID and this README identify its synthetic origin.
5. Watch actual stage status and errors rather than assuming elapsed time means completion.

## Expected behavior

POST /api/vehicles/:vehicleId/datasets accepts bearer-authenticated multipart fields file and sourceType. CSV/XLSX/XLS are supported subject to the configured size limit. Cycle plus Capacity are sufficient for this capacity-history format; the other columns are supported identifiers/optional summaries. Prediction needs at least seven complete consecutive cycles beginning at 1.

Upload should return **201**, 40 records/cycles, parsed summaries and excellent parser quality. Validation/anomaly report items complete; SOH/RUL initially remain pending. Charging extraction is ineligible. Zero findings on smooth averages is not proof of safety.

The UI then calls POST /api/datasets/:datasetId/process (**202**, pipelineRunId) and polls GET /api/datasets/:datasetId/status. Responses contain dataset status and pipelineRun stages/errors; ordinary API errors use success/data/message/error.

The validation, schemaMapping, cleaning, missingValueHandling and outlierDetection stages should pass. **Without an approved compatible model**, featureEngineering/normalization cannot complete: strict FastAPI returns 503 MODEL_UNAVAILABLE, or an unreachable-service error if stopped. The backend marks processing and SOH/RUL failed, and the UI displays the reason. This is expected, not invalid CSV.

Parsed dataset/quality/anomaly data remain stored, but that failed run creates no completed prediction/history/AI-insight record; charts may remain empty. Do not enable legacy inference or fabricate results. With a separately approved model configured, inference may complete; synthetic-input accuracy is not promised.

## Repeat or reset

Re-uploading identical bytes to the same vehicle reuses its dataset; processing creates another explicit attempt after the previous worker finishes. Renaming alone does not bypass deduplication.

For a fresh upload, use authenticated **DELETE /api/datasets/:datasetId** for this demo only. Find its ID in upload response data.dataset.id or the vehicle dataset list; verify filename and selectedBatteryId first. There is no dataset-delete button. Use the configured API base URL and your session bearer token in an API client. The backend safely cascades owned dependencies and its raw upload.

Alternatively, only in a dedicated demo account, **Vehicle Profile → Remove** clears its vehicle/history; then recreate it. Active processing blocks deletion (409). Do not delete folders, modify MongoDB directly, or touch NASA files/models. This source CSV remains available.

## Verification

Existing upload/header/parser/quality functions passed: 40 ordered unique cycles, one battery, finite numbers, positive Ah, zero duplicates/invalid records/outliers/missing capacities. Five non-ML parser stages completed. Actual frontend preview/eligibility helpers passed; Python history/shared-feature checks produced 13 finite features. Parser regressions: **31 tests passed**. Frontend build passed. No training, inference, or live account/database upload was performed.

## Subsequent full-workflow verification

The NASA conversion/training task reused this file in a disposable MongoDB + real local FastAPI integration test. Upload, actual model-gate failure, retry, re-login and persisted empty prediction history passed. The candidate remains unapproved; the expected disabled-inference behavior above still applies. This synthetic CSV was not used as NASA training evidence. See ../own_docs/nasa-evaluation-report.md.
