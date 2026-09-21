# VoltSense Project Structure

## 1. Actual Repository Structure (Current State)

The repository currently contains the **Frontend** application, documentation assets, and root environment templates. Backend, ML, and Data Pipeline components are specified in this documentation suite but are **not yet implemented** in the physical folder tree.

```text
VoltSense/
├── .env.example                  # Environment variable template (MongoDB connection strings)
├── .gitignore                    # Standard Node.js, build, log, and environment ignore rules
├── README.md                     # Root project readme
│
├── docs/                         # Comprehensive project documentation suite
│   ├── README.md                 # Documentation index and implementation status guide
│   ├── architecture.md           # System architecture, components, and responsibilities
│   ├── system-context.md         # Context diagram, external actors, and user journey
│   ├── project-structure.md      # Physical repository layout and ownership (This file)
│   ├── api-specification.md      # REST API contracts, routes, and schemas
│   ├── api-reference.md          # Developer endpoint guide with sample payloads
│   ├── data-flow.md              # Ingestion, pipeline, inference, and insight flows
│   ├── frontend-backend-contract.md # API protocol, payload standards, and rules
│   ├── data-pipeline.md          # Python data pipeline stages and adapter design
│   ├── ml-architecture.md        # Machine learning inference architecture and models
│   ├── ml-backend-contract.md    # Service contract between Backend and ML service
│   ├── database-schema.md        # Authoritative 8-collection MongoDB Atlas schema
│   ├── data-dictionary.md        # Shared data fields, electrochemical units, and types
│   ├── naming-conventions.md     # Universal naming rules across JS, Python, API, and DB
│   ├── environment-variables.md  # Environment variables and configuration reference
│   ├── error-handling.md         # Error categorization, response envelopes, and codes
│   ├── validation-rules.md       # Entity and telemetry validation constraints
│   ├── testing-strategy.md       # Multi-tier testing approach and contracts
│   ├── deployment.md             # Infrastructure layout and deployment topology
│   └── development-workflow.md   # Branching strategy, PR guidelines, and workflows
│
└── frontend/                     # [IMPLEMENTED] React 18 / Vite / Tailwind Web App
    ├── dist/                     # Production build artifacts
    ├── index.html                # Single Page Application entrypoint
    ├── node_modules/             # Installed NPM dependencies
    ├── package.json              # Frontend dependencies and npm scripts
    ├── package-lock.json         # Pinned dependency tree
    ├── postcss.config.js         # PostCSS configuration for Tailwind
    ├── public/                   # Static assets, icons, and SVG illustrations
    ├── tailwind.config.js        # Custom theme, tokens, and typography configuration
    ├── vite.config.js            # Vite build configuration with React plugin
    └── src/                      # Frontend source code
        ├── App.jsx               # Root application shell, tab routing, layout wrapper
        ├── index.css             # Tailwind base layers, fonts, utility classes
        ├── main.jsx              # React DOM render entrypoint
        ├── components/           # Reusable UI component library
        │   ├── common/           # Shared presentation widgets
        │   │   ├── AddVehicleModal.jsx # Modal dialog to register EV asset
        │   │   └── VoltSenseLogo.jsx   # SVG brand mark
        │   └── layout/           # Structure and navigation components
        │       ├── Navbar.jsx    # Top app bar, search input, notification menu
        │       └── Sidebar.jsx   # Navigation rail, active tab switcher, quick stats
        ├── context/              # React Context Providers
        │   └── AppContext.jsx    # Client state, mock data fixtures, localStorage sync
        └── pages/                # Primary application views
            ├── BatteryAnalysis.jsx    # Pack telemetry, SOH diagnostic, cell voltage charts
            ├── Dashboard.jsx          # Fleet overview, KPI widgets, active vehicles grid
            ├── Help.jsx               # Telemetry formatting guide and FAQ
            ├── MyVehicles.jsx         # EV asset management, status cards, filter bar
            ├── PredictionHistory.jsx  # Inference audit trail, Bayesian credible intervals
            ├── Settings.jsx           # Preferences, notification toggles, profile
            ├── SignIn.jsx             # Authentication screen (simulated login)
            └── UploadData.jsx         # Telemetry upload, pipeline simulation, stage logs
```

---

## 2. Directory Ownership & Responsibility Matrix

| Directory | Subsystem | Status | Owner | Primary Purpose |
|---|---|---|---|---|
| `frontend/` | Web Client | **IMPLEMENTED** | Frontend Engineering | UI rendering, user interaction, chart visualization, API consumption. |
| `docs/` | Documentation | **IMPLEMENTED** | Shared / All Teams | Authoritative specifications, API contracts, schemas, and guidelines. |
| `backend/` | API & Orchestration | **PLANNED / NOT IMPLEMENTED** | Backend Engineering | Express REST API, JWT auth, database access, pipeline orchestration. |
| `data-pipeline/` | Data Engineering | **PLANNED / NOT IMPLEMENTED** | Data Engineering | Raw BMS file ingestion, manufacturer adapters, cleaning, feature extraction. |
| `ml-service/` | ML Inference | **PLANNED / NOT IMPLEMENTED** | Machine Learning | Model loading, SOH/RUL inference, degradation curve projection. |
| `datasets/` | Data Samples | **PLANNED / NOT IMPLEMENTED** | Data / QA | Reference CSVs, synthetic traces, and sample manufacturer datasets. |

---

## 3. Directory Content Rules

### 3.1 `frontend/`
- **Belongs Here**: React components, custom hooks, Tailwind styles, state providers, asset icons, Vite configuration.
- **Does NOT Belong Here**: Database connection logic, MongoDB models, secret API keys (e.g. `MONGODB_URI`), Python scripts, raw multi-megabyte CSV files.

### 3.2 `backend/` (Planned)
- **Belongs Here**: Express route handlers, controllers, service layers, Mongoose/MongoDB schemas, JWT middleware, object storage client wrappers, job queue producers.
- **Does NOT Belong Here**: React JSX components, heavy numerical computation, Python training scripts, monolithic binary files.

### 3.3 `data-pipeline/` (Planned)
- **Belongs Here**: Python modules for CSV/Parquet parsing, CAN DBC mapping dictionaries, manufacturer adapter classes (Tesla, BYD, Tata), outlier detection filters, feature engineering routines, unit tests for data transforms.
- **Does NOT Belong Here**: Express routes, frontend assets, database migrations, model training loops.

### 3.4 `ml-service/` (Planned)
- **Belongs Here**: Python model inference handlers (FastAPI/Flask or worker functions), model weight loaders, Bayesian MCMC regression routines, evaluation metric computations, feature vector transformers.
- **Does NOT Belong Here**: Raw telemetry file parsing, UI code, direct browser HTTP endpoints.

### 3.5 `docs/`
- **Belongs Here**: Markdown documentation, architecture diagrams, API contracts, database schema references, developer onboarding guides.
- **Does NOT Belong Here**: Production source code, executable binaries, passwords, actual API secrets, client tokens.

---

## 4. Intended Target Workspace Layout

Once backend, pipeline, and ML services are provisioned, the repository will adhere to the following top-level architecture:

```text
VoltSense/
├── .env.example
├── .gitignore
├── docker-compose.yml            # [PLANNED] Multi-container local orchestration
├── README.md
│
├── frontend/                     # [IMPLEMENTED] React 18 / Vite / Tailwind Web App
├── backend/                      # [PLANNED] Node.js / Express REST API
│   ├── src/
│   │   ├── config/               # Database and cloud storage clients
│   │   ├── controllers/          # Route controller handlers
│   │   ├── middleware/           # Auth, error, and validation middleware
│   │   ├── models/               # Mongoose / MongoDB collection models
│   │   ├── routes/               # Express router declarations
│   │   ├── services/             # Business logic and orchestrators
│   │   └── utils/                # Formatting and logger helpers
│   ├── tests/                    # Unit and integration test suites
│   ├── package.json
│   └── server.js                 # HTTP server entrypoint
│
├── data-pipeline/                # [PLANNED] Python Data Processing Pipeline
│   ├── adapters/                 # Tesla, BYD, Tata manufacturer parsers
│   ├── cleaning/                 # Missing value and outlier handling
│   ├── features/                 # Electrochemical feature engineering
│   ├── validation/               # Telemetry schema and range validation
│   ├── pipeline.py               # Pipeline execution runner
│   ├── requirements.txt          # Python dependencies (pandas, numpy, scipy)
│   └── tests/                    # Data transform test fixtures
│
├── ml-service/                   # [PLANNED] Python ML Inference Subsystem
│   ├── models/                   # SOH, RUL, and EOL model architectures
│   ├── registry/                 # Model registry and metadata loaders
│   ├── inference.py              # Inference service runner
│   ├── requirements.txt          # PyTorch, Scikit-learn, NumPyro
│   └── tests/                    # Prediction regression tests
│
├── datasets/                     # [PLANNED] Sample and synthetic test telemetry
│   ├── demo/                     # Small reference CSV files for local testing
│   └── synthetic/                # Generator scripts for mock CAN streams
│
└── docs/                         # [IMPLEMENTED] Authoritative documentation suite
```
