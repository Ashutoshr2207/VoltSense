# System context and actors

VoltSense is a college battery-health project with an implemented React/Vite interface, Express application backend, MongoDB persistence and FastAPI inference service. A user logs in, creates/selects an owned vehicle and uploads CSV/XLS/XLSX discharge history or supported diagnostic telemetry. Manufacturer/model are metadata labels; no manufacturer-specific mapping or EV-pack validity follows from selecting a vehicle.

The browser talks to Express /api. Express authenticates/authorizes, owns local raw files, parses/aggregates cycles, records status and requests Python inference using validated histories. FastAPI owns the shared 13-feature contract, approved model loading and inference; it never writes MongoDB. Offline conversion/training/review are developer workflows, not web ingestion jobs.

An accessible service with no approved artifact returns MODEL_UNAVAILABLE. The UI demonstrates real ingestion and a persisted truthful failure; refresh does not create predictions. Valid telemetry-only runs may provide measured diagnostics with null SOH/RUL. Successful model results and explanations require a committed approved inference run. Groq and charging providers are optional backend integrations, not substitutes for model approval.

V3 was trained/evaluated but failed deployment gates; legacy artifacts remain inactive. No EV-pack validation has been performed. The supplied NASA corpus has no untouched eligible EOL cohort. See [deployment decision](v3-deployment-decision.md) and [demo/handover](final-stabilization.md).

Local storage and one backend worker are current deployment assumptions. Object storage, queue/distributed leases, native MATLAB uploads and manufacturer adapters are future proposals. No schema/API changes are introduced by this documentation.
