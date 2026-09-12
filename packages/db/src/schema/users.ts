import { index, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

import { id, timestamps } from "./columns";

export const userRole = pgEnum("user_role", ["admin", "officer", "member"]);

export const users = pgTable(
  "users",
  {
    ...id,
    email: text().notNull().unique(),
    name: text().notNull(),
    role: userRole().notNull().default("member"),
    ...timestamps,
  },
  (table) => [index("users_role_idx").on(table.role)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
