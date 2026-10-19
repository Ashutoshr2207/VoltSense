# VoltSense documentation

Start with [runtime contract](rebuild-contract.md), [final stabilization/handover](final-stabilization.md) and [root setup/demo](../README.md). Existing Mongoose models and API routes remain locked compatibility boundaries. Older design documents not listed as runtime references may contain proposals; they do not establish implemented features.

## Current runtime references

- [Architecture](architecture.md), [system context](system-context.md), [project structure](project-structure.md), [data flow](data-flow.md)
- [API inventory](api-specification.md), [upload/status examples](api-reference.md), [frontend contract](frontend-backend-contract.md)
- [ML architecture](ml-architecture.md), [ML boundary](ml-backend-contract.md), [communication diagnosis](ml-communication-fix.md)
- [Validation](validation-rules.md), [errors](error-handling.md), [naming](naming-conventions.md), [development workflow](development-workflow.md)

React, Express, MongoDB/Mongoose and FastAPI are implemented. Node owns CSV/XLS/XLSX parsing/aggregation and local storage; Python owns causal 13-feature inference. There is no separate Python ingestion service, object store or manufacturer adapter. Multi-worker queues/cloud storage/native MATLAB uploads remain proposals. Current frontend clients use real endpoints, not mock-only state.

## Dataset and scientific evidence

- [Dataset baseline](dataset-baseline.md), [quality report](battery-quality-report.md)
- [Historical V2 evaluation](nasa-evaluation-report.md), [typed model configurations/results](nasa-evaluation-results.json)
- [V3 RUL policy and evaluation](rul-consistency-v3.md), [V3 deployment decision](v3-deployment-decision.md), [gate audit JSON](v3-deployment-gates.json)
- [ML commands](../ml-service/README.md), [synthetic demo instructions](../sample-data/README.md)

V3 remains unapproved; legacy artifacts inactive. No EV-pack validation or calibrated uncertainty is claimed. Preserve source datasets, frozen splits, approval flags and artifacts. The reviewed blocker is scientific evidence, not permission to bypass strict loading.

[Earlier verification history](rebuild-verification.md) records chronological results; its latest handover link supersedes historical setup/status statements. No API/database migration is introduced by these documentation corrections.
