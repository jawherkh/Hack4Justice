import * as React from 'react'
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { render, type RenderResult } from '@testing-library/react'
import { I18nProvider, type Locale } from '#/i18n'

/**
 * Renders `ui` inside a minimal in-memory router and the I18n provider, so
 * components using Link / useNavigate / useI18n work in tests.
 */
export function renderWithApp(ui: React.ReactNode, { locale = 'en' as Locale } = {}): RenderResult {
  const rootRoute = createRootRoute({
    component: () => <I18nProvider locale={locale}>{ui}</I18nProvider>,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<RouterProvider router={router as any} />)
}
