# hack4justice – Python Agent (`agent/`)

This module is the AI/graph backend. It owns the Neo4j knowledge graph via [Graphiti](https://github.com/getzep/graphiti), runs Temporal workers for graph ingestion and sandbox execution, and stores artifacts in MinIO.

> For the full stack setup (Docker, all services, CI) see the [root README](../README.md).

---

## Responsibilities

| Concern | Implementation |
|---|---|
| Knowledge graph | Neo4j 5 via Graphiti (LLM-powered entity/relationship extraction) |
| Graph ingestion worker | Temporal worker on `graph-ingestion` queue |
| Sandbox execution worker | Temporal worker on `sandbox-execution` queue |
| Artifact storage | MinIO (S3-compatible) |
| LLM backend | OpenAI (configurable model, default `gpt-4o-mini`) |
| Settings | Pydantic Settings (reads from `.env`) |
| Logging | Structlog (JSON in prod, console in debug) |

PostgreSQL and the dossier worker are owned by the **TypeScript API** (`../Backend/`).

---

## Prerequisites

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) — `pip install uv`
- A running stack — see root README for `docker compose up -d`

---

## Setup

```bash
# from repo root
cd agent

# install all dependencies (including dev extras)
uv pip install -e ".[dev]"
```

The `.env` file lives at the **repo root** (`../.env`). Pydantic Settings reads it automatically. Make sure `NEO4J_*`, `MINIO_*`, `TEMPORAL_*`, and `OPENAI_API_KEY` are filled in.

---

## Running locally (without Docker)

```bash
# Graph ingestion worker
python -m agent.workers.graph_ingestion_worker

# Sandbox execution worker
python -m agent.workers.sandbox_execution_worker
```

Both workers connect to Temporal at `TEMPORAL_ADDRESS` and run indefinitely until cancelled.

Make sure Neo4j, MinIO, and Temporal are up first:
```bash
docker compose up -d neo4j minio temporal
```

---

## One-off scripts

| Command | What it does |
|---|---|
| `python -m agent.scripts.graph_migrate` | Apply Neo4j constraints, indexes, and Graphiti schema |
| `python -m agent.scripts.health_check` | Check Neo4j and MinIO connectivity (exit 0 = healthy) |

Run graph migration once after a fresh stack start, or whenever the graph schema changes.

---

## How Graphiti works here

[Graphiti](https://github.com/getzep/graphiti) wraps Neo4j and uses an LLM (OpenAI by default) to automatically extract entities and relationships from free-text episodes.

When a document is ingested via the `IngestDocumentWorkflow`:

1. The `ingest_episode` activity calls `graphiti.add_episode()` with the document text.
2. Graphiti sends the text to OpenAI, extracts named entities and relationships.
3. Those are written as nodes and edges into Neo4j.

For pre-structured data you can also call `ingest_node` / `ingest_relationship` directly, which bypass the LLM and write raw Cypher.

---

## Temporal workflows

### `graph-ingestion` queue

| Workflow | Input | What it does |
|---|---|---|
| `IngestDocumentWorkflow` | `document_id`, `content`, `source_description` | Ingest free text via Graphiti (LLM entity extraction) |
| `LinkEntitiesWorkflow` | `from_id`, `to_id`, `relationship_type` | Create a typed relationship between two graph nodes |

### `sandbox-execution` queue

| Workflow | Input | What it does |
|---|---|---|
| `ExecuteSandboxJobWorkflow` | `job_id`, `task_type`, `payload` | Run an isolated task, store output JSON in MinIO |

---

## Project Structure

```
agent/
├── agent/
│   ├── __init__.py
│   ├── config.py               Pydantic Settings (reads .env)
│   ├── logger.py               Structlog configuration
│   ├── graph.py                Neo4j AsyncDriver + Graphiti client
│   ├── storage.py              MinIO client + put_object_bytes helper
│   ├── activities/
│   │   ├── __init__.py
│   │   ├── graph_activities.py     ingest_episode, ingest_node, ingest_relationship
│   │   └── sandbox_activities.py   run_sandbox_task, collect_artifacts
│   ├── workflows/
│   │   ├── __init__.py
│   │   ├── graph_workflows.py      IngestDocumentWorkflow, LinkEntitiesWorkflow
│   │   └── sandbox_workflows.py    ExecuteSandboxJobWorkflow
│   ├── workers/
│   │   ├── __init__.py
│   │   ├── graph_ingestion_worker.py     entry point – graph-ingestion queue
│   │   └── sandbox_execution_worker.py   entry point – sandbox-execution queue
│   └── scripts/
│       ├── __init__.py
│       ├── graph_migrate.py    Apply Neo4j constraints/indexes + Graphiti schema
│       └── health_check.py     CLI health probe (exit 0 = all healthy)
├── Dockerfile                  Multi-stage (development / production)
└── pyproject.toml              Pinned dependencies + tool config (ruff, mypy, pytest)
```

---

## Testing & Linting

```bash
# Run tests
pytest

# Lint
ruff check agent

# Type-check
mypy agent
```

Test files go in `agent/tests/`. Pytest is configured for `asyncio_mode = "auto"` so async test functions work without extra decorators.

---

## Environment Variables

All variables are read from the `.env` file at the **repo root**. Relevant vars for this module:

| Variable | Default | Notes |
|---|---|---|
| `NEO4J_URI` | `bolt://localhost:7687` | |
| `NEO4J_USER` | `neo4j` | |
| `NEO4J_PASSWORD` | — | |
| `MINIO_ENDPOINT` | `localhost` | |
| `MINIO_PORT` | `9000` | |
| `MINIO_ROOT_USER` | — | |
| `MINIO_ROOT_PASSWORD` | — | |
| `MINIO_BUCKET_DOCUMENTS` | `documents` | |
| `MINIO_BUCKET_SANDBOX` | `sandbox-artifacts` | |
| `TEMPORAL_ADDRESS` | `localhost:7233` | |
| `TEMPORAL_NAMESPACE` | `default` | |
| `QUEUE_GRAPH_INGESTION` | `graph-ingestion` | Must match TS `QUEUES.GRAPH_INGESTION` |
| `QUEUE_SANDBOX_EXECUTION` | `sandbox-execution` | Must match TS `QUEUES.SANDBOX_EXECUTION` |
| `OPENAI_API_KEY` | — | Required by Graphiti for entity extraction |
| `OPENAI_MODEL` | `gpt-4o-mini` | Any OpenAI chat model |
| `LOG_LEVEL` | `INFO` | Set to `DEBUG` for console-pretty output |
