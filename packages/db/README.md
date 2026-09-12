# @hack4justice/db

Drizzle ORM + Postgres (postgres.js driver). Source-only workspace package.

## Setup

```bash
docker compose up -d db              # local Postgres 17 on :5432
cp .env.example .env                 # repo root, provides DATABASE_URL
pnpm --filter @hack4justice/db db:migrate
```

## Usage

```ts
import { createDb, users } from "@hack4justice/db";
import { eq } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);
const admins = await db.select().from(users).where(eq(users.role, "admin"));
```

Consumers that need query operators (`eq`, `and`, ...) add `drizzle-orm` as their own dependency.

## Schema workflow

- Tables live in `src/schema/*.ts` and are re-exported from `src/schema/index.ts`.
- Columns use `casing: "snake_case"`: write `createdAt` in TypeScript, get `created_at` in SQL.
- `id` and `timestamps` in `src/schema/columns.ts` are shared column sets.

| Script        | What it does                                             |
| ------------- | -------------------------------------------------------- |
| `db:generate` | Diff schema against migrations, write SQL to `drizzle/`  |
| `db:migrate`  | Apply pending migrations                                 |
| `db:push`     | Push schema directly, no migration file (local dev only) |
| `db:check`    | Verify migration folder consistency                      |
| `db:studio`   | Open Drizzle Studio                                      |

Commit generated migrations in `drizzle/`.
