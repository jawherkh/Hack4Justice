import { z } from "zod";

import { SUPPORTED_LOCALES } from "../constants/locale";
import {
  ACCOUNT_TYPES,
  AccountType,
  COMPANY_NAME_MAX_LENGTH,
  COMPANY_STAGES,
  GOVERNORATES,
  LEGAL_FORMS,
  PHONE_PATTERN,
  PROFILE_NAME_MAX_LENGTH,
  TAX_ID_PATTERN,
  normalizePhone,
  normalizeTaxId,
} from "../constants/profile";

export const profileNameSchema = z.string().trim().min(1).max(PROFILE_NAME_MAX_LENGTH);

export const taxIdSchema = z.string().transform(normalizeTaxId).pipe(z.string().regex(TAX_ID_PATTERN));

export const phoneSchema = z.string().transform(normalizePhone).pipe(z.string().regex(PHONE_PATTERN));

/**
 * Whole profile as sent by the onboarding wizard or the account page.
 * Company fields are required for businesses, ignored for individuals.
 */
export const profileInputSchema = z
  .object({
    firstName: profileNameSchema,
    lastName: profileNameSchema,
    accountType: z.enum(ACCOUNT_TYPES),
    preferredLocale: z.enum(SUPPORTED_LOCALES),
    companyName: z.string().trim().max(COMPANY_NAME_MAX_LENGTH).optional(),
    legalForm: z.enum(LEGAL_FORMS).optional(),
    companyStage: z.enum(COMPANY_STAGES).optional(),
    governorate: z.enum(GOVERNORATES).optional(),
    taxId: taxIdSchema.optional(),
    phone: phoneSchema.optional(),
    acceptTerms: z.boolean(),
  })
  .refine((value) => value.accountType !== AccountType.BUSINESS || Boolean(value.companyName), {
    path: ["companyName"],
    message: "company_name_required",
  })
  .refine((value) => value.acceptTerms, { path: ["acceptTerms"], message: "terms_not_accepted" });

export type ProfileInput = z.infer<typeof profileInputSchema>;
