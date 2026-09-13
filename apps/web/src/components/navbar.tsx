import { Link, useNavigate, useRouteContext, useRouter } from '@tanstack/react-router'
import { Button } from '@hack4justice/ui/components/button'
import { LanguageSwitcher } from '#/components/language-switcher'
import { MobileNav } from '#/components/mobile-nav'
import { NotificationsPopover } from '#/components/notifications/notifications-popover'
import { ThemeToggle } from '#/components/theme-toggle'
import { toLocaleParam, useI18n } from '#/i18n'
import { signOut } from '#/lib/auth'

const navLinkClass =
  'text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:text-foreground data-[status=active]:font-medium'

export function Navbar() {
  const { locale, t } = useI18n()
  const params = { locale: toLocaleParam(locale) }
  const { session } = useRouteContext({ from: '/{-$locale}' })

  return (
    <header className="border-b">
      <nav className="mx-auto flex h-14 w-full max-w-5xl items-center gap-6 px-4">
        <Link to="/{-$locale}" params={params} className="font-semibold tracking-tight">
          Hack4Justice
        </Link>

        <ul className="hidden items-center gap-4 md:flex">
          {session ? (
            <>
              <li>
                <Link to="/{-$locale}/projects" params={params} className={navLinkClass}>
                  {t('nav.projects')}
                </Link>
              </li>
              <li>
                <Link to="/{-$locale}/uploads" params={params} className={navLinkClass}>
                  {t('nav.uploads')}
                </Link>
              </li>
            </>
          ) : (
            <li>
              <Link to="/{-$locale}" params={params} activeOptions={{ exact: true }} className={navLinkClass}>
                {t('nav.home')}
              </Link>
            </li>
          )}
          <li>
            <Link to="/{-$locale}/about" params={params} className={navLinkClass}>
              {t('nav.about')}
            </Link>
          </li>
        </ul>

        <div className="ms-auto hidden items-center gap-2 md:flex">
          {session ? <NotificationsPopover /> : null}
          <ThemeToggle />
          <LanguageSwitcher />
          <SessionActions />
        </div>
        <div className="ms-auto flex items-center gap-1 md:hidden">
          {session ? <NotificationsPopover /> : null}
          <MobileNav session={session} />
        </div>
      </nav>
    </header>
  )
}

function SessionActions() {
  const { locale, t } = useI18n()
  const params = { locale: toLocaleParam(locale) }
  const navigate = useNavigate()
  const router = useRouter()
  // Resolved server-side in the locale layout's beforeLoad, so SSR already knows.
  const { session } = useRouteContext({ from: '/{-$locale}' })

  if (session) {
    return (
      <div className="flex items-center gap-3">
        <Link to="/{-$locale}/account" params={params} className={navLinkClass}>
          {session.user.name}
        </Link>
        <Button
          variant="outline"
          onClick={async () => {
            await signOut()
            await router.invalidate()
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
      <Button render={<Link to="/{-$locale}/register" params={params} />}>{t('nav.register')}</Button>
    </div>
  )
}
