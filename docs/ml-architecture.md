# VoltSense Machine Learning Subsystem Architecture

> **Implementation Status**: `PLANNED / NOT IMPLEMENTED`  
> This document specifies the planned architecture, candidate model families, feature schemas, inference contracts, and evaluation benchmarks for the VoltSense ML subsystem. Algorithms mentioned are candidates; the architecture remains pluggable.

---

## 1. Subsystem Architecture

The ML subsystem ingests normalized electrochemical feature matrices produced by the Data Pipeline and outputs dual forecasts: instantaneous **State of Health (SOH)** and forward-projecting **Remaining Useful Life (RUL)**.

```text
  Standardized Parquet Dataset (from Object Storage)
                           │
                           ▼
            FEATURE PREPARATION LAYER
   Extract LLI, LAM, Ohmic R, ΔV imbalance, ΔT
                           │
           ┌───────────────┴───────────────┐
           │                               │
           ▼                               ▼
  SOH Estimation Model            RUL Prognostic Model
  (Bayesian MCMC / XGBoost)       (NeuralODE / LSTM)
           │                               │
           ▼                               ▼
   SOH Estimate (%)                RUL Estimate (Cycles)
           │                               │
           └───────────────┬───────────────┘
                           │
                           ▼
  PREDICTION SYNTHESIS & UNCERTAINTY QUANTIFICATION
   1. EOL Estimation (currentCycle + rulCycles)
   2. Degradation Curve Generator (Historical + Forecast)
   3. Uncertainty Bounds (95% Credible Intervals)
                           │
                           ▼
   Final Prediction Document (Persisted to MongoDB)
                           ▲
                           │ Model Weights & Metadata
   ┌───────────────────────┴───────────────────────┐
   │                                               │
   │  MongoDB modelVersions     Cloud Object Store │
   │  (Registry Collection)     (/models/*/weights)│
   └───────────────────────────────────────────────┘
```

---

## 2. Feature Schema & Inputs

The ML service consumes normalized feature vectors over constant charging and dynamic driving segments:

| Feature Name | Symbol / Dimension | Physical Significance | Correlation with Degradation |
|---|---|---|---|
| `lli_ratio` | Percentage ($\%$) | Loss of Lithium Inventory | Strongly correlated with capacity fade |
| `lam_ratio` | Percentage ($\%$) | Loss of Active Material | Correlated with electrode structure collapse |
| `internal_resistance_mohm` | Milliohms ($\text{m}\Omega$) | Ohmic resistance growth | Indicator of power fade and heat generation |
| `cell_imbalance_max_mv` | Millivolts ($\text{mV}$) | Maximum voltage spread across cell bank | Early warning for weak series cell strings |
| `temp_gradient_avg_c` | Degrees Celsius ($^\circ\text{C}$) | Mean temperature differential across pack | Thermal runaway risk and localized aging |
| `coulomb_efficiency` | Ratio ($0.0 - 1.0$) | Discharge Ah / Charge Ah ratio | Micro-short and side-reaction diagnostic |
| `current_cycle_count` | Integer | Total cumulative equivalent full cycles | Baseline aging index |

---

## 3. Candidate Algorithm Families

To preserve flexibility during model experimentation, the platform supports multiple candidate architectures registered through the `modelVersions` collection:

### 3.1 Bayesian MCMC Regression (VoltSense Bayesian SOH v1.0)
- **Strengths**: Provides formal probabilistic uncertainty bounds, handles small sample sizes, robust against overfitting.
- **Outputs**: Posterior mean SOH, 95% Bayesian credible intervals (e.g. `[93.7%, 94.5%]`).
- **Target Inferences**: SOH estimation and confidence scoring.

### 3.2 Neural Ordinary Differential Equations (NeuralODE v2.1)
- **Strengths**: Continuous-time modeling of continuous electrochemical state evolution. Naturally accommodates non-uniform sampling intervals.
- **Target Inferences**: Non-linear degradation curve trajectory and RUL forecasting.

### 3.3 Gradient Boosted Trees (XGBoost / LightGBM)
- **Strengths**: Fast inference latency ($< 5\text{ ms}$), strong tabular feature importance rankings.
- **Target Inferences**: Fast screening and baseline benchmarks.

---

## 4. Prediction Outputs & MongoDB Mapping

The ML inference output directly populates the `predictions` collection schema:

```json
{
  "model": {
    "name": "VoltSense Bayesian SOH",
    "version": "v1.0",
    "algorithm": "Bayesian MCMC"
  },
  "prediction": {
    "soh": 94.2,
    "currentCycle": 412,
    "rulCycles": 680,
    "estimatedEOLCycle": 1092,
    "eolThreshold": 70.0
  },
  "confidence": {
    "soh": 0.94,
    "rul": 0.87
  },
  "degradation": {
    "historical": [
      { "cycle": 0, "soh": 100.0 },
      { "cycle": 412, "soh": 94.2 }
    ],
    "predicted": [
      { "cycle": 600, "soh": 90.5 },
      { "cycle": 1092, "soh": 70.0 }
    ]
  },
  "metrics": {
    "mae": 0.35,
    "rmse": 0.48,
    "r2": 0.994
  }
}
```

---

## 5. Model Evaluation Benchmarks

Before any model candidate is promoted to `status: "production"` in the `modelVersions` collection, it must satisfy target evaluation criteria on historical validation sets:

| Metric | Target Threshold | Formula | Operational Significance |
|---|---|---|---|
| **Mean Absolute Error (MAE)** | $\le 0.8\%$ SOH | $\frac{1}{n} \sum \|y - \hat{y}\|$ | Average prediction error margin |
| **Root Mean Squared Error (RMSE)** | $\le 1.2\%$ SOH | $\sqrt{\frac{1}{n} \sum (y - \hat{y})^2}$ | Penalizes large outlier forecast errors |
| **Coefficient of Determination ($R^2$)** | $\ge 0.95$ | $1 - \frac{SS_{\text{res}}}{SS_{\text{tot}}}$ | Goodness-of-fit to actual aging curves |
| **Inference Latency** | $< 100\text{ ms}$ | Wall-clock execution time | Responsiveness for interactive UI uploads |
