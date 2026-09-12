# Hack4Justice

The [integration contracts](contracts/README.md) provide validated domain
schemas, an OpenAPI contract, synthetic DGI/RNE/APII fixtures and a read-only
mock API. The TypeScript API runtime now includes durable, per-dossier Temporal
lifecycle processing plus the hardened document sandbox. The Graphiti knowledge service in
[`apps/graphiti`](apps/graphiti/README.md) turns scraped legal text into an
agency-scoped Neo4j graph using Gemini extraction, embeddings, and cross-encoder
search. External agency submission remains a separate integration.

Run `uv sync --locked`, then `uv run uvicorn contracts.mock_api:app --host 127.0.0.1 --port 8000`.
Open `http://127.0.0.1:8000/docs` to explore the contract preview.
