import { text, timestamp } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";

/** Reusable column sets. Spread into a table definition. */
/** nanoid primary key (21 chars, URL-safe). Generated app-side so callers can know the id before insert. */
export const id = {
  id: text().primaryKey().$defaultFn(() => nanoid()),
};

export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
