# Graphiti knowledge service

This service turns scraped legal text into a source-backed, agency-partitioned
knowledge graph using Graphiti, Neo4j, and Gemini. It is intentionally separate
from the TypeScript business API so ingestion/search workloads can be scaled and
secured independently.

## Run locally

From the repository root:

```bash
uv sync --locked
cp .env.example .env
# Edit .env and set GEMINI_API_KEY to your Google AI Studio key.
export NEO4J_URI="bolt://localhost:7687"
export NEO4J_USER="neo4j"
export NEO4J_PASSWORD="password"
uv run uvicorn apps.graphiti.main:app --host 127.0.0.1 --port 8010 --reload
```

The Python service reads the same variables from `.env`; the `export` lines
above are only needed when overriding the local defaults for one shell.

`GEMINI_LLM_MODEL` configures the large extraction model,
`GEMINI_SMALL_MODEL` configures the small model used for reranking (and as the
small Graphiti model), and `GEMINI_EMBEDDING_MODEL` configures embeddings.

## Agency scope

Every ontology, ingest, and search request must send one of the existing shared
agency enum values in `X-Agency-Code`:

| Header | Graphiti group id | Domain                                 |
| ------ | ----------------- | -------------------------------------- |
| `DGI`  | `dgi`             | Tax and fiscal compliance              |
| `RNE`  | `rne`             | Corporate registry and status updates  |
| `APII` | `apii`            | Licensing and administrative approvals |

The client never supplies `group_id`; the service derives it from the header.
This prevents a request scoped to one agency from searching another agency's
legal graph.

## Pipeline endpoints

- `GET /api/v1/ontology` returns the extraction ontology and provenance rules.
- `POST /api/v1/knowledge/ingest` uses Chonkie's sentence chunker, attaches
  provenance and source offsets, extracts typed entities/edges, and stores each
  chunk as an episode in Neo4j. Exhausted chunks are skipped and returned in a
  `partial` response so later chunks continue processing.
- `POST /api/v1/knowledge/ingest/bulk` processes several documents sequentially
  so Graphiti can use recent episode context during entity resolution; one
  document's skipped chunks do not stop later documents.
- `POST /api/v1/knowledge/search` uses
  `graphiti.search_(query, group_ids=[group_id],
config=COMBINED_HYBRID_SEARCH_CROSS_ENCODER)` and returns edges, nodes, and
  source episode excerpts for the future agent and side panel.

Example:

```bash
curl -X POST http://127.0.0.1:8010/api/v1/knowledge/ingest \
  -H 'Content-Type: application/json' \
  -H 'X-Agency-Code: DGI' \
  -d '{
    "document": {
      "document_id": "dgi-tax-guide-2026",
      "title": "Quarterly tax declaration guide",
      "text": "... scraped official text ...",
      "source_uri": "https://example.gov.tn/tax-guide",
      "source_kind": "official",
      "language": "fr"
    }
  }'
```

The service does not promote scraped content to an approved legal procedure.
That promotion remains subject to the existing contracts' maintainer approval
and official-source safeguards.

## Ingestion retries

Each Graphiti episode write has a bounded service-level retry around the
provider client's own retry loop. Transient 429, 5xx, timeout, connection, and
empty-response failures use exponential backoff; authentication, permission,
malformed-request, and refusal errors are recorded as skipped chunks after the
retry budget is exhausted (or immediately when they are classified as
non-retryable). Configure the policy with
`GRAPHITI_INGEST_MAX_RETRIES`, `GRAPHITI_INGEST_RETRY_BASE_SECONDS`, and
`GRAPHITI_INGEST_RETRY_MAX_SECONDS`.

## Chunking and upload architecture

The TypeScript API should upload the original file to MinIO, persist the OCR
text and document metadata, then submit one document to this service with the
`X-Agency-Code` header. This service is the chunking boundary: Chonkie's
`SentenceChunker` preserves sentence boundaries, adds configured overlap, and
returns source offsets and token counts that are included in each episode's
provenance metadata.

Do not send one HTTP request per chunk. A durable worker/outbox should retry the
single document request and update ingestion status, while this service writes
the resulting episodes sequentially so Graphiti can use recent graph context
for entity resolution.
