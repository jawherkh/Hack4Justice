# Hack4Justice

The [integration contracts](contracts/README.md) provide validated domain
schemas, an OpenAPI contract, synthetic DGI/RNE/APII fixtures and a read-only
mock API. The TypeScript API runtime now includes durable, per-dossier Temporal
lifecycle processing, the principal Gemini-backed Agents SDK assistant, and the hardened document sandbox. The Graphiti knowledge service in
[`apps/graphiti`](apps/graphiti/README.md) turns scraped legal text into an
agency-scoped Neo4j graph using Gemini extraction, embeddings, and cross-encoder
search. External agency submission remains a separate integration.

The principal assistant is available at `POST /api/v1/dossiers/:dossierId/agent` when
`GEMINI_API_KEY` is configured. It returns an SSE activity stream and persists the SDK
session and replayable events in the dossier repository. The API worker registers both
dossier lifecycle workflows and the durable `agentTurnWorkflow`; agent turns use the
same session ID and the project’s no-network Docker sandbox across retries.

Run `uv sync --locked`, then `uv run uvicorn contracts.mock_api:app --host 127.0.0.1 --port 8000`.
Open `http://127.0.0.1:8000/docs` to explore the contract preview.
