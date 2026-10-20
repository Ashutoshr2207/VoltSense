# VoltSense team documentation

This directory contains authoritative, team-required documentation for development, architecture, API contracts, deployment, and active product specifications. Personal audits, deep research reports, model inventories, and historical evaluation notes are preserved in [`own_docs/`](../own_docs/).

Start with [runtime contract](rebuild-contract.md) and [root setup/demo](../README.md). Existing Mongoose models and API routes remain locked compatibility boundaries.

## Core runtime references & specifications

- **Architecture & System:** [Architecture](architecture.md), [system context](system-context.md), [project structure](project-structure.md), [data flow](data-flow.md)
- **Product & UI:** [Frontend requirements & information architecture](frontend-requirements-and-ia.md)
- **API & Contracts:** [API inventory](api-specification.md), [upload/status examples](api-reference.md), [frontend-backend contract](frontend-backend-contract.md), [database schema](database-schema.md)
- **ML Architecture & Integration:** [ML architecture](ml-architecture.md), [ML backend contract](ml-backend-contract.md), [runtime contract](rebuild-contract.md)
- **Pipelines & Operations:** [Data pipeline](data-pipeline.md), [data dictionary](data-dictionary.md), [validation rules](validation-rules.md), [error handling](error-handling.md), [naming conventions](naming-conventions.md)
- **Workflows & Deployment:** [Development workflow](development-workflow.md), [deployment](deployment.md), [environment variables](environment-variables.md), [testing strategy](testing-strategy.md)

React, Express, MongoDB/Mongoose and FastAPI are implemented. Node owns CSV/XLS/XLSX parsing/aggregation and local storage; Python owns causal 13-feature inference. Current frontend clients use real endpoints, not mock-only state.

## Research reports, audits & historical logs (`own_docs/`)

Personal investigations, model evaluations, and research catalogues are located in `own_docs/`:
- **Model Audits:** [Unified dataset ML audit](../own_docs/unified_dataset_ml_audit.md), [ML model inventory](../own_docs/ml_model_inventory.md), [repository cleanup audit](../own_docs/repository_cleanup_audit.md)
- **Dataset Research:** [Dataset suitability report](../own_docs/battery-dataset-suitability-report.md), [battery quality report](../own_docs/battery-quality-report.md), [dataset baseline](../own_docs/dataset-baseline.md)
- **Evaluation & Deployment Decisions:** [Historical V2 evaluation](../own_docs/nasa-evaluation-report.md), [V3 RUL consistency & evaluation](../own_docs/rul-consistency-v3.md), [V3 deployment decision](../own_docs/v3-deployment-decision.md)
- **Engineering & Stabilization Notes:** [Final stabilization](../own_docs/final-stabilization.md), [rebuild verification](../own_docs/rebuild-verification.md), [ML communication fix](../own_docs/ml-communication-fix.md), [tonight MVP readiness](../own_docs/tonight-mvp-readiness.md)

