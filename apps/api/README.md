# Business API

Run from the repository root with `pnpm --filter @hack4justice/api dev`.
The API exposes `/health` and versioned routes under `/api/v1`.

The access module provides server-side company membership and agency permission
checks with an injectable identity resolver and resource repository. Business
members can read their own dossiers and edit their evidence. Officers can read
and review their agency's dossiers. Rule maintainers do not automatically gain
access to private company data.

Dependency summaries require company membership, the responsible agency, or an
explicit consumer-agency grant on that dependency. A summary grant never grants
access to raw documents. Separate document grants are limited to a principal,
company, document and expiry time.

## Local preview

Identity integration is disabled by default: scoped endpoints return 503 until
an identity provider is configured. To exercise synthetic users without signup,
enable the local preview in PowerShell:

```powershell
$env:NODE_ENV = 'development'
$env:DEMO_ACCESS_ENABLED = 'true'
pnpm --filter @hack4justice/api dev
```

Demo mode binds the server to `127.0.0.1` and cannot start in production. The
`X-Demo-User` header selects one of these public synthetic identities; it is a
development selector, not authentication:

| Identity | Access |
| --- | --- |
| `demo-member-alpha` | Member of `company-alpha` |
| `demo-member-beta` | Member of `company-beta` |
| `demo-officer-dgi` | DGI officer |
| `demo-officer-rne` | RNE officer |
| `demo-officer-apii` | APII officer |
| `demo-rule-maintainer` | Rule maintenance only |

For example, request `/api/v1/dossiers/dossier-alpha-dgi` with
`X-Demo-User: demo-member-alpha`. Changing the ID to `dossier-beta-dgi` returns
403. The client cannot override server roles with headers or body fields.

Fixtures contain two companies and three agencies. An RNE officer may view
`/api/v1/dependencies/dependency-alpha-dgi`, but cannot read
`/api/v1/documents/document-alpha-dgi` without a separate document grant.
All dependency statuses and records are synthetic.

Read routes cover procedures, dossiers, nested nodes/documents, document
lookup, queues and dependency summaries. Dossier detail includes the source,
requirement, evidence and finding projections needed by the UI. The event
endpoint sends one authorized synthetic SSE snapshot and closes; it is not a
live subscription. Real event delivery must revalidate access on reconnect and
permission changes during a subscription.

The dossier API supports synthetic create/resume, immutable document versions,
replacement uploads, confirmed-fact updates and optimistic version checks.
Evidence and fact changes mark affected findings stale and return the updated
projection. Lifecycle commands are validated, authorized and accepted through
an idempotent command boundary; execution remains owned by the future Temporal
workflow. Command acknowledgements persist when database storage is configured;
they do not execute transitions or imply agency acceptance.
The production identity resolver must verify credentials and load roles and
memberships from server storage on each request.

## Persistent local preview

Use Bun 1.4.2 or newer. The API requires `DATABASE_URL` for PostgreSQL storage
and a private `BETTER_AUTH_SECRET` of at least 32 characters. Storage setup is
explicit and does not use Supabase credentials automatically.

From the repository root, start a disposable database and initialize synthetic
records in PowerShell:

```powershell
docker compose -f apps/api/compose.test.yaml up -d --wait
$env:DATABASE_URL = 'postgres://postgres@127.0.0.1:55439/hack4justice_test'
$env:NODE_ENV = 'development'
$env:DEMO_ACCESS_ENABLED = 'true'
pnpm --filter @hack4justice/api db:init --seed-demo
pnpm --filter @hack4justice/api dev
```

The sample database allows passwordless access on loopback for local testing.
Use a credentialed database connection on a deployed server. Initialization
creates the private `h4j_api` schema and preserves existing data on reruns.
`--seed-demo` fills a new repository only and is refused in production. The
database role needs schema creation permission for setup and owner privileges
to access its tables; public access is disabled.

Dossiers, nodes, sources, facts, findings, document metadata and command retry
records survive API restarts. This alpha adapter stores one transactional JSON
snapshot and locks it for each write, preserving the existing camelCase API and
demo IDs. Competing writes check the current version inside that transaction;
one stale writer receives 409. This serializes all writes and is intended for
small prototype datasets, not high throughput. Node detail reads one snapshot.

Original bytes are stored under generated IDs in `DOCUMENT_STORAGE_DIR`, which
defaults to `.local-data/documents` relative to the API working directory.
Set an absolute path or mount a persistent Docker volume for deployment. Keep
the database and this directory together when backing up or moving the service;
multiple API instances must share the directory. Original metadata is protected
against SQL update/delete, exclusive file creation prevents overwrites, and
downloads verify SHA-256. A failed database commit can leave an unreferenced
file for later cleanup.

## File uploads

`POST /api/v1/dossiers/:dossierId/documents` continues accepting the existing
JSON text payload. With database storage, it also accepts multipart fields:

| Field | Value |
| --- | --- |
| `file` | PDF, PNG or JPEG, nonempty and at most 20 MiB |
| `nodeId` | The dossier's evidence node ID |
| `expectedVersion` | Current dossier revision |
| `requirementIds` | Optional JSON array of requirement IDs belonging to that node |
| `replacesDocumentId` | Optional ID of the latest original being replaced |

For example, from PowerShell with a local PDF:

```powershell
curl.exe -X POST http://localhost:3001/api/v1/dossiers/dossier-alpha-dgi/documents -H 'X-Demo-User: demo-member-alpha' -H 'Idempotency-Key: example-upload-1' -F 'nodeId=node-alpha-dgi-document_evidence' -F 'expectedVersion=1' -F 'file=@sample.pdf;type=application/pdf'
```

The response retains `{ document, dossier, invalidatedFindingIds }`. File
signatures must match their MIME type; this is format screening, not a malware
scan or a guarantee that a document parses. Binary uploads leave `originalText`
empty until a separate extraction step processes them. A replacement creates
a new version and preserves every earlier original; replacing an already
replaced version returns 409.

An optional `Idempotency-Key` header makes upload retries return their original
result without incrementing the revision again. Reusing that key with different
content or metadata returns 409. It is scoped to the dossier and authenticated
actor and works for both JSON and multipart uploads with database storage.

`GET /api/v1/documents/:documentId/content` returns the original bytes as an
attachment after the same company, agency or document-grant checks as metadata
access. It is never a public storage URL. Existing synthetic documents remain
downloadable as text. Document extraction uses the same stored originals;
workflow delivery and live event streaming remain separate integrations.

## Verification

```powershell
$env:TEST_DATABASE_URL = 'postgres://postgres@127.0.0.1:55439/hack4justice_test'
pnpm --filter @hack4justice/api test:storage
pnpm --filter @hack4justice/api check-types
pnpm --filter @hack4justice/api build
```

Storage tests create and remove unique schemas and temporary file directories;
they do not modify the preview's `h4j_api` data. `test:storage` requires an
explicit test database URL. Plain `test` runs the in-memory tests and skips the
database suite when that URL is absent.
## Document extraction

The extraction module uses `deepseek-flash` for scanned pages and structured
field proposals. Native PDF text is read locally with `pdfinfo` and `pdftotext`;
only pages without sufficient usable text are rendered with `pdftoppm` and
sent as images. Native text is sent to the model for classification and field
proposals, but the stored text remains exactly what the local parser returned.
Images are transcribed in their original language without requested translation
or wording changes. Extraction results always require human judgment before
being used as confirmed business facts.

Install the Poppler command-line tools (`poppler-utils` on Debian/Ubuntu) and
make `pdfinfo`, `pdftotext` and `pdftoppm` available on PATH. Verification uses
Bun 1.4.2. Configure `DEEPSEEK_API_KEY` privately; `DEEPSEEK_OCR_MODEL` defaults
to `deepseek-flash`. Requests use the provider's
[JSON output](https://api-docs.deepseek.com/guides/json_mode/) with
[thinking disabled](https://api-docs.deepseek.com/guides/thinking_mode/).
Invalid structured responses are retried once; provider errors and truncated
responses remain visible as missing or uncertain results rather than invented
text. Provider response bodies and credentials are never returned in errors.

Each proposed fact carries its original document checksum/version, page and
verbatim quote. A proposal without a matching quote in the extracted text is
discarded. Dates are parsed only from explicit ISO or day/month/year numeric
forms, and identifiers retain leading zeros. Scores are model estimates,
explicitly labeled `model_self_reported`; native text has no fabricated score.
An `extracted` state means data was obtained, not independently verified.

### Review endpoints

All paths are under `/api/v1` and use the existing identity and company/agency
permissions. Only company members may initiate extraction or submit corrections.
Officers and holders of explicit document grants can read authorized reports.

| Method and path | Behavior |
| --- | --- |
| `POST /documents/:documentId/extractions` | Extract the exact original document version |
| `GET /documents/:documentId/extractions/:extractionId` | Read a report, correction history and effective facts |
| `POST /documents/:documentId/extractions/:extractionId/corrections` | Append a user correction with a reason |
| `POST /dossiers/:dossierId/extraction-comparisons` | Return potential inconsistencies with both evidence references |

Extraction request example:

```json
{"expectedDocumentVersion":1,"idempotencyKey":"extract-example","expectedFields":["company_name","tax_id"]}
```

`expectedFields` identifies the fields the caller wants extracted; it does not
declare legal requirements. Supported fields are `company_name`, `tax_id`,
`registry_id`, `address`, `legal_form`, `document_date` and `headcount`.
Use a new idempotency key to retry a completed uncertain result. Repeating a
key reuses its saved report; changing its requested fields returns 409.

Correction request example:

```json
{"expectedRevision":1,"idempotencyKey":"correct-example","field":"tax_id","page":1,"quote":"Matricule fiscal: 1234567/A/M/000","value":"1234568/A/M/000","reason":"Checked the original image"}
```

Corrections preserve the original page text and model proposals, recording the
server-resolved actor, reason and timestamp in a new report revision. A null
value rejects a proposed field. Effective facts identify user corrections
separately. Consumers must track the report revision when evaluating derived
findings; corrections do not silently update company facts or legal decisions.
Concurrent corrections cannot overwrite a revision. Replaced document versions
remain readable with `stale: true` and cannot be corrected or compared as current.

Comparisons accept `{"extractionIds":["<first-report-id>","<second-report-id>"]}`.
Only current documents in the same dossier can be compared. Differences produce
`potential_inconsistency` entries with each document version, page, quote and
proposal/correction basis. They do not automatically determine which value is
correct, and an empty comparison list is not proof of consistency when fields
are missing.

Reports and correction revisions live under `EXTRACTION_STORAGE_DIR`, defaulting
to `.local-data/extractions` relative to the API working directory. Keep this
private directory on persistent storage. Revisions are published atomically
using filesystem hard links; multiple API instances must share a filesystem
that supports them. Request deduplication is local to one process while an
extraction is running, so separate instances may repeat a provider call before
the first result is saved. At most two distinct extractions run concurrently
per API process.

Extraction uses the PostgreSQL repository and reads the stored PDF/image
originals through `readContent(documentId)`. The injectable in-memory repository
supplies only UTF-8 text originals. Other storage backends can inject an
`OriginalReader`. An unavailable
original produces `state: "missing"`
with `original_unavailable`; metadata or previously extracted text is never
passed off as the original PDF. `ExtractionEngine.extract` is also an injectable
worker entry point; scheduling durable activities is a separate integration.

Limits: 20 MiB per input, 20 PDF pages, bounded subprocess/provider timeouts and
a three-minute API extraction deadline. Native-page selection uses a text
quality heuristic and may miss scanned content under a substantial digital
text layer; review mixed pages against the original. Scan transcription and
document classification remain model proposals.
