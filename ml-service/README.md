# VoltSense ML Service

Trained models (Random Forest + Gradient Boosting ensembles, 0.6/0.4 weights) in `models/`:
- `capacity_model.pkl`: next-cycle capacity (Ah)
- `soh_model.pkl`: predicted capacity -> SOH = capacity / initial capacity x 100
- `rul_model.pkl`: remaining cycles until SOH <= 80%

Flow: React -> Node -> `POST /predict` here -> Node -> React.

## Run
```
cd ml-service
pip install -r requirements.txt     # scikit-learn must be 1.6.1 (the pickles were saved with it)
python -m uvicorn app:app --port 8000
```
`backend/.env` already has `ML_SERVICE_URL=http://localhost:8000`. Check `GET /health`.

## Contract
Request: `{ "cycleTable": [{cycle, capacity, meanTemperature, ...}], "eolThreshold": 80 }` (needs 7+ cycles with capacity).
Response: `{ soh, rul, capacity, referenceCapacity, status, eolThreshold, factors[], recommendations[], model, metrics, confidence }`.

## Notes
- Feature building is in `features.py`. The model files list the 14 features but not their exact formulas, so lags/rolling means use previous cycles and `ambient_temperature` is the mean measured temperature (24 if none). Compare with your original training code.
- The models were trained on one public lab battery dataset; accuracy on real EV packs is not validated.
- End-of-life level is 80% (from training). Test error is about 1.5 SOH points and about 3 cycles for RUL.
