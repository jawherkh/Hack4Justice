/**
 * User profile collected during onboarding. Lives next to the Better Auth
 * `user` row so auth tables stay untouched by product fields.
 */

export const AccountType = {
  /** A founder or manager acting for their company. */
  BUSINESS: "business",
  /** An accountant, lawyer or consultant acting for clients. */
  PROFESSIONAL: "professional",
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];
export const ACCOUNT_TYPES = Object.values(AccountType) as [AccountType, ...AccountType[]];

/** Tunisian legal forms the RNE / DGI catalog branches on. */
export const LegalForm = {
  EI: "ei",
  SUARL: "suarl",
  SARL: "sarl",
  SA: "sa",
  SAS: "sas",
  OTHER: "other",
} as const;
export type LegalForm = (typeof LegalForm)[keyof typeof LegalForm];
export const LEGAL_FORMS = Object.values(LegalForm) as [LegalForm, ...LegalForm[]];

/** Maps to RNE services: constitution, modification, radiation. */
export const CompanyStage = {
  IDEA: "idea",
  CREATING: "creating",
  REGISTERED: "registered",
  CLOSING: "closing",
} as const;
export type CompanyStage = (typeof CompanyStage)[keyof typeof CompanyStage];
export const COMPANY_STAGES = Object.values(CompanyStage) as [CompanyStage, ...CompanyStage[]];

/** The 24 governorates. Determines the competent tax office and RNE registry. */
export const GOVERNORATES = [
  "ariana",
  "beja",
  "ben_arous",
  "bizerte",
  "gabes",
  "gafsa",
  "jendouba",
  "kairouan",
  "kasserine",
  "kebili",
  "kef",
  "mahdia",
  "manouba",
  "medenine",
  "monastir",
  "nabeul",
  "sfax",
  "sidi_bouzid",
  "siliana",
  "sousse",
  "tataouine",
  "tozeur",
  "tunis",
  "zaghouan",
] as const;
export type Governorate = (typeof GOVERNORATES)[number];

export const PROFILE_NAME_MAX_LENGTH = 60;
export const COMPANY_NAME_MAX_LENGTH = 120;

/** Matricule fiscal: 7 digits + control letter, optionally `/X/X/000` (VAT code, category, establishment). */
export const TAX_ID_PATTERN = /^[0-9]{7}[A-Z](?:\/[A-Z]\/[A-Z]\/[0-9]{3})?$/;
/** Tunisian numbers: 8 digits, optional +216 prefix. */
export const PHONE_PATTERN = /^(?:\+216)?[0-9]{8}$/;

/** Uppercase, no spaces: what `TAX_ID_PATTERN` expects. */
export function normalizeTaxId(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/** Strips spaces, dots and dashes: what `PHONE_PATTERN` expects. */
export function normalizePhone(value: string): string {
  return value.replace(/[\s.-]+/g, "");
}

export function isAccountType(value: unknown): value is AccountType {
  return typeof value === "string" && (ACCOUNT_TYPES as readonly string[]).includes(value);
}
