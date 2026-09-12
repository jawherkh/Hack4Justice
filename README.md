# Hack4Justice

The [integration contracts](contracts/README.md) provide validated domain
schemas, an OpenAPI contract, synthetic DGI/RNE/APII fixtures and a read-only
mock API. Real workflow execution and agency integrations are not implemented yet.
Run `uv sync --locked`, then `uv run uvicorn contracts.mock_api:app --host 127.0.0.1 --port 8000`.
Open `http://127.0.0.1:8000/docs` to explore the contract preview.

---

## Modules

| Module | Language | Path | Description |
|---|---|---|---|
| Web app | TypeScript (Turborepo) | `apps/web` | Frontend |
| App API | TypeScript (Elysia) | `apps/api` | Monorepo app API |
| **Web API backend** | TypeScript (Express) | [`Backend/`](Backend/README.md) | REST API, PostgreSQL, MinIO, dossier worker |
| **Agent backend** | Python | [`agent/`](agent/README.md) | Graphiti/Neo4j, Temporal workers, sandbox |

## Local dev environment

See [`Backend/README.md`](Backend/README.md) and [`agent/README.md`](agent/README.md) for setup instructions, or run the full stack with:

```bash
# Create a local .env with POSTGRES_PASSWORD, NEO4J_PASSWORD and MINIO_ROOT_PASSWORD.
docker compose up -d
cd Backend && npm run demo
```
