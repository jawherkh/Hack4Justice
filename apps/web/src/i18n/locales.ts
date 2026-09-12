export const SUPPORTED_LOCALES = ['en', 'fr', 'ar'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  ar: 'العربية',
}

const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(['ar'])

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  )
}

export function getDirection(locale: Locale): 'ltr' | 'rtl' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr'
}

/**
 * Maps a route param to a locale. Missing param means the un-prefixed
 * default locale URL (e.g. `/` instead of `/en`).
 */
export function resolveLocale(param: string | undefined): Locale {
  return param === undefined ? DEFAULT_LOCALE : isLocale(param) ? param : DEFAULT_LOCALE
}

/**
 * Value to put in the `{-$locale}` path param for a given locale.
 * The default locale is served without a prefix.
 */
export function toLocaleParam(locale: Locale): Locale | undefined {
  return locale === DEFAULT_LOCALE ? undefined : locale
}
