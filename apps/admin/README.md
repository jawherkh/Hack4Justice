# admin

Back-office for staff (TanStack Start, port 3002). Login only, no self-registration.

```bash
pnpm --filter @hack4justice/db db:seed     # creates the first superadmin from SEED_SUPERADMIN_* in .env
pnpm --filter @hack4justice/admin dev
```

Staff accounts live in their own Better Auth instance (`packages/auth/src/admin`, tables `admin_*`,
routes under `/api/admin/auth`) and never mix with end users. Roles, least to most privileged:

| Role         | Can                                                   |
| ------------ | ----------------------------------------------------- |
| `support`    | read everything                                       |
| `admin`      | + review submissions (under review / accept / reject) |
| `superadmin` | + manage staff accounts and roles                     |

The staff API is `apps/api/src/modules/backoffice` under `/api/admin/*`; the API must allow the
panel's origin (`ADMIN_ORIGIN`) and should get its own `ADMIN_AUTH_SECRET` in production.
