import { HeadContent, Scripts, createRootRoute, useParams } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import * as React from 'react'

import { getDirection, resolveLocale } from '#/i18n'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.ico', sizes: '16x16', type: 'image/x-icon' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient())
  const params = useParams({ strict: false })
  const locale = resolveLocale(params.locale)
  return (
    // next-themes sets the `dark` class on <html> before hydration, hence suppressHydrationWarning.
    <html lang={locale} dir={getDirection(locale)} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </ThemeProvider>

        <Scripts />
      </body>
    </html>
  )
}
