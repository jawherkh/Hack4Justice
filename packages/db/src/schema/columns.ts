import { timestamp, uuid } from "drizzle-orm/pg-core";

/** Reusable column sets. Spread into a table definition. */
export const id = {
  id: uuid().primaryKey().defaultRandom(),
};

export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
