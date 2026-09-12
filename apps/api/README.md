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

Read routes cover dossiers, nested nodes/documents, document lookup, queues and
dependency summaries. The event endpoint sends one authorized synthetic SSE
snapshot and closes; it is not a live subscription. Real event delivery must
revalidate access on reconnect and permission changes during a subscription.

Document writes and review decisions enforce access and then return 501. File
persistence and workflow execution are not configured; no successful write is
claimed. The production identity resolver must verify credentials and load roles
and memberships from server storage on each request. The synthetic repository
must be replaced with persistent storage before production use.

Run `pnpm --filter @hack4justice/api test` and
`pnpm --filter @hack4justice/api check-types` for verification.
