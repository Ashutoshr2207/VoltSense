# Development workflow

Work on the existing voltsense branch; inspect git status before edits and preserve existing work/data/artifacts. No root package script. Use surrounding JavaScript CommonJS/ES imports and Python style. Obtain explicit approval for public API/database or scientific contract changes. Current source plus [runtime contract](rebuild-contract.md) take precedence over historical proposals.

## Setup

See [root README](../README.md) for separate-terminal commands. Use existing locked dependencies (npm ci for Node; Python requirements in ml-service). Configure backend/.env locally with MONGODB_URI, MONGODB_DATABASE, JWT_SECRET, ML_SERVICE_URL=http://127.0.0.1:8000 and matching CORS_ORIGIN. Never commit secrets. Use persistent MongoDB for refresh/restart demonstrations. The environment validator requires a MongoDB URI and JWT secret; do not rely on a temporary database for durable results.

Run FastAPI with the project virtual environment, python -m uvicorn app:app --host 127.0.0.1 --port 8000. Run npm run dev separately in backend and frontend. Avoid a duplicate process on 8000. Health may return models_loaded=false: V3 is unapproved. Do not set approval flags to make the demo succeed.

## Verification

From ml-service: python -B -m pytest tests -q. Includes tiny synthetic estimator fitting in workflow tests; no NASA candidate retraining or artifact overwriting.

From backend: npm test. To include real FastAPI integration, set RUN_REAL_ML_TESTS=1. Set TEST_MONGODB_URI empty and MONGOMS_RUNTIME_DOWNLOAD=false to use a cached disposable MongoDB without runtime download. Never point tests at production data.

From frontend: npm run test:smoke and npm run build. To include real frontend-client upload integration, set RUN_REAL_UPLOAD_TESTS=1 and run a reachable unapproved/no-model FastAPI on 127.0.0.1:8000. The integration starts disposable Express/MongoDB, not the application's configured database. This is API/client integration, not a visual browser test.

Add focused validation/failure tests for changed behavior. Report actual results, skips and environmental limitations. Do not claim model accuracy from test doubles. Keep changes reviewable; run git diff --check and confirm protected schemas/artifacts unchanged. See [latest handover](final-stabilization.md), [ML workflow](../ml-service/README.md) and [deployment decision](v3-deployment-decision.md).
