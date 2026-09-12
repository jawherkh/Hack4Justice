import { Link, Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { Footer } from '#/components/footer'
import { Navbar } from '#/components/navbar'
import {
  DEFAULT_LOCALE,
  I18nProvider,
  createTranslator,
  isLocale,
  resolveLocale,
} from '#/i18n'

export const Route = createFileRoute('/{-$locale}')({
  beforeLoad: ({ params }) => {
    // No prefix means default locale. Any prefix must be a known locale,
    // otherwise `/whatever` would silently render as the default language.
    if (params.locale !== undefined && !isLocale(params.locale)) {
      throw notFound()
    }
    return { locale: resolveLocale(params.locale) }
  },
  head: ({ params }) => {
    // Derive from params, not context: `head` also runs when `beforeLoad`
    // threw notFound, and context is empty in that case.
    const t = createTranslator(resolveLocale(params.locale))
    return { meta: [{ title: t('meta.title') }] }
  },
  component: LocaleLayout,
  notFoundComponent: LocaleNotFound,
})

function LocaleLayout() {
  const { locale } = Route.useRouteContext()
  return (
    <I18nProvider locale={locale}>
      <div className="flex min-h-svh flex-col">
        <Navbar />
        <div className="flex flex-1 flex-col">
          <Outlet />
        </div>
        <Footer />
      </div>
    </I18nProvider>
  )
}

function LocaleNotFound() {
  // Rendered when the locale prefix itself is unknown (e.g. `/de`), so there
  // is no valid locale in context. Fall back to the default language.
  const params = Route.useParams()
  const locale = isLocale(params.locale) ? params.locale : DEFAULT_LOCALE
  const t = createTranslator(locale)
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-3xl font-bold tracking-tight">{t('notFound.title')}</h1>
      <p className="text-muted-foreground">{t('notFound.description')}</p>
      <Link to="/{-$locale}" params={{ locale: undefined }} className="underline">
        Hack4Justice
      </Link>
    </main>
  )
}
