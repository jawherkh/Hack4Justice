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

Use Bun 1.4.2 or newer. Set `DATABASE_URL` to opt into PostgreSQL storage;
without it the existing in-memory preview remains available. Storage setup is
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
downloadable as text. OCR, workflow delivery and live event streaming remain
separate integrations.

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

## Document workspaces

Generated documents are prepared in a container that can reach one directory and nothing
else. Each dossier run gets its own directory on the host, mounted into the container at
`/work`.

The container runs as a non-root user with every Linux capability dropped, no privilege
escalation, no network access, a read-only image filesystem, and limits on memory, CPU,
process count and wall-clock time. The host's container socket is never mounted, and no
host path other than the run's own directory is exposed, so one run cannot read another
dossier's files or reach the host.

Paths supplied by callers are resolved against the run directory and refused if they land
outside it. Every component of a path is checked, not only the last, so a parent directory
swapped for a link cannot redirect a read or a write, and on Linux the opened descriptor is
confirmed to point inside the directory before any content moves. Anything that is not a
plain file is refused before it is opened, so a pipe left where an artifact is expected
cannot make the reader wait for a writer that never arrives.

Reads and writes are capped per file and per workspace, and command output beyond its limit
is dropped and flagged rather than buffered without bound.

The per-file limit is enforced by the kernel. The workspace total is enforced by measuring
the directory while a run executes and stopping a run that passes it, which bounds disk use
but is not a precise quota: a run writing at full disk speed can overshoot by whatever it
manages between two measurements. Put the workspace on a filesystem created with a fixed
size when untrusted runs share a disk with anything that matters.

Cleanup and retention:

- A container is removed as soon as its command finishes, and a run that passes the time
  limit is force-removed, so nothing is left behind.
- A run directory outlives its container on purpose, so artifacts can still be exported
  after the command ends. Removing it is an explicit call.
- Remove a run directory once its artifacts are stored as dossier documents, or when the
  dossier closes. Nothing expires on its own.

The live isolation checks run against a local container daemon only when
`SANDBOX_DOCKER_TESTS=1` is set; the rest of the suite runs without one.
## Uploads (PDF upload + text extraction)

Requires the local stack: `docker compose up -d db minio minio-init tika`.
Files go to S3-compatible storage (MinIO locally, `@hack4justice/storage`) and
text is extracted by Apache Tika with Tesseract OCR for scanned pages.

All routes need a Better Auth session cookie.

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/v1/uploads` | multipart `file` (PDF, max 25 MB), optional `languages` (Tesseract codes, default `fra+eng`). Returns the upload with extracted `text`. |
| `GET` | `/api/v1/uploads` | List own uploads. |
| `GET` | `/api/v1/uploads/:id` | Own upload plus a 15-minute presigned `downloadUrl`. |
| `DELETE` | `/api/v1/uploads/:id` | Remove from storage and database. |

```bash
curl -b cookies.txt -F file=@dossier.pdf -F languages=fra+ara http://localhost:3001/api/v1/uploads
```

Extraction runs synchronously in the request today. Move it to a queue once
files get large or volume grows. (`/api/v1/documents/*` belongs to the access
module and refers to dossier evidence, a different concept.)

## Errors and localisation

Every error response has one shape, produced by the global handler in `src/errors.ts`:

```json
{ "error": { "status": 404, "code": "upload_not_found", "message": "Fichier introuvable", "details": {} } }
```

Throw `AppError` (from `@hack4justice/shared`) anywhere in a request:

```ts
throw new AppError({ status: 404, code: "upload_not_found" });
throw new AppError({ status: 413, code: "file_too_large", params: { maxSize: "25 MB" }, details: { size } });
```

`code` doubles as the translation key. Messages live in `src/i18n/messages/{fr,en,ar}.json`;
the language comes from the `locale` cookie set by the web app, then `Accept-Language`,
then French. Unknown codes fall back to a humanised code. Route handlers get `t()` and
`locale` in context via the `i18n` plugin (`src/i18n/plugin.ts`).

Logging uses `@hack4justice/logger` (pino). One line per request; set `LOG_LEVEL`
(`info` default, `debug` for local work). Pretty output when `NODE_ENV=development`.
