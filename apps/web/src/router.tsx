import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { ErrorPage } from '#/components/error-page'
import { DEFAULT_LOCALE } from '#/i18n/locales'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // Fallbacks for anything outside the locale layout.
    defaultNotFoundComponent: () => <ErrorPage locale={DEFAULT_LOCALE} kind="not-found" />,
    defaultErrorComponent: ({ reset }) => <ErrorPage locale={DEFAULT_LOCALE} kind="error" onRetry={reset} />,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
