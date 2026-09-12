import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '@hack4justice/ui/components/button'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import { LanguageSwitcher } from '#/components/language-switcher'
import { toLocaleParam, useI18n } from '#/i18n'
import { signOut, useSession } from '#/lib/auth'

const navLinkClass =
  'text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:text-foreground data-[status=active]:font-medium'

export function Navbar() {
  const { locale, t } = useI18n()
  const params = { locale: toLocaleParam(locale) }

  return (
    <header className="border-b">
      <nav className="mx-auto flex h-14 w-full max-w-5xl items-center gap-6 px-4">
        <Link to="/{-$locale}" params={params} className="font-semibold tracking-tight">
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
          <SessionActions />
        </div>
      </nav>
    </header>
  )
}

function SessionActions() {
  const { locale, t } = useI18n()
  const params = { locale: toLocaleParam(locale) }
  const navigate = useNavigate()
  const { data: session, isPending } = useSession()

  // Session resolves on the client; keep the slot's width stable meanwhile.
  if (isPending) return <Skeleton className="h-8 w-36" />

  if (session) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{session.user.name}</span>
        <Button
          variant="outline"
          onClick={async () => {
            await signOut()
            await navigate({ to: '/{-$locale}', params })
          }}
        >
          {t('nav.logout')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" render={<Link to="/{-$locale}/login" params={params} />}>
        {t('nav.login')}
      </Button>
      <Button render={<Link to="/{-$locale}/register" params={params} />}>
        {t('nav.register')}
      </Button>
    </div>
  )
}
