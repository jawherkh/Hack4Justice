import { UPLOAD_STATUSES, UploadStatus } from "@hack4justice/shared";
import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { id, timestamps } from "./columns";

export const uploadStatus = pgEnum("upload_status", UPLOAD_STATUSES);

/** A file uploaded by a user to object storage, plus the text extracted from it. */
export const upload = pgTable(
  "upload",
  {
    ...id,
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Object key in the S3 bucket. */
    storageKey: text().notNull().unique(),
    filename: text().notNull(),
    contentType: text().notNull(),
    size: integer().notNull(),
    status: uploadStatus().notNull().default(UploadStatus.UPLOADED),
    /** Extracted plain text (OCR for scanned pages). */
    text: text(),
    pageCount: integer(),
    error: text(),
    extractedAt: timestamp({ withTimezone: true }),
    /** Project this file belongs to, when uploaded from a project workspace. */
    projectId: uuid(),
    ...timestamps,
  },
  (table) => [
    index("upload_user_id_idx").on(table.userId),
    index("upload_project_id_idx").on(table.projectId),
  ],
);

export type Upload = typeof upload.$inferSelect;
export type NewUpload = typeof upload.$inferInsert;
