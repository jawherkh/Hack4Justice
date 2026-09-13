import * as React from 'react'
import { Link } from '@tanstack/react-router'
import { Menu } from 'lucide-react'
import { Button } from '@hack4justice/ui/components/button'
import { Separator } from '@hack4justice/ui/components/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@hack4justice/ui/components/sheet'
import { LanguageSwitcher } from '#/components/language-switcher'
import { toLocaleParam, useI18n } from '#/i18n'
import type { SessionData } from '#/lib/session'

const linkClass =
  'rounded-md px-2 py-2 text-base data-[status=active]:bg-accent data-[status=active]:font-medium'

export function MobileNav({ session }: { session: SessionData }) {
  const { locale, t } = useI18n()
  const params = { locale: toLocaleParam(locale) }
  const [open, setOpen] = React.useState(false)
  const close = () => setOpen(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" className="md:hidden" aria-label={t('nav.menu')} />}
      >
        <Menu />
      </SheetTrigger>
      <SheetContent side={locale === 'ar' ? 'left' : 'right'} className="flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle>Hack4Justice</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1">
          {session ? null : (
            <Link
              to="/{-$locale}"
              params={params}
              activeOptions={{ exact: true }}
              className={linkClass}
              onClick={close}
            >
              {t('nav.home')}
            </Link>
          )}
          <Link to="/{-$locale}/about" params={params} className={linkClass} onClick={close}>
            {t('nav.about')}
          </Link>
          {session ? (
            <>
              <Link to="/{-$locale}/projects" params={params} className={linkClass} onClick={close}>
                {t('nav.projects')}
              </Link>
              <Link to="/{-$locale}/uploads" params={params} className={linkClass} onClick={close}>
                {t('nav.uploads')}
              </Link>
              <Link to="/{-$locale}/account" params={params} className={linkClass} onClick={close}>
                {t('nav.account')}
              </Link>
            </>
          ) : (
            <>
              <Link to="/{-$locale}/login" params={params} className={linkClass} onClick={close}>
                {t('nav.login')}
              </Link>
              <Link to="/{-$locale}/register" params={params} className={linkClass} onClick={close}>
                {t('nav.register')}
              </Link>
            </>
          )}
        </nav>
        <Separator />
        <LanguageSwitcher />
      </SheetContent>
    </Sheet>
  )
}
