import { z } from 'zod'
import {
  AccountType,
  COMPANY_NAME_MAX_LENGTH,
  PHONE_PATTERN,
  PROFILE_NAME_MAX_LENGTH,
  TAX_ID_PATTERN,
  normalizePhone,
  normalizeTaxId,
  type AccountType as AccountTypeValue,
  type Locale,
  type ProfileInput,
} from '@hack4justice/shared'
import type { Translate } from '#/i18n'
import type { Profile } from '#/lib/profile'

/** Everything is a string in the form; `''` means "not set" for optional selects. */
export interface ProfileFormValues {
  firstName: string
  lastName: string
  accountType: AccountTypeValue
  preferredLocale: Locale
  governorate: string
  companyName: string
  legalForm: string
  companyStage: string
  taxId: string
  phone: string
  acceptTerms: boolean
}

export type ProfileFieldName = keyof ProfileFormValues

export const ONBOARDING_STEPS = ['about', 'company', 'finish'] as const
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

/** Fields shown, and therefore validated, on each step. */
export const STEP_FIELDS: Record<OnboardingStep, ProfileFieldName[]> = {
  about: ['firstName', 'lastName', 'accountType', 'preferredLocale', 'governorate'],
  company: ['companyName', 'legalForm', 'companyStage', 'taxId'],
  finish: ['phone', 'acceptTerms'],
}

/** What the account page validates: everything except the terms, accepted once at onboarding. */
export const PROFILE_FIELDS: ProfileFieldName[] = [
  ...STEP_FIELDS.about,
  ...STEP_FIELDS.company,
  ...STEP_FIELDS.finish.filter((field) => field !== 'acceptTerms'),
]

/**
 * Per-field zod schemas, attached as `onChange` validators so errors show as
 * the user types and clear as soon as the value is fixed.
 */
export function fieldSchemas(t: Translate) {
  const name = z
    .string()
    .trim()
    .min(1, t('onboarding.validation.required'))
    .max(PROFILE_NAME_MAX_LENGTH, t('onboarding.validation.tooLong', { max: PROFILE_NAME_MAX_LENGTH }))
  return {
    firstName: name,
    lastName: name,
    companyName: z
      .string()
      .trim()
      .max(COMPANY_NAME_MAX_LENGTH, t('onboarding.validation.tooLong', { max: COMPANY_NAME_MAX_LENGTH })),
    taxId: z
      .string()
      .refine(
        (v) => v.trim() === '' || TAX_ID_PATTERN.test(normalizeTaxId(v)),
        t('onboarding.validation.taxId'),
      ),
    phone: z
      .string()
      .refine(
        (v) => v.trim() === '' || PHONE_PATTERN.test(normalizePhone(v)),
        t('onboarding.validation.phone'),
      ),
    acceptTerms: z.literal(true, t('onboarding.validation.terms')),
  }
}

/**
 * Company name depends on the account type, so it is a function rather than a
 * schema. Returns `{ message }` like a zod issue, which is what `FieldError` renders.
 */
export function companyNameError(
  value: string,
  accountType: AccountTypeValue,
  t: Translate,
): { message: string } | undefined {
  if (accountType === AccountType.BUSINESS && value.trim() === '') {
    return { message: t('onboarding.validation.companyRequired') }
  }
  const result = fieldSchemas(t).companyName.safeParse(value)
  return result.success ? undefined : result.error.issues[0]
}

export function emptyValues(locale: Locale): ProfileFormValues {
  return {
    firstName: '',
    lastName: '',
    accountType: AccountType.BUSINESS,
    preferredLocale: locale,
    governorate: '',
    companyName: '',
    legalForm: '',
    companyStage: '',
    taxId: '',
    phone: '',
    acceptTerms: false,
  }
}

/** Best-effort split of the Better Auth display name for prefilling. */
export function splitName(name: string): { firstName: string; lastName: string } {
  const [firstName = '', ...rest] = name.trim().split(/\s+/)
  return { firstName, lastName: rest.join(' ') }
}

export function valuesFromProfile(profile: Profile): ProfileFormValues {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    accountType: profile.accountType,
    preferredLocale: profile.preferredLocale,
    governorate: profile.governorate ?? '',
    companyName: profile.companyName ?? '',
    legalForm: profile.legalForm ?? '',
    companyStage: profile.companyStage ?? '',
    taxId: profile.taxId ?? '',
    phone: profile.phone ?? '',
    acceptTerms: true,
  }
}

/** Form strings to the API payload: blanks dropped, tax id and phone normalized. */
export function toProfileInput(values: ProfileFormValues): ProfileInput {
  const optional = <T extends string>(value: string) =>
    value.trim() !== '' ? (value.trim() as T) : undefined
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    accountType: values.accountType,
    preferredLocale: values.preferredLocale,
    governorate: optional<ProfileInput['governorate'] & string>(values.governorate),
    companyName: optional(values.companyName),
    legalForm: optional<ProfileInput['legalForm'] & string>(values.legalForm),
    companyStage: optional<ProfileInput['companyStage'] & string>(values.companyStage),
    taxId: values.taxId.trim() ? normalizeTaxId(values.taxId) : undefined,
    phone: values.phone.trim() ? normalizePhone(values.phone) : undefined,
    acceptTerms: values.acceptTerms,
  }
}
