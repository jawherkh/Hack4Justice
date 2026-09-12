# @hack4justice/auth

[Better Auth](https://better-auth.com) wired to `@hack4justice/db` (Drizzle, Postgres).

- `server.ts` — `createAuth({ db, baseURL, secret, trustedOrigins })`. Email + password enabled, cookie session cache, UUID ids. Mounted by the API under `/api/auth/*`.
- `client.ts` — `createClient({ baseURL })` returns a React Better Auth client (`signIn`, `signUp`, `signOut`, `useSession`, ...).

## Schema

Auth tables live in `packages/db/src/schema/auth.ts`, generated from `auth.config.ts`:

```bash
pnpm --filter @hack4justice/auth auth:generate   # refresh schema after changing plugins/options
pnpm --filter @hack4justice/db db:generate       # write the SQL migration
pnpm --filter @hack4justice/db db:migrate
```

## Env (root `.env`)

```
BETTER_AUTH_SECRET=   # openssl rand -base64 32
BETTER_AUTH_URL=http://localhost:3001
```
