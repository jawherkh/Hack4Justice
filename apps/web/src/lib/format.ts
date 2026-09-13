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

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['week', 7 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
]

/** "3 days ago", "il y a 2 heures", "الآن". `now` is injectable for tests. */
export function formatRelative(value: string | Date, locale: Locale, now: number = Date.now()): string {
  const diff = new Date(value).getTime() - now
  const rtf = new Intl.RelativeTimeFormat(INTL_LOCALES[locale], { numeric: 'auto' })
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit)
  }
  return rtf.format(0, 'second')
}

/** Calendar date only, e.g. "30 April 2026". Accepts `YYYY-MM-DD` without shifting by timezone. */
export function formatDay(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  )
}

/** "April 2026", for a fiscal period identified by year and 1-based month. */
export function formatMonth(year: number, month: number, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
}
