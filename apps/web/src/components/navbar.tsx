import { Link } from '@tanstack/react-router'
import { Button } from '@hack4justice/ui/components/button'
import { LanguageSwitcher } from '#/components/language-switcher'
import { toLocaleParam, useI18n } from '#/i18n'

const navLinkClass =
  'text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:text-foreground data-[status=active]:font-medium'

export function Navbar() {
  const { locale, t } = useI18n()
  const params = { locale: toLocaleParam(locale) }

  return (
    <header className="border-b">
      <nav className="mx-auto flex h-14 w-full max-w-5xl items-center gap-6 px-4">
        <Link
          to="/{-$locale}"
          params={params}
          className="font-semibold tracking-tight"
        >
          Hack4Justice
        </Link>

        <ul className="flex items-center gap-4">
          <li>
            <Link
              to="/{-$locale}"
              params={params}
              activeOptions={{ exact: true }}
              className={navLinkClass}
            >
              {t('nav.home')}
            </Link>
          </li>
          <li>
            <Link to="/{-$locale}/about" params={params} className={navLinkClass}>
              {t('nav.about')}
            </Link>
          </li>
        </ul>

        <div className="ms-auto flex items-center gap-4">
          <LanguageSwitcher />
          <Button render={<Link to="/{-$locale}/login" params={params} />}>
            {t('nav.login')}
          </Button>
        </div>
      </nav>
    </header>
  )
}
