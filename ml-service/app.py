"""VoltSense ML service: trained capacity -> SOH and RUL models (RF + GB ensembles)."""
import csv
import json
import os
import warnings
from functools import lru_cache

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, File
from features import FEATURES, MIN_CYCLES, build_row

warnings.filterwarnings("ignore")
MODELS = os.path.join(os.path.dirname(__file__), "models")
app = FastAPI(title="VoltSense ML Service")


@lru_cache(maxsize=1)
def load():
    cfg = json.load(open(os.path.join(MODELS, "model_config.json")))
    bundles = {n: joblib.load(os.path.join(MODELS, f"{n}_model.pkl")) for n in ("capacity", "soh", "rul")}
    return cfg, bundles


def ensemble(bundle, x):
    w = bundle["ensemble_weights"]
    X = bundle["scaler"].transform(pd.DataFrame([x], columns=bundle["feature_cols"]))
    return float(w["random_forest"] * bundle["rf"].predict(X)[0] + w["gradient_boosting"] * bundle["gb"].predict(X)[0])


def gb_only(bundle, x):
    """Gradient Boosting alone (best capacity/SOH model on the held-out test set)."""
    X = bundle["scaler"].transform(pd.DataFrame([x], columns=bundle["feature_cols"]))
    return float(bundle["gb"].predict(X)[0])


def metric(name, prefix="Ensemble"):
    try:
        for r in csv.DictReader(open(os.path.join(MODELS, name))):
            if r["Model"].startswith(prefix):
                return {"mae": float(r["MAE"]), "rmse": float(r["RMSE"]), "r2": float(r["R2"])}
    except Exception:
        pass
    return {"mae": None, "rmse": None, "r2": None}


def impact(value, mod, high):
    return "High" if value >= high else "Moderate" if value >= mod else "Low"


@app.get("/health")
def health():
    try:
        load()
        return {"status": "ok", "models_loaded": True}
    except Exception:
        return {"status": "error", "models_loaded": False}


@app.post("/predict")
def predict(payload: dict):
    cfg, b = load()
    eol = float(cfg["soh_eol_threshold"])
    table = [c for c in (payload.get("cycleTable") or []) if isinstance(c.get("capacity"), (int, float))]
    table.sort(key=lambda c: c.get("cycle", 0))
    if len(table) < MIN_CYCLES:
        raise HTTPException(status_code=422, detail=f"At least {MIN_CYCLES} valid battery cycles are required to generate a prediction.")
    caps = [float(c["capacity"]) for c in table]
    temps = [c["meanTemperature"] for c in table if isinstance(c.get("meanTemperature"), (int, float))]
    ambient = float(np.mean(temps)) if temps else 24.0

    if any(c <= 0 or c != c for c in caps):
        raise HTTPException(status_code=422, detail="Capacity values must be positive numbers")
    x = build_row(caps, ambient)
    initial = max(caps)
    pred_cap = gb_only(b["capacity"], x)
    if not all(np.isfinite(v) for v in x):
        raise HTTPException(status_code=422, detail="Invalid battery data")
    soh = max(0.0, min(100.0, gb_only(b["soh"], x) / initial * 100))  # SOH model predicts capacity; SOH = capacity / initial * 100
    rul = max(0, int(round(ensemble(b["rul"], x))))
    if soh <= eol:
        rul = 0
    f = dict(zip(FEATURES, x))
    status = "healthy" if soh >= 90 else "attention" if soh >= 80 else "critical"
    sm = metric("soh_model_comparison.csv", "Gradient Boosting")

    factors = [
        {"name": "Recent trend", "condition": "Declining quickly" if f["deg_rate5"] / initial * 100 >= 0.4 else "Declining gradually" if f["deg_rate5"] / initial * 100 >= 0.1 else "Stable",
         "impact": impact(f["deg_rate5"] / initial * 100, 0.1, 0.4),
         "explanation": "How quickly capacity has been falling over the last few cycles."},
        {"name": "Capacity loss", "condition": f"{f['cap_drop_pct']:.1f}% lost so far",
         "impact": impact(f["cap_drop_pct"], 8, 20),
         "explanation": "Capacity lost compared with the start of your data."},
        {"name": "Battery cycling", "condition": f"{len(caps)} cycles",
         "impact": impact(len(caps), 400, 1000), "explanation": "Each full charge-discharge cycle gradually ages the battery."},
        {"name": "Temperature", "condition": f"{ambient:.1f}°C average" if temps else "",
         "impact": impact(ambient, 35, 40) if temps else "Not enough data",
         "explanation": "Higher operating temperatures speed up battery ageing."},
    ]
    recs = []
    if ambient >= 35 and temps:
        recs.append("Charge and park in cooler, shaded places to slow ageing.")
    if rul < 30:
        recs.append("Your battery is close to its end-of-life level. Consider a battery check-up.")
    recs += ["Keep daily charging between about 20% and 80% when you can.", "Use fast charging only when you need it."]

    return {
        "soh": round(soh, 1), "rul": rul, "capacity": round(pred_cap, 3), "referenceCapacity": round(initial, 3), "currentCycle": int(table[-1].get("cycle", len(caps))),
        "status": status, "eolThreshold": eol, "factors": factors, "recommendations": recs,
        "model": {"name": "VoltSense SOH/RUL", "version": "1.1", "algorithm": "SOH: Gradient Boosting; RUL: Random Forest + Gradient Boosting ensemble"},
        "metrics": sm,
        "confidence": {"calibrated": False, "method": "held-out test error", "value": None,
                       "uncertaintyInterval": f"Typically within about ±{sm['mae']:.1f} points" if sm["mae"] else "Unavailable"},
    }
