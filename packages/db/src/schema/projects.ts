import { PROJECT_DESTINATIONS } from "@hack4justice/shared";
import { index, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { id, timestamps } from "./columns";

export const projectDestination = pgEnum("project_destination", PROJECT_DESTINATIONS);

/**
 * A project groups everything a user prepares for one administrative
 * procedure at a given agency (RNE or DGI): documents, facts, submissions.
 */
export const project = pgTable(
  "project",
  {
    ...id,
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text(),
    destination: projectDestination().notNull(),
    ...timestamps,
  },
  (table) => [index("project_user_id_idx").on(table.userId)],
);

export type Project = typeof project.$inferSelect;
export type NewProject = typeof project.$inferInsert;
