# Hack4Justice

The [integration contracts](contracts/README.md) provide validated domain
schemas, an OpenAPI contract, synthetic DGI/RNE/APII fixtures and a read-only
mock API. Real workflow execution and agency integrations are not implemented yet.

Run `uv sync --locked`, then `uv run uvicorn contracts.mock_api:app --host 127.0.0.1 --port 8000`.
Open `http://127.0.0.1:8000/docs` to explore the contract preview.
