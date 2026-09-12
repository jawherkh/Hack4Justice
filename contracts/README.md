# Hack4Justice integration contracts

Version 0.1.0 supplies proposed domain schemas, OpenAPI, typed
commands/events and synthetic fixtures for DGI, RNE and APII. It is not a
production backend or an approved legal rule set. Integration boundaries are
pending review.

```powershell
uv venv .venv
uv sync --locked
uv run python -m contracts.export
uv run pytest
uv run uvicorn contracts.mock_api:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000/docs for the read-only preview. No login or external
credentials are needed. Commands validate their body but return **501**, never
a simulated successful write. The preview binds to localhost. Authentication
and real mutations belong to subsequent tasks.

Frontend consumers can use `openapi.json` for client generation or import
`fixtures/*-dossier.json` directly. `fixtures/companies.json` supplies the seeded
company ID. All fixture data is synthetic. DGI demonstrates ready but not
accepted; RNE demonstrates a synthetic unsatisfied dependency; APII demonstrates
an unknown prerequisite. Unknown does not mean non-filing. Remediation stays
available in both waiting scenarios. The decision/receipt event examples are
separate illustrative transitions, not a replay stream for the static dossiers.

`schemas/` contains JSON Schema exports. Pydantic also checks cross-field and
cross-object invariants that JSON Schema alone cannot express. `node-catalog.json`
defines the eight types and supported states; `event-catalog.json` specifies
delivery, optimistic concurrency, idempotency and review transitions.
`ownership.json` records the proposed ownership boundary and its pending status.

One Temporal workflow owns lifecycle transitions per dossier. API database
projections serve UI queries. Graphiti supplies source-backed context and
approved version references. None of these contracts implements Temporal,
Graphiti, OCR, authorization, database writes or external agency integrations.

Raw uploads and OCR text remain in file storage; commands/events pass references.
Evidence replacements receive new IDs and retain prior versions. Decisions are
append-only; no update/delete contract exists. Persistence must enforce this.
Readiness, agency acceptance and prerequisite status remain independent fields.
Actor fields describe provenance; production endpoints must resolve and authorize
the actor server-side rather than trusting client-supplied identities.

Regenerate artifacts after editing Python models. Tests reject schema drift,
invalid references, cross-company commands, synthetic rule promotion and stale
findings. Python dependencies are reproducibly resolved in the root `uv.lock`.
