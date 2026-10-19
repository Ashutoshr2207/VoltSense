# ML implementation and deployment status

FastAPI app.py performs validation → causal feature generation → strict approved loading → capacity and RUL inference. Offline dataset.py, convert_nasa.py, training.py and review_candidate.py handle dataset preparation, fitting, evaluation and deployment review. [ML README](../ml-service/README.md) contains reproducible commands; [service contract](ml-backend-contract.md) contains request/response schemas.

FEATURE_CONTRACT is capacity-history-v2, ordered exactly:

~~~text
cycle_idx, log_cycle, cycle_squared, cycle_sqrt,
cap_lag1, cap_lag2, cap_lag5, cap_roll3, cap_roll5,
deg_rate, deg_rate5, initial_cap, cap_drop_pct
~~~

For latest target cycle t, capacities used as features precede t. No current/future capacity, SOH, EOL position, whole-history maximum or temperature default is a feature. Q1 is the first credible completed discharge. Capacity is predicted in Ah; SOH=min(100,100*capacity/Q1). EOL is the first observed <=80% crossing; observed RUL labels=max(0,E-t), censored labels unobserved. The pre-EOL regressor and observed terminal guard are distinct. The shared RUL_POLICY returns zero after an observed crossing, including recovery, only after approval. It never invents a future crossing.

V3 trained RandomForest/GradientBoosting candidates using existing dependencies and fixed battery splits. Validation selected GradientBoosting capacity and RandomForest RUL. Frozen partitions contain 8/3/3 batteries. Current held-out capacity RMSE=0.020778746896882725 Ah versus persistence=0.020661328542490476 Ah on the same 194 rows: fails the RMSE gate. Forecast RUL evaluation has 68 rows from only B0018, previously inspected; its integer served MAE=8.735294117647058 cycles and RMSE=10.896572585801788 cycles are not independent generalization evidence. All 58 terminal held-out histories return zero under offline policy. See [full V3 report](rul-consistency-v3.md) and [deployment decision](v3-deployment-decision.md).

Strict loading requires explicit approval, exact features/targets/inference policy, sklearn version, local bundle containment, SHA-256, model identity and serialized pipeline feature order. app.py caches only successful loads using resolved manifest/bundle paths and both files' nanosecond mtime/size; changes reload and failures clear the cache. Publish immutable versioned artifacts; metadata is an invalidation mechanism, not a substitute for manifest/hash validation.

V3 remains unapproved, legacy pickle artifacts inactive. No live predictions are available. No EV-pack validation or calibrated uncertainty is claimed. S3 ingestion, Bayesian MCMC, NeuralODE, XGBoost/LightGBM and manufacturer adapters are not implemented runtime components.
