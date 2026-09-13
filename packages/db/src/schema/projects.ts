import {
  PROJECT_DESTINATIONS,
  REQUIREMENT_STATUSES,
  RequirementStatus,
  SUBMISSION_STATUSES,
} from "@hack4justice/shared";
import { index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { id, timestamps } from "./columns";
import { upload } from "./uploads";

export const projectDestination = pgEnum("project_destination", PROJECT_DESTINATIONS);
export const requirementStatus = pgEnum("requirement_status", REQUIREMENT_STATUSES);
export const submissionStatus = pgEnum("submission_status", SUBMISSION_STATUSES);

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
    /** Service picked during onboarding (shared procedures catalog id). Null until onboarded. */
    serviceId: text(),
    onboardedAt: timestamp({ withTimezone: true }),
    /** Declared by the user after using the official channel; the app never submits itself. */
    submissionStatus: submissionStatus(),
    ...timestamps,
  },
  (table) => [index("project_user_id_idx").on(table.userId)],
);

/** One row per catalog requirement of the project's service, seeded at onboarding. */
export const projectRequirement = pgTable(
  "project_requirement",
  {
    ...id,
    projectId: uuid()
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    requirementId: text().notNull(),
    status: requirementStatus().notNull().default(RequirementStatus.MISSING),
    /** Free-form data for `data` requirements, or confirmation details for actions. */
    value: jsonb().$type<Record<string, string>>(),
    /** Evidence for `document` requirements. */
    uploadId: uuid().references(() => upload.id, { onDelete: "set null" }),
    note: text(),
    ...timestamps,
  },
  (table) => [
    index("project_requirement_project_id_idx").on(table.projectId),
    uniqueIndex("project_requirement_unique").on(table.projectId, table.requirementId),
  ],
);

export type Project = typeof project.$inferSelect;
export type NewProject = typeof project.$inferInsert;
export type ProjectRequirement = typeof projectRequirement.$inferSelect;
export type NewProjectRequirement = typeof projectRequirement.$inferInsert;
