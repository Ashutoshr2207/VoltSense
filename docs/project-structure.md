# Current project structure

- frontend/src: React pages/components, real API clients, context and mapping utilities; frontend/smoke: Vitest/component and opt-in real upload integration.
- backend/src: Express routes/controllers, ownership middleware/validators, services and locked Mongoose models; backend/tests: Jest/Supertest with disposable MongoDB; backend/scripts: optional demo seeding.
- backend/uploads/raw: local runtime files partitioned by vehicle ID; generated/ignored. References are provider=local, not S3 URLs.
- ml-service/app.py: FastAPI /health and /predict; features.py: shared ordered 13 causal features; rul_policy.py: observed terminal guard; model_loader.py: strict approved artifact validation.
- ml-service/dataset.py, convert_nasa.py, inspect_raw.py, training.py, review_candidate.py: explicit offline preparation/training/evaluation/review. No separate data-pipeline service.
- ml-service/tests: scientific contract, conversion, target, inference/cache and tiny synthetic workflow tests. Production candidates are not retrained by test runs.
- ml-service/models: preserved inactive legacy artifacts. ml-service/runs: preserved versioned candidate/evaluation outputs, ignored by Git; V3 unapproved.
- data/validated/nasa-20261016: validated cycle CSV, quality/conversion and frozen split manifests. Raw source locations/hashes are recorded in provenance; absence of local raw files does not authorize recreating or altering them.
- sample_data: canonical multi-user simulated datasets (one complete CSV per EV owner) and generator; never training evidence.
- docs: implemented contracts, historical reports and handover. .cache: ignored scratch/test outputs, not durable product data.

[Architecture](architecture.md), [runtime contract](rebuild-contract.md) and [development commands](development-workflow.md) describe the current three-service stack. Future cloud storage, manufacturer adapters and multi-worker queues are proposals, not current directories/components. Keep environment files, credentials and runtime uploads out of commits.
