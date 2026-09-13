import { SubmissionStatus } from "@hack4justice/shared";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { id, timestamps } from "./columns";
import { project, submissionStatus } from "./projects";

/** What the checklist looked like when the user submitted: kept for the record even if items change later. */
export interface SubmissionSnapshot {
  serviceId: string;
  requirements: {
    requirementId: string;
    status: string;
    upload: { id: string; filename: string } | null;
    value: Record<string, string> | null;
    note: string | null;
  }[];
}

/**
 * One official submission of a project, recorded by the user after acting on
 * the agency channel (the app never submits itself). A project can have
 * several over time, e.g. after a rejection.
 */
export const submission = pgTable(
  "submission",
  {
    ...id,
    projectId: uuid()
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    /** Human-readable reference shown to the user, e.g. H4J-20260913-A1B2C3. */
    reference: text().notNull(),
    serviceId: text().notNull(),
    status: submissionStatus().notNull().default(SubmissionStatus.SUBMITTED),
    /** Acknowledgement / receipt number given by the agency, if any. */
    receipt: text(),
    note: text(),
    snapshot: jsonb().$type<SubmissionSnapshot>().notNull(),
    submittedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    index("submission_project_id_idx").on(table.projectId),
    uniqueIndex("submission_reference_unique").on(table.reference),
  ],
);

export type Submission = typeof submission.$inferSelect;
export type NewSubmission = typeof submission.$inferInsert;
