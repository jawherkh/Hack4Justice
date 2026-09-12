# Business API

Run from the repository root with `pnpm --filter @hack4justice/api dev`.
The API exposes `/health` and versioned routes under `/api/v1`.

## Recoverable review processing

Run the worker under Node.js 22 or newer; the HTTP API continues to use Bun.
The worker and API must share `DATABASE_URL`. Rerun `db:init` after upgrading
to create the command queue and event tables while preserving existing data.

From the repository root, start the development Temporal service:

```sh
docker compose -f apps/api/compose.workflow.yaml up -d
pnpm --filter @hack4justice/api worker
```

The worker reads environment variables from its process. To load the root
environment file explicitly, run `node --env-file=../../.env --import tsx
src/lifecycle/worker.ts` from `apps/api`. `TEMPORAL_ADDRESS` defaults to
`127.0.0.1:7233`, `TEMPORAL_NAMESPACE` to `default`, and `TEMPORAL_TASK_QUEUE`
to `dossier-lifecycle`. The local Temporal UI is at `http://localhost:8233`.
The compose service is a development server with a persistent volume, not a
production Temporal deployment. Keep its ports on loopback.

`POST /api/v1/dossiers/:dossierId/commands` accepts a versioned request and
returns 202 after the command is committed to PostgreSQL. A separate relay
delivers its reference to the dossier's workflow. Requests remain queued when
Temporal or the worker is unavailable. Duplicate delivery is harmless: command
results, decisions, dossier changes and projection events commit together.
An activity retry after a successful commit returns the stored result.

Example explicit submission for the synthetic platform review:

```json
{"type":"submission_requested","expectedVersion":1,"idempotencyKey":"submit-example","confirmed":true}
```

Read `GET /api/v1/dossiers/:dossierId/commands/:commandId` until its status is
`completed` or `rejected`. A rejected result includes an error code, such as
`version_conflict` or `invalid_transition`. Refresh the dossier before making
a new request. Retrying the same actor/key/payload returns the original
acknowledgement; a changed payload returns 409. Officer decisions use the same
command endpoint, with a `nodeId` identifying a decision or human-review node:

```json
{"type":"decision_recorded","expectedVersion":2,"idempotencyKey":"review-example","nodeId":"<review-node-id>","decision":{"action":"request_modification","reason":"The uploaded page is unreadable.","targetNodeIds":["<document-node-id>"],"evidenceIds":["<document-id>"]}}
```

Only an officer for the dossier's agency can record a decision. Modification
requests require target nodes. Business members upload corrections, then send
`resubmission_requested` with explicit confirmation and the current version.
Acceptance/refusal closes the dossier; cancellation preserves previous
decisions. Closed/cancelled dossiers reject new writes. A request for review
alone never changes agency acceptance. Submission here starts the platform's
synthetic review; it does not send a government submission or create a receipt.

Uploads and confirmed-fact changes enqueue evidence-change references in the
same transaction as the stored evidence. Their immediate responses contain the
stored version; the worker may advance it again, so refresh before the next
command. No original file bytes enter workflow history. OCR, model calls, graph
queries and sandbox execution must be separate activities; the worker currently
registers only command preparation and projection persistence activities.

Trusted service callers can enqueue `prerequisite_changed` through the repository
with an obligation ID, observation version, source/rule references, expiry and
covered actions. Public business endpoints reject that command type. Unknown,
disputed or expired observations require review; unfulfilled obligations block
only their covered submission actions. A newer fulfilled observation clears
that wait. Stale observations cannot replace newer ones. The upstream rule/status
service owns applicability and authoritative verification; missing uploads are
never interpreted as an unfulfilled obligation.

`GET /api/v1/dossiers/:dossierId/lifecycle-events?after=0` returns up to 100
events in aggregate-version order, scoped to the same company/agency access.
Use the last returned version as the next cursor. Each event has a stable ID
and the resulting status; fetch dossier detail for its documents and decisions.
The initial snapshot is the baseline for repositories created before event
tracking was installed. This polling endpoint is separate from live SSE delivery.

Workflow signals only enqueue references; the main loop serializes transitions.
The commit activity rechecks the dossier version so an intervening upload cannot
be overwritten. Workflows remain waiting after a business terminal state to
consume delayed deliveries safely; new commands are still rejected by the stored
state. They continue into a new run after 100 processed references when the queue
is empty, limiting history growth. Use the cancellation command to cancel a
dossier; force-terminating Temporal is an operational action, not a business decision.

Offline regression tests run with `bun test src/lifecycle/state.test.ts`.

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
an idempotent command boundary. A Temporal worker executes the queued requests
and writes their results and versioned projection events back to PostgreSQL.
A command acknowledgement means queued, and does not imply agency acceptance.
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
