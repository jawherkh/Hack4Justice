import { Link } from '@tanstack/react-router'
import { Check, Languages } from 'lucide-react'
import { Button } from '@hack4justice/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@hack4justice/ui/components/dropdown-menu'
import { LOCALE_LABELS, SUPPORTED_LOCALES, toLocaleParam, useI18n } from '#/i18n'

/** Language menu. Each entry links to the current page in that locale. */
export function LanguageSwitcher() {
  const { locale: current, t } = useI18n()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" aria-label={t('language.label')} />}>
        <Languages data-icon="inline-start" />
        {LOCALE_LABELS[current]}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {SUPPORTED_LOCALES.map((locale) => (
            <DropdownMenuItem
              key={locale}
              lang={locale}
              render={<Link to="." params={(prev) => ({ ...prev, locale: toLocaleParam(locale) })} />}
            >
              {LOCALE_LABELS[locale]}
              {locale === current ? <Check className="ms-auto" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
