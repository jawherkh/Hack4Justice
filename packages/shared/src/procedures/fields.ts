/**
 * Typed fields for `data` / `authentication` / `action` requirements. The
 * source catalog does not enumerate exact fields, so these are the practical
 * minimum an agent would ask for. Labels live in the web app's i18n under
 * `procedure.field.<REQUIREMENT_ID>.<key>`; every requirement also accepts a
 * free-text `details` entry for anything not covered.
 */
export type FieldType = "text" | "number" | "date" | "month" | "textarea";

export interface FieldDef {
  key: string;
  type: FieldType;
  required: boolean;
  /** Regex source the value must fully match (applied after trimming). */
  pattern?: string;
  /** Example shown as placeholder. */
  example?: string;
  /** Upper-cases the value before validating (identifiers). */
  uppercase?: boolean;
}

/** Tunisian fiscal identifier: 7 digits, control letter, then category / tax regime / establishment. */
export const FISCAL_ID_PATTERN = "^[0-9]{7}[A-Z]/[A-Z]/[A-Z]/[0-9]{3}$";
/** National identity card number. */
export const CIN_PATTERN = "^[0-9]{8}$";
/** RNE unique identifier as printed on extracts, e.g. B-123456-2021 or 1234567A. */
export const RNE_ID_PATTERN = "^([A-Z]-[0-9]{4,8}-[0-9]{4}|[0-9]{7}[A-Z])$";

export const REQUIREMENT_FIELDS: Record<string, FieldDef[]> = {
  MANAGER_BENEFICIARY_DATA: [
    { key: "managerName", type: "text", required: true, example: "Aziz Ben Salah" },
    { key: "managerCin", type: "text", required: true, pattern: CIN_PATTERN, example: "01234567" },
    { key: "managerAddress", type: "text", required: true },
    {
      key: "beneficialOwners",
      type: "textarea",
      required: true,
      example: "Aziz Ben Salah, CIN 01234567, 60 %",
    },
  ],
  FISCAL_IDENTIFIER: [
    {
      key: "fiscalId",
      type: "text",
      required: true,
      pattern: FISCAL_ID_PATTERN,
      example: "1234567A/A/M/000",
      uppercase: true,
    },
    { key: "issuedAt", type: "date", required: false },
  ],
  RNE_OR_RC_INFORMATION: [
    {
      key: "rneId",
      type: "text",
      required: true,
      pattern: RNE_ID_PATTERN,
      example: "B-123456-2021",
      uppercase: true,
    },
    { key: "rcNumber", type: "text", required: false, example: "B123452021" },
    { key: "registry", type: "text", required: false, example: "Tribunal de première instance de Tunis" },
  ],
  MONTHLY_TAX_DECLARATION_DATA: [
    { key: "period", type: "month", required: true, example: "2026-08" },
    { key: "turnover", type: "number", required: true, example: "12500.000" },
    { key: "vatCollected", type: "number", required: true },
    { key: "vatDeductible", type: "number", required: true },
    { key: "withholdings", type: "number", required: false },
  ],
  TAXPAYER_IDENTIFIER: [{ key: "identifier", type: "text", required: true, uppercase: true }],
  TAXPAYER_ENROLLMENT: [
    { key: "enrolledAt", type: "date", required: false },
    { key: "login", type: "text", required: false },
  ],
  TEJ_ENROLLMENT: [{ key: "enrolledAt", type: "date", required: false }],
  TEJ_LOGIN_CERTIFICATE: [
    { key: "login", type: "text", required: false },
    { key: "certificateExpiresAt", type: "date", required: false },
  ],
  DIGIGO_CERTIFICATE: [
    { key: "holder", type: "text", required: false },
    { key: "expiresAt", type: "date", required: false },
  ],
  QUALIFIED_TUNTRUST_SIGNATURE: [
    { key: "holder", type: "text", required: false },
    { key: "expiresAt", type: "date", required: false },
  ],
  RNE_E_SAFE_ACTIVATION: [{ key: "activatedAt", type: "date", required: false }],
};

export function fieldsFor(requirementId: string): FieldDef[] {
  return REQUIREMENT_FIELDS[requirementId] ?? [];
}

export type FieldError = "required" | "pattern" | "number" | "date" | "month";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const NUMBER = /^-?\d+([.,]\d+)?$/;

/** Normalises (trim, upper-case) and validates a value map against the requirement's fields. */
export function validateFields(
  requirementId: string,
  value: Record<string, string>,
): { value: Record<string, string>; errors: Record<string, FieldError> } {
  const errors: Record<string, FieldError> = {};
  const clean: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    const trimmed = (raw ?? "").trim();
    if (trimmed) clean[key] = trimmed;
  }
  for (const field of fieldsFor(requirementId)) {
    let v = clean[field.key] ?? "";
    if (field.uppercase && v) {
      v = v.toUpperCase();
      clean[field.key] = v;
    }
    if (!v) {
      if (field.required) errors[field.key] = "required";
      continue;
    }
    if (field.pattern && !new RegExp(field.pattern).test(v)) errors[field.key] = "pattern";
    else if (field.type === "number" && !NUMBER.test(v)) errors[field.key] = "number";
    else if (field.type === "date" && !DATE.test(v)) errors[field.key] = "date";
    else if (field.type === "month" && !MONTH.test(v)) errors[field.key] = "month";
  }
  return { value: clean, errors };
}

/** True when every required field is filled and valid: the requirement can count as provided. */
export function fieldsComplete(
  requirementId: string,
  value: Record<string, string> | null | undefined,
): boolean {
  if (fieldsFor(requirementId).length === 0) return true;
  return Object.keys(validateFields(requirementId, value ?? {}).errors).length === 0;
}
