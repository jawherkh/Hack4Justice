import { Link } from '@tanstack/react-router'
import { LOCALE_LABELS, SUPPORTED_LOCALES, toLocaleParam, useI18n } from '#/i18n'

export function LanguageSwitcher() {
  const { t } = useI18n()

  return (
    <nav aria-label={t('language.label')} className="flex items-center gap-3">
      {SUPPORTED_LOCALES.map((locale) => (
        <Link
          key={locale}
          to="."
          params={(prev) => ({ ...prev, locale: toLocaleParam(locale) })}
          lang={locale}
          activeOptions={{ exact: true }}
          className="text-sm text-muted-foreground hover:text-foreground aria-[current]:font-semibold aria-[current]:text-foreground"
        >
          {LOCALE_LABELS[locale]}
        </Link>
      ))}
    </nav>
  )
}
