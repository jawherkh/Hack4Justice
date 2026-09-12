# hack4justice – TypeScript Web API (`Backend/`)

This module is the web-facing backend. It exposes the REST API, owns the PostgreSQL database via Prisma, handles file storage through MinIO, and runs the dossier orchestration Temporal worker.

> For the full stack setup (Docker, all services, CI) see the [root README](../README.md).

---

## Responsibilities

| Concern | Implementation |
|---|---|
| REST API | Express 4 |
| App database | PostgreSQL 16 via Prisma ORM |
| File storage | MinIO (S3-compatible) |
| Dossier workflow | Temporal worker on `dossier-orchestration` queue |
| Logging | Pino (JSON in prod, pretty in dev) |

Neo4j and the graph/sandbox workers are owned by the **Python agent** (`../agent/`).

---

## Prerequisites

- Node.js 20 LTS (`node -v` → `v20.x`)
- npm ≥ 10
- A running stack — see root README for `docker compose up -d`

---

## Setup

```bash
# from repo root
cd Backend

# install dependencies
npm ci

# generate Prisma client (must run after npm ci and after schema changes)
npx prisma generate
```

Copy `../.env.example` to `../.env` at the repo root and fill in the `DATABASE_URL`, `MINIO_*`, and `TEMPORAL_*` values before running anything locally.

---

## Running locally (without Docker)

```bash
# API server with hot-reload
npm run dev

# Dossier orchestration worker
npm run worker:dossier
```

Both read from the `.env` file at the repo root. Make sure PostgreSQL, MinIO, and Temporal are up (`docker compose up -d postgres minio temporal`).

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start API with hot-reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run compiled production build |
| `npm run worker:dossier` | Start dossier orchestration Temporal worker |
| `npm run db:migrate` | Deploy pending Prisma migrations |
| `npm run db:migrate:dev` | Create + apply a new migration (dev only) |
| `npm run db:seed` | Seed demo data into PostgreSQL |
| `npm run db:reset` | Wipe DB and re-run all migrations (dev only) |
| `npm run db:studio` | Open Prisma Studio at http://localhost:5555 |
| `npm run storage:init` | Create required MinIO buckets |
| `npm run health` | Check PostgreSQL, MinIO, and Temporal connectivity |
| `npm run demo` | Full end-to-end fixture (migrate → seed → buckets → health) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest unit tests (single run) |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness probe — returns `200` if process is up |
| `GET` | `/health/ready` | Readiness probe — checks PostgreSQL, MinIO, Temporal |

Add new route files under `src/api/routes/` and register them in `src/api/index.ts`.

---

## Database

Schema is defined in `prisma/schema.prisma`. Key models:

| Model | Purpose |
|---|---|
| `Subject` | A person or entity being investigated |
| `Dossier` | A compiled report tied to a Subject |
| `Document` | A file stored in MinIO, linked to a graph node |

### Common migration workflow

```bash
# 1. Edit prisma/schema.prisma
# 2. Create the migration file and apply it
npm run db:migrate:dev -- --name describe_your_change
# 3. Regenerate the Prisma client
npx prisma generate
```

---

## Project Structure

```
Backend/
├── src/
│   ├── api/
│   │   ├── index.ts                Express app + server bootstrap
│   │   └── routes/
│   │       └── health.ts           GET /health, GET /health/ready
│   ├── lib/
│   │   ├── db.ts                   Prisma singleton + checkPostgres()
│   │   ├── storage.ts              MinIO client + checkMinio() + ensureBuckets()
│   │   ├── temporal.ts             Temporal client + QUEUES constants
│   │   └── logger.ts               Pino logger singleton
│   └── workers/
│       ├── dossierOrchestrationWorker.ts   Temporal worker entry point
│       ├── workflows/
│       │   └── dossierWorkflows.ts         orchestrateDossier workflow
│       └── activities/
│           └── dossierActivities.ts        compileDossier, exportDossier
├── prisma/
│   ├── schema.prisma               PostgreSQL schema (Prisma)
│   └── seed.ts                     Demo seed data
├── scripts/
│   ├── healthCheck.ts              CLI health probe
│   ├── storageInit.ts              MinIO bucket creation
│   └── demoFixture.ts              End-to-end fixture runner
├── Dockerfile                      Multi-stage (development / builder / production)
├── package.json                    Pinned dependencies + npm scripts
├── tsconfig.json
└── tsconfig.build.json
```

---

## Environment Variables

All variables are read from the `.env` file at the **repo root**. Relevant vars for this module:

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | |
| `API_PORT` | `3000` | |
| `LOG_LEVEL` | `debug` | |
| `DATABASE_URL` | — | Full Postgres connection string |
| `MINIO_ENDPOINT` | `localhost` | |
| `MINIO_PORT` | `9000` | |
| `MINIO_ROOT_USER` | — | |
| `MINIO_ROOT_PASSWORD` | — | |
| `TEMPORAL_ADDRESS` | `localhost:7233` | |
| `TEMPORAL_NAMESPACE` | `default` | |
| `QUEUE_DOSSIER_ORCHESTRATION` | `dossier-orchestration` | Must match Python agent config |
