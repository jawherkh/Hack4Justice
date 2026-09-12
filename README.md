# hack4justice – Local Development Environment

Reproducible local stack with two backends:

| Backend | Language | Location | Responsibility |
|---|---|---|---|
| **Web API** | TypeScript / Node | `Backend/` | REST API, PostgreSQL (Prisma), MinIO, dossier orchestration |
| **Agent** | Python | `agent/` | Graphiti / Neo4j graph, Temporal workers, sandbox execution |

---

## Service Map

| Service | URL | Owner |
|---|---|---|
| **Web API** | http://localhost:3000 | `Backend/` |
| **API health** | http://localhost:3000/health/ready | — |
| **PostgreSQL** | localhost:5432 | infrastructure |
| **Neo4j Browser** | http://localhost:7474 | `agent/` |
| **Neo4j Bolt** | bolt://localhost:7687 | — |
| **MinIO S3 API** | http://localhost:9000 | infrastructure |
| **MinIO Console** | http://localhost:9001 | — |
| **Temporal gRPC** | localhost:7233 | infrastructure |
| **Temporal UI** | http://localhost:8088 | — |

### Temporal task queues

| Queue | Worker container | Language | Purpose |
|---|---|---|---|
| `graph-ingestion` | `worker-graph` | Python | Ingest documents/entities into Neo4j via Graphiti |
| `dossier-orchestration` | `worker-dossier` | TypeScript | Compile and export dossiers |
| `sandbox-execution` | `worker-sandbox` | Python | Run isolated sandbox jobs |

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) ≥ 25
- [Node.js](https://nodejs.org/) 20 LTS
- [Python](https://www.python.org/) 3.11+
- [uv](https://docs.astral.sh/uv/) (fast Python package manager) — `pip install uv`

---

## Fresh Checkout Setup

```bash
# 1. Clone and enter the repo
git clone <repo-url> hack4justice
cd hack4justice

# 2. Copy env and fill in secrets
cp .env.example .env
# Edit .env — replace every "change_me" with real values
# Don't forget OPENAI_API_KEY (used by Graphiti)

# 3. Install TypeScript dependencies
cd Backend && npm ci && cd ..

# 4. Install Python dependencies
cd agent && uv pip install -e ".[dev]" && cd ..

# 5. Start all infrastructure + services
docker compose up -d

# 6. Run the end-to-end demo fixture
#    (DB migrate → seed → MinIO buckets → Neo4j schema → health checks)
cd Backend && npm run demo
```

If the demo fixture exits 0, the environment is ready.

---

## Daily Workflow

```bash
# Start everything
docker compose up -d

# Stop (keep data volumes)
docker compose down

# Full reset (wipe all volumes)
docker compose down -v
```

---

## TypeScript API commands  (`Backend/`)

```bash
cd Backend

npm run dev             # start API with hot-reload (without Docker)
npm run worker:dossier  # start dossier worker (without Docker)
npm run build           # compile to dist/

npm run db:migrate:dev  # create + apply a new Prisma migration
npm run db:migrate      # apply existing migrations
npm run db:seed         # seed demo data
npm run db:reset        # wipe + re-migrate (dev only)
npm run db:studio       # Prisma Studio → http://localhost:5555

npm run storage:init    # create MinIO buckets
npm run health          # check PostgreSQL, MinIO, Temporal
npm run demo            # full end-to-end fixture

npm run lint
npm run typecheck
npm run test
```

## Python agent commands  (`agent/`)

```bash
cd agent

# Run workers locally (without Docker)
python -m agent.workers.graph_ingestion_worker
python -m agent.workers.sandbox_execution_worker

# One-off scripts
python -m agent.scripts.graph_migrate   # apply Neo4j constraints/indexes
python -m agent.scripts.health_check    # check Neo4j and MinIO

# Tests / lint
pytest
ruff check agent
mypy agent
```

---

## Environment Variables

See `.env.example` for the full annotated list. Key groups:

| Group | Variables | Used by |
|---|---|---|
| PostgreSQL | `DATABASE_URL`, `POSTGRES_*` | TS API |
| MinIO | `MINIO_*` | TS API + Python agent |
| Temporal | `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `QUEUE_*` | both |
| Neo4j | `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` | Python agent |
| OpenAI | `OPENAI_API_KEY`, `OPENAI_MODEL` | Python agent (Graphiti) |

---

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs five jobs:

| Job | What it checks |
|---|---|
| `ts-lint-typecheck` | ESLint + `tsc --noEmit` in `Backend/` |
| `ts-test` | Vitest unit tests in `Backend/` |
| `py-lint-typecheck` | Ruff + mypy in `agent/` |
| `py-test` | Pytest in `agent/` |
| `integration` | All 4 services running; DB migrate+seed, graph migrate, both health checks |

---

## Project Structure

```
hack4justice/
├── Backend/                        TypeScript web API
│   ├── src/
│   │   ├── api/
│   │   │   ├── index.ts            Express entry point
│   │   │   └── routes/health.ts    /health  /health/ready
│   │   ├── lib/
│   │   │   ├── db.ts               Prisma client
│   │   │   ├── storage.ts          MinIO client
│   │   │   ├── temporal.ts         Temporal client + queue constants
│   │   │   └── logger.ts           Pino logger
│   │   └── workers/
│   │       ├── dossierOrchestrationWorker.ts
│   │       ├── workflows/dossierWorkflows.ts
│   │       └── activities/dossierActivities.ts
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── scripts/
│   │   ├── healthCheck.ts
│   │   ├── storageInit.ts
│   │   └── demoFixture.ts
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
├── agent/                          Python agent backend
│   ├── agent/
│   │   ├── config.py               Pydantic settings
│   │   ├── logger.py               Structlog setup
│   │   ├── graph.py                Neo4j / Graphiti clients
│   │   ├── storage.py              MinIO client
│   │   ├── activities/
│   │   │   ├── graph_activities.py
│   │   │   └── sandbox_activities.py
│   │   ├── workflows/
│   │   │   ├── graph_workflows.py
│   │   │   └── sandbox_workflows.py
│   │   ├── workers/
│   │   │   ├── graph_ingestion_worker.py
│   │   │   └── sandbox_execution_worker.py
│   │   └── scripts/
│   │       ├── graph_migrate.py
│   │       └── health_check.py
│   ├── Dockerfile
│   └── pyproject.toml
│
├── infra/
│   └── temporal/development-sql.yaml
├── .github/workflows/ci.yml
├── docker-compose.yml              orchestrates all services
├── .env.example
└── README.md
```
