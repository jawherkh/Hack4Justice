import { Link } from '@tanstack/react-router'
import { Separator } from '@hack4justice/ui/components/separator'
import { toLocaleParam, useI18n } from '#/i18n'

const footerLinkClass = 'text-sm text-muted-foreground transition-colors hover:text-foreground'

export function Footer() {
  const { locale, t } = useI18n()
  const params = { locale: toLocaleParam(locale) }
  const year = new Date().getFullYear()

  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-[1fr_auto_auto] sm:gap-16">
          <div className="flex flex-col gap-2">
            <Link to="/{-$locale}" params={params} className="font-semibold tracking-tight">
              Hack4Justice
            </Link>
            <p className="max-w-xs text-sm text-muted-foreground">{t('footer.tagline')}</p>
          </div>

          <FooterColumn title={t('footer.navigation')}>
            <Link to="/{-$locale}" params={params} className={footerLinkClass}>
              {t('nav.home')}
            </Link>
            <Link to="/{-$locale}/about" params={params} className={footerLinkClass}>
              {t('nav.about')}
            </Link>
          </FooterColumn>

          <FooterColumn title={t('footer.account')}>
            <Link to="/{-$locale}/login" params={params} className={footerLinkClass}>
              {t('nav.login')}
            </Link>
            <Link to="/{-$locale}/register" params={params} className={footerLinkClass}>
              {t('nav.register')}
            </Link>
          </FooterColumn>
        </div>

        <Separator />

        <p className="text-xs text-muted-foreground">{t('footer.rights', { year })}</p>
      </div>
    </footer>
  )
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <nav aria-label={title} className="flex flex-col gap-2">
      <p className="text-sm font-medium">{title}</p>
      {children}
    </nav>
  )
}
