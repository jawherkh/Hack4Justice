import type { Locale } from '#/i18n'

const INTL_LOCALES: Record<Locale, string> = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-TN' }

export function formatBytes(bytes: number, locale: Locale): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return new Intl.NumberFormat(INTL_LOCALES[locale], {
    style: 'unit',
    unit: units[unit],
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value)
}

export function formatDate(value: string | Date, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )
}
