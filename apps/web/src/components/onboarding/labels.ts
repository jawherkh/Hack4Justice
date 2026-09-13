import { AccountType, CompanyStage, LegalForm, type Governorate, type Locale } from '@hack4justice/shared'
import type { MessageKey } from '#/i18n'

export const ACCOUNT_TYPE_LABEL: Record<AccountType, { title: MessageKey; hint: MessageKey }> = {
  [AccountType.BUSINESS]: {
    title: 'onboarding.accountType.business',
    hint: 'onboarding.accountType.businessHint',
  },
  [AccountType.PROFESSIONAL]: {
    title: 'onboarding.accountType.professional',
    hint: 'onboarding.accountType.professionalHint',
  },
}

export const LEGAL_FORM_LABEL: Record<LegalForm, MessageKey> = {
  [LegalForm.EI]: 'onboarding.legalForm.ei',
  [LegalForm.SUARL]: 'onboarding.legalForm.suarl',
  [LegalForm.SARL]: 'onboarding.legalForm.sarl',
  [LegalForm.SA]: 'onboarding.legalForm.sa',
  [LegalForm.SAS]: 'onboarding.legalForm.sas',
  [LegalForm.OTHER]: 'onboarding.legalForm.other',
}

export const COMPANY_STAGE_LABEL: Record<CompanyStage, MessageKey> = {
  [CompanyStage.IDEA]: 'onboarding.companyStage.idea',
  [CompanyStage.CREATING]: 'onboarding.companyStage.creating',
  [CompanyStage.REGISTERED]: 'onboarding.companyStage.registered',
  [CompanyStage.CLOSING]: 'onboarding.companyStage.closing',
}

export const LOCALE_LABEL: Record<Locale, MessageKey> = {
  fr: 'onboarding.locale.fr',
  en: 'onboarding.locale.en',
  ar: 'onboarding.locale.ar',
}

/** Governorate names are keyed by their id: `onboarding.governorate.<id>`. */
export function governorateLabel(id: Governorate): MessageKey {
  return `onboarding.governorate.${id}` as MessageKey
}
