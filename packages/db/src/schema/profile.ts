import {
  ACCOUNT_TYPES,
  COMPANY_STAGES,
  GOVERNORATES,
  LEGAL_FORMS,
  SUPPORTED_LOCALES,
} from "@hack4justice/shared";
import { boolean, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps } from "./columns";

export const accountType = pgEnum("account_type", ACCOUNT_TYPES);
export const legalForm = pgEnum("legal_form", LEGAL_FORMS);
export const companyStage = pgEnum("company_stage", COMPANY_STAGES);
export const governorate = pgEnum("governorate", GOVERNORATES);
export const preferredLocale = pgEnum("preferred_locale", SUPPORTED_LOCALES);

/**
 * One row per user, created when onboarding completes. Kept apart from the
 * Better Auth `user` table so auth plugin regenerations never touch it.
 */
export const userProfile = pgTable("user_profile", {
  userId: uuid()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  firstName: text().notNull(),
  lastName: text().notNull(),
  accountType: accountType().notNull(),
  preferredLocale: preferredLocale().notNull(),
  governorate: governorate(),
  phone: text(),
  /**
   * Whether the user asked to be told on their phone when a procedure is blocked. Off
   * until they turn it on: a phone number given for a dossier is not consent to be
   * messaged on it.
   */
  urgentAlerts: boolean().notNull().default(false),
  /** Company block. Optional for professionals, who may act for many clients. */
  companyName: text(),
  legalForm: legalForm(),
  companyStage: companyStage(),
  /** Matricule fiscal, normalized (uppercase, no spaces). */
  taxId: text(),
  acceptedTermsAt: timestamp({ withTimezone: true }).notNull(),
  onboardedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
});

export type UserProfile = typeof userProfile.$inferSelect;
export type NewUserProfile = typeof userProfile.$inferInsert;
