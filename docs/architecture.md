# VoltSense runtime architecture

Implemented: React/Vite frontend, Express application backend, MongoDB/Mongoose persistence, local raw-file storage and FastAPI inference. [Runtime contract](rebuild-contract.md) defines compatibility; source models and routes remain authoritative.

React → Express /api → local parsing and cycle aggregation → FastAPI /predict → Express validation and persistence → React status/history.

Express owns JWT authentication, ownership checks, vehicle/dataset records, local files, processing runs, predictions, notifications and explanation orchestration. Python owns input validation, the shared ordered 13-feature capacity-history contract, approved artifact loading and inference. It never writes the application database. Training/conversion/evaluation are explicit offline commands under ml-service; they are not an upload-time Python ingestion service.

Raw files live under backend/uploads/raw/<vehicleId> with randomized names. Stored references use provider=local, rawUrl=/uploads/raw/<vehicleId>/<filename>, processedUrl=null. They are bounded storage references, not public download endpoints. No object store or queue is required. One backend worker is supported; startup recovery reconciles interrupted runs. Multi-worker leasing, S3/GCS, native MATLAB uploads and manufacturer adapters are future proposals requiring review.

V3 was trained and evaluated but is unapproved. Legacy artifacts remain inactive. No EV-pack validation has been performed. See [deployment decision](v3-deployment-decision.md), [ML architecture](ml-architecture.md), [data flow](data-flow.md) and [API specification](api-specification.md).
