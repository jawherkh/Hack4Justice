import { Outlet, createFileRoute, notFound, useMatches, useRouter } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { ErrorPage } from '#/components/error-page'
import { Toaster } from '@hack4justice/ui/components/toast'
import { Footer } from '#/components/footer'
import { Navbar } from '#/components/navbar'
import { getProfileForSession } from '#/lib/profile'
import { getSession } from '#/lib/session'
import { DEFAULT_LOCALE, I18nProvider, createTranslator, isLocale, resolveLocale, type Locale } from '#/i18n'

const OG_LOCALE: Record<Locale, string> = { fr: 'fr_FR', en: 'en_GB', ar: 'ar_TN' }

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** `app`: full-height workspace with its own sidebar, no marketing navbar or footer. */
    chrome?: 'app'
  }
}

export const Route = createFileRoute('/{-$locale}')({
  beforeLoad: async ({ params }) => {
    // No prefix means default locale. Any prefix must be a known locale,
    // otherwise `/whatever` would silently render as the default language.
    if (params.locale !== undefined && !isLocale(params.locale)) {
      throw notFound()
    }
    const session = await getSession()
    // Onboarding state travels with the session so guards can gate the workspace.
    const profile = session ? await getProfileForSession() : null
    return { locale: resolveLocale(params.locale), session, profile }
  },
  head: ({ params }) => {
    // Derive from params, not context: `head` also runs when `beforeLoad`
    // threw notFound, and context is empty in that case.
    const locale = resolveLocale(params.locale)
    const t = createTranslator(locale)
    return {
      meta: [
        { title: t('meta.title') },
        { name: 'description', content: t('meta.description') },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Dalil' },
        { property: 'og:title', content: t('meta.title') },
        { property: 'og:description', content: t('meta.description') },
        { property: 'og:locale', content: OG_LOCALE[locale] },
        { name: 'twitter:card', content: 'summary' },
      ],
    }
  },
  component: LocaleLayout,
  notFoundComponent: LocaleNotFound,
  errorComponent: LocaleError,
})

function LocaleLayout() {
  const { locale } = Route.useRouteContext()
  const appChrome = useMatches().some((match) => match.staticData.chrome === 'app')
  return (
    <I18nProvider locale={locale}>
      {appChrome ? (
        <Outlet />
      ) : (
        <div className="flex min-h-svh flex-col">
          <Navbar />
          <div className="flex flex-1 flex-col">
            <Outlet />
          </div>
          <Footer />
        </div>
      )}
      <Toaster />
    </I18nProvider>
  )
}

function localeFromParams(params: { locale?: string }) {
  return isLocale(params.locale) ? params.locale : DEFAULT_LOCALE
}

/** Unknown route or unknown locale prefix (e.g. `/de`): no valid locale in context, so derive it. */
function LocaleNotFound() {
  return <ErrorPage locale={localeFromParams(Route.useParams())} kind="not-found" />
}

function LocaleError({ reset }: ErrorComponentProps) {
  const router = useRouter()
  const locale = localeFromParams(Route.useParams())
  return (
    <ErrorPage
      locale={locale}
      kind="error"
      onRetry={() => {
        reset()
        void router.invalidate()
      }}
    />
  )
}
