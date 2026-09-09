# VoltSense Development Workflow & Contribution Guidelines

## 1. Git Branching Strategy

VoltSense utilizes a structured **GitFlow-inspired** branching model designed for parallel development across Frontend, Backend, Data Engineering, and Machine Learning teams.

```text
main     ───────────────────────────────────────────────────● Release v1.0.0
           ▲
           │ Merge develop
develop  ──●───●───────────────────●───────────●────────────┘
               │                   ▲           ▲
               ├───► feature/fe ───┤ PR #1     │
               │                   │           │
               └───► feature/be ───┼───────────┘ PR #2
```

### Branch Naming Standards
- **Primary Branches**:
  - `main`: Production-ready code. Locked to direct pushes; deployments trigger automatically from tags or releases.
  - `develop`: Central integration branch. All feature branches merge here via Pull Request.
- **Feature Branches**:
  - `feature/frontend-<short-description>` (e.g. `feature/frontend-degradation-chart`)
  - `feature/backend-<short-description>` (e.g. `feature/backend-vehicle-routes`)
  - `feature/data-pipeline-<short-description>` (e.g. `feature/data-pipeline-byd-adapter`)
  - `feature/ml-<short-description>` (e.g. `feature/ml-bayesian-soh`)
- **Fix & Documentation Branches**:
  - `fix/<area>-<short-description>` (e.g. `fix/backend-cors-headers`)
  - `docs/<short-description>` (e.g. `docs/update-api-spec`)
  - `refactor/<area>-<short-description>` (e.g. `refactor/frontend-theme-tokens`)

---

## 2. Feature Development Lifecycle

```text
┌────────────────────────┐
│ 1. Branch Creation     │ git checkout -b feature/<area>-<desc> develop
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ 2. Contract Review     │ Verify docs/ before writing new code
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ 3. Local Coding        │ Follow naming-conventions.md
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ 4. Unit & Lint Testing │ npm test / pytest / linter
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ 5. Pull Request        │ Target develop branch
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ 6. Review & CI Check   │ Peer approval + green CI pipeline
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ 7. Merge & Staging     │ Squash & merge into develop -> main
└────────────────────────┘
```

---

## 3. Contract Change Policy (Source-of-Truth Invariant)

To protect team velocity and eliminate integration breakage:

> **Mandatory Rule**: If a proposed code change alters an API endpoint, modifies a request/response shape, adds an environment variable, changes an electrochemical metric unit, or impacts database fields:
>
> 1. The engineer must **first update the documentation file** in `docs/` (`api-specification.md`, `frontend-backend-contract.md`, `data-dictionary.md`, `naming-conventions.md`, etc.).
> 2. The documentation PR must be reviewed and approved by both the producer team and consumer team before implementation proceeds.
> 3. No breaking code change may be merged without the corresponding documentation update.

---

## 4. Local Development Environment Setup

### 4.1 Prerequisites
- **Node.js**: v18.x or v20.x LTS
- **Python**: v3.11+
- **Git**: v2.40+
- **Package Managers**: `npm` (v9+) and `pip` / `virtualenv`

### 4.2 Frontend Local Setup
```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Launch Vite local dev server
npm run dev
# Running at http://localhost:5173
```

### 4.3 Backend Local Setup (Planned)
```bash
# Navigate to backend
cd backend

# Copy environment template
cp ../.env.example .env

# Install dependencies & run dev server
npm install
npm run dev
# Running at http://localhost:5000
```

### 4.4 Data Pipeline & ML Local Setup (Planned)
```bash
# Set up Python virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install pipeline & ML requirements
pip install -r data-pipeline/requirements.txt
pip install -r ml-service/requirements.txt
```

---

## 5. Pull Request (PR) Checklist

Before submitting a PR to `develop`, verify:
- [ ] Code strictly follows [naming-conventions.md](file:///r:/PP/VoltSense/docs/naming-conventions.md).
- [ ] All new functions include unit or integration tests.
- [ ] No live secrets or credentials are included in code or git history.
- [ ] MongoDB schema is untouched (all 8 collections and existing fields preserved).
- [ ] Any API changes are reflected in [api-specification.md](file:///r:/PP/VoltSense/docs/api-specification.md).
- [ ] All linter and test commands pass with zero warnings.
