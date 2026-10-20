# Repository Guidelines

## Project Structure & Module Organization
VoltSense combines three services for EV battery health and remaining-life analysis:
- `backend/src/`: Express routes, controllers, services, Mongoose models, middleware, and validators. Tests live in `backend/tests/`; demo seeding lives in `backend/scripts/`.
- `frontend/src/`: React pages, components, context, hooks, API clients, and utilities. Static assets live in `frontend/public/`; smoke tests live in `frontend/smoke/`.
- `ml-service/`: FastAPI inference in `app.py`, feature engineering in `features.py`, and trained artifacts in `models/`.

## Build, Test, and Development Commands
Run commands from the indicated directory; there is no root package script.
- Backend: `npm ci` installs dependencies; `npm run dev` starts nodemon; `npm start` starts the API; `npm run seed` seeds demo data; `npm test` runs Jest.
- Frontend: `npm ci` installs dependencies; `npm run dev` starts Vite; `npm run build` creates the production bundle; `npm run preview` serves it; `npm run test:smoke` runs Vitest.
- ML service: install with `pip install -r requirements.txt`, then run `python -m uvicorn app:app --host 127.0.0.1 --port 8000`.

Configure MongoDB and backend environment variables before starting the stack. See `README.md` for setup details.

## Coding Style & Naming Conventions
Follow surrounding code: two-space indentation, single quotes, and semicolons in JavaScript; four-space indentation and snake_case functions in Python. Backend modules use CommonJS; frontend modules use ES imports. Use PascalCase for React components and camelCase for JavaScript functions and variables. Keep API orchestration in services and request handling in controllers. No formatter or lint script is configured.

## Testing Guidelines
Backend tests use Jest, Supertest, and in-memory MongoDB; name files `backend/tests/*.test.js`. Frontend tests use Vitest, React Testing Library, and jsdom; name files `frontend/smoke/*.test.jsx`. Cover changed behavior, including validation failures and empty UI states. No coverage threshold is configured. Run relevant suites and the frontend build before requesting review.

## Commit & Pull Request Guidelines
Available branch history contains the imperative subject “Add VoltSense V2 updates”; no enforced prefix convention is evident. Use concise, descriptive imperative subjects. PRs should explain the change, link relevant issues, report validation commands and results, and include screenshots for UI changes.

## Security & Model Integrity
Keep `.env`, credentials, uploads, and generated output out of commits. Keep Groq and charging-provider keys on the backend. Preserve trained model artifacts and feature ordering; do not retrain models incidentally.

## Project-Specific Guardrails

### API and Database Compatibility
- Do not change existing API endpoint paths, HTTP methods, request/response shapes, authentication behavior, or database collection/schema field names unless explicitly approved.
- Before changing a shared contract, inspect every frontend, backend, and ML-service consumer.
- Prefer backward-compatible, minimal patches.

### ML Integrity and Deployment
- Production inference must remain disabled unless all existing approval gates pass and explicit approval is given.
- Never lower thresholds, alter evaluation splits, relabel censored batteries, or substitute synthetic/demo predictions to make a candidate pass.
- Never overwrite existing model artifacts. Save experiments in versioned run directories with configuration, metrics, battery-level splits, and reproducibility details.
- Split by battery, prevent future/target leakage, and fit preprocessing on training data only.
- Keep the existing NASA splits unchanged. Keep the reserved XJTU Batch 1–2 cohort untouched for prospective external evaluation.
- Report baseline performance alongside candidate metrics. A candidate that loses to its baseline must not be presented as an improvement.
- When a model is unavailable or unapproved, return the existing safe unavailable status; never fabricate a real prediction.

### Data and Demo Integrity
- Treat the unified battery dataset as a research catalogue, not automatically as a pooled training matrix.
- Do not mix sparse, partial, rate-confounded, or incompatible observations into the dense-cycle training task without a separately documented task definition.
- Clearly distinguish real predictions, sample/demo data, and unavailable model results in the UI and API.
- Never present simulated values as measured vehicle telemetry.

### Scope and Change Management
- Prioritize completing and stabilizing the existing MVP over adding features or redesigning the architecture.
- Do not introduce new frameworks, dependencies, services, or database migrations unless necessary and explicitly justified.
- Do not perform unrelated refactors or modify existing artifacts incidentally.
- Before editing, inspect the relevant code and current git diff. Preserve unrelated user changes.
- After editing, run targeted tests, relevant full test suites, and the production build when applicable.
- Report commands run, pass/fail counts, changed files, remaining blockers, and any steps that require manual verification.
- Never claim a feature works unless it has been verified.
- Never try to overengineer
- Keep scope limited