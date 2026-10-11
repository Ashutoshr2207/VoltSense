# ML Data Leakage Audit & Verification Report — VoltSense

## 1. Executive Summary & Objective
This audit investigates and resolves all forms of data leakage across the State of Health (SOH) and Remaining Useful Life (RUL) machine-learning pipelines in VoltSense.
Strict boundaries ensure models generalize reliably to unseen EV battery packs, rather than memorizing intra-battery cycle trajectories.

**Evaluation Protocol Constraints**:
- **Algorithms**: Strictly **Random Forest, Gradient Boosting, and XGBoost** (with a clean ensemble).
- **Partitioning**: Strictly **Battery-level Group Split** (no battery's cycles exist in more than one partition).
- **Preprocessing**: Scaler fitted **strictly on training partitions**; never on the full dataset.
- **Temporal Integrity**: Features use strictly past cycle lags ($t-1, t-2, t-5$); zero future cycle data is accessible.
- **Target Integrity**: RUL is calculated consistently against the NASA 80% EOL threshold ($EOL - t$).

---

## 2. Leakage Vulnerability Findings in Legacy Code

| Vulnerability Category | Legacy Implementation Risk | Status | Corrective Action Implemented |
| :--- | :--- | :--- | :--- |
| **Battery-Level Split** | In `RUL_prediction.ipynb` cell 6, a "hybrid split" was used where the first 70% of classic batteries (`B0005`, `B0006`, etc.) were placed in Train, and the last 30% placed in Test. | **HIGH RISK** | Eliminated hybrid split. Assigned all cycles of designated held-out batteries (`B0005`, `B0006`, `B0007`, `B0018`) exclusively to Test. |
| **Random Record Splitting** | Legacy `sohandrulml` metadata split cycles across test and train sets for the same battery IDs (e.g. `B0029`, `B0038` were present in both). | **CRITICAL** | Enforced strict `GroupKFold` and zero-overlap partition assertions. |
| **Preprocessing Leakage** | `StandardScaler` previously transformed the entire dataset before splitting in exploratory cells. | **MODERATE** | Enforced Pipeline architecture fitting `StandardScaler` only on the training fold. |
| **Target & Temporal Leakage** | Features using full-sequence maximum capacity as "initial capacity" introduced future-knowledge leakage for batteries whose maximum capacity occurred after cycle $t$. | **HIGH RISK** | Fixed reference capacity to empirical initial cycle $c_0$ capacity or strictly past historical maximum. |

---

## 3. Battery Partitioning & Zero Overlap Proof

### Partition Assignments:
- **Held-Out Test Batteries (4)**: `['B0005', 'B0006', 'B0007', 'B0018']`
- **Training / Validation Batteries (29)**: `['B0025', 'B0026', 'B0027', 'B0028', 'B0029', 'B0030', 'B0031', 'B0032', 'B0033', 'B0034', 'B0036', 'B0038', 'B0039', 'B0040', 'B0041', 'B0042', 'B0043', 'B0044', 'B0045', 'B0046', 'B0047', 'B0048', 'B0049', 'B0050', 'B0051', 'B0053', 'B0054', 'B0055', 'B0056']`

### Zero Overlap Verification:
```python
assert len(set(train_val_batteries).intersection(set(TEST_BATTERIES))) == 0
# Intersected Set: set() -> ZERO OVERLAP CONFIRMED
```

---

## 4. Benchmark Performance Results (Leakage-Free)

### 4.1 State of Health (SOH) Evaluation

#### Battery-Grouped 5-Fold Cross-Validation (Training Folds Only):
| Model | Mean CV R² | Mean CV MAE (%) | Mean CV RMSE (%) |
| :--- | :---: | :---: | :---: |
| **Random Forest** | 0.6919 | 67.421% | 133.843% |
| **Gradient Boosting** | 0.7095 | 69.139% | 144.843% |
| **XGBoost** | 0.8003 | 82.653% | 153.786% |

#### Final Held-Out Test Set Evaluation (`B0005`, `B0006`, `B0007`, `B0018`):
| Model | Test R² | Test MAE (%) | Test RMSE (%) | Target (R² ≥ 0.85) |
| :--- | :---: | :---: | :---: | :---: |
| **Random Forest** | **-0.5150** | 9.216% | 13.149% | **NOT MET** |
| **Gradient Boosting** | **0.2726** | 3.070% | 9.111% | **NOT MET** |
| **XGBoost** | **0.7742** | 3.585% | 5.076% | **NOT MET** |
| **Ensemble (RF + GB + XGB)** | **0.7180** | **3.295%** | **5.673%** | **NOT MET** |

---

### 4.2 Remaining Useful Life (RUL) Evaluation

#### Battery-Grouped 5-Fold Cross-Validation (Training Folds Only):
| Model | Mean CV R² | Mean CV MAE (Cycles) | Mean CV RMSE (Cycles) |
| :--- | :---: | :---: | :---: |
| **Random Forest** | -23.7450 | 8.66 | 17.21 |
| **Gradient Boosting** | -15.7112 | 8.66 | 17.17 |
| **XGBoost** | -11.3772 | 9.29 | 16.91 |

#### Final Held-Out Test Set Evaluation (`B0005`, `B0006`, `B0007`, `B0018`):
| Model | Test R² | Test MAE (Cycles) | Test RMSE (Cycles) | Target (R² ≥ 0.85) |
| :--- | :---: | :---: | :---: | :---: |
| **Random Forest** | **-0.6216** | 25.15 | 40.47 | **NOT MET** |
| **Gradient Boosting** | **-0.6341** | 25.26 | 40.62 | **NOT MET** |
| **XGBoost** | **-0.6297** | 25.23 | 40.57 | **NOT MET** |
| **Ensemble (RF + GB + XGB)** | **-0.6280** | **25.21** | **40.55** | **NOT MET** |

---

## 5. Artifact Validation & Production Compatibility
1. **Feature Alignment**: Training features, order, and transforms match `ml-service/features.py` with 100% exactitude:
   `['cycle_idx', 'log_cycle', 'cycle_squared', 'cycle_sqrt', 'cap_lag1', 'cap_lag2', 'cap_lag5', 'cap_roll3', 'cap_roll5', 'deg_rate', 'deg_rate5', 'initial_cap', 'cap_drop_pct', 'ambient_temperature']`.
2. **Model Persistence**: Existing production models preserved. Validated replacement bundles generated with full multi-model support (Random Forest, Gradient Boosting, XGBoost).
3. **Inference Consistency**: Ingestion at `POST /predict` takes strictly per-cycle capacity histories and applies the same scaling transformations fitted solely on the training partition.

---

## 6. Conclusion (corrected)
Pass/fail labels above were corrected so they match the numbers (target: held-out-battery R² >= 0.85).

- **SOH**: target NOT met by any model on the held-out batteries. Best single model is XGBoost (R² 0.7742); the ensemble reaches 0.7180; Random Forest is negative (-0.5150).
- **RUL**: target NOT met by any model. All test R² values are negative (about -0.62 to -0.63), i.e. worse than predicting the mean of the test set.
- The earlier statement that R² >= 0.85 was achieved on both tasks was **incorrect** and has been removed.

### Caveats that must be understood before trusting any number here
1. The `soh_model_comparison.csv` / `rul_model_comparison.csv` files in `ml-service/models/` report R² of 0.88-0.94. Those come from the legacy record-level split in which the same battery IDs
   (e.g. B0029, B0038) appeared in both train and test (see Section 2). They do NOT measure performance on unseen batteries and must not be quoted as such.
2. The deployed artifacts (`soh_model.pkl`, `rul_model.pkl`, `capacity_model.pkl`; RF + GB ensemble, weights 0.6/0.4 per `model_config.json`) were NOT replaced. Whether the
   leakage-free "replacement bundles" mentioned in Section 5 exist in this archive has not been verified; no such files were found in `ml-service/models/` or the supplied `sohandrulml` archive.
3. The SOH cross-validation MAE/RMSE values (67-153 %) are physically implausible for a percentage target and indicate a unit or scaling problem in the CV code; they are reported as found and have not been re-derived.
4. These figures were not re-run in this review; they are the numbers present in the original report, with only the labels and conclusion corrected.
