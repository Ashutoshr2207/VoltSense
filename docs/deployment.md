# VoltSense Deployment & Infrastructure Architecture

> **Implementation Status**: `PLANNED / NOT IMPLEMENTED`  
> This document details the planned hosting topology, container boundaries, cloud infrastructure, and deployment pipelines. No cloud services are actively provisioned in this run.

---

## 1. Hosting Topology & Separation of Concerns

VoltSense utilizes a distributed, containerized microservices architecture that isolates computational workloads (Python scientific computing) from high-concurrency transactional APIs (Node.js) and static client delivery (React SPA).

```text
               End User / Fleet Operator
                           │
                           │ HTTPS / Port 443
                           ▼
          Global CDN / Static Edge (Vercel/Cloudflare)
                           │
                           │ Delivers Static SPA Bundle
                           ▼
          React Frontend Web Application
                           │
                           │ API Calls / JSON
                           ▼
        Ingress Load Balancer / Nginx Gateway
                           │
  ┌────────────────────────┴────────────────────────┐
  │ Cloud Virtual Private Cloud (VPC)               │
  │                                                 │
  │   Node.js / Express Backend Container           │
  │     ├── Job Dispatch ──► Python Data Pipeline   │
  │     └── Inferences   ──► Python ML Service      │
  └──────────────┬─────────────────────────┬────────┘
                 │                         │
                 ▼                         ▼
      MongoDB Atlas Cluster      Cloud Object Storage
      (Managed WiredTiger)       (AWS S3 / GCS Buckets)
```

---

## 2. Infrastructure Components Summary

| Subsystem | Target Hosting Platform | Deployment Artifact | Scaling Dimension |
|---|---|---|---|
| **Frontend** | Vercel / Cloudflare Pages / AWS S3 + CloudFront | Static pre-compiled Vite build (`dist/`) | Global edge caching; instant infinite scaling |
| **Backend API** | AWS ECS / Google Cloud Run / Render | Docker container running Node.js 20 LTS | Horizontal autoscaling based on CPU & request count |
| **Data Pipeline** | Kubernetes Job / Celery Worker / Cloud Run | Docker container running Python 3.11 | Task queue scaling based on uploaded dataset volume |
| **ML Inference Service** | AWS ECS (GPU or CPU-optimized) / Cloud Run | Docker container running Python 3.11 + PyTorch | Horizontal scaling based on batch inference queue depth |
| **Database** | MongoDB Atlas (Shared or Dedicated M10+) | Managed Replica Set | Automated disk autoscaling & replica failover |
| **Object Storage** | AWS S3 or Google Cloud Storage | Cloud Bucket with bucket lifecycle policies | Infinite durability and automated tiering (e.g. Glacier) |

---

## 3. Local Development Multi-Container Architecture (Planned `docker-compose.yml`)

For local development without cloud dependencies, the planned `docker-compose.yml` will orchestrate local containers:

```yaml
version: '3.8'

services:
  # React Frontend (Vite dev server)
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "5173:5173"
    environment:
      - VITE_API_BASE_URL=http://localhost:5000/api
    depends_on:
      - backend

  # Node.js Express Backend API
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "5000:5000"
    environment:
      - PORT=5000
      - NODE_ENV=development
      - MONGODB_URI=mongodb://mongodb:27017/voltsense
      - MONGODB_DATABASE=voltsense
      - JWT_SECRET=local_dev_secret_key_64_bytes_minimum
      - ML_SERVICE_URL=http://ml-service:8000
      - OBJECT_STORAGE_PROVIDER=local
    depends_on:
      - mongodb

  # Python Data Pipeline & Ingestion Service
  data-pipeline:
    build:
      context: ./data-pipeline
      dockerfile: Dockerfile
    environment:
      - MONGODB_URI=mongodb://mongodb:27017/voltsense
    depends_on:
      - mongodb

  # Python ML Inference Engine
  ml-service:
    build:
      context: ./ml-service
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - PORT=8000

  # Local MongoDB instance for offline development
  mongodb:
    image: mongo:7.0
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db

volumes:
  mongo_data:
```

---

## 4. Continuous Integration & Deployment (CI/CD)

The planned GitHub Actions workflow executes the following pipeline upon pushing to `develop` or `main`:

```text
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ 1. Lint & Format│───►│ 2. Test Suite   │───►│ 3. Docker Build │
│ (ESLint/Flake8) │    │ (Vitest/Pytest) │    │ (Container Img) │
└─────────────────┘    └─────────────────┘    └────────┬────────┘
                                                       │
┌─────────────────┐    ┌─────────────────┐             │
│ 6. Production   │◄───│ 5. Staging Gate │◄──────────────┘
│ (Rolling Deploy)│    │ (Manual Review) │    4. Vulnerability Audit
└─────────────────┘    └─────────────────┘    (Trivy / Snyk Scan)
```
