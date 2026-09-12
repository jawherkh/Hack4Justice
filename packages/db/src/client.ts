import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

export interface CreateDbOptions {
  /** Max pooled connections. Defaults to 10. */
  max?: number;
}

/**
 * Creates a Drizzle client backed by postgres.js. Works under Bun and Node.
 * Call once per process and share the instance.
 */
export function createDb(connectionString: string, options: CreateDbOptions = {}) {
  const client = postgres(connectionString, {
    max: options.max ?? 10,
    onnotice: () => {},
  });

  return drizzle({ client, schema, casing: "snake_case" });
}

/** Closes the underlying connection pool. Use in tests and graceful shutdown. */
export async function closeDb(db: Database): Promise<void> {
  await db.$client.end();
}
