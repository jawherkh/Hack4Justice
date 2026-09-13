import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import * as React from 'react'
import { Toaster } from '@hack4justice/ui/components/toast'
import { getSession } from '#/lib/session'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  beforeLoad: async () => ({ session: await getSession() }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Dalil Admin' },
      { name: 'robots', content: 'noindex' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.ico', sizes: '16x16', type: 'image/x-icon' },
    ],
  }),
  shellComponent: RootDocument,
  component: () => <Outlet />,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient())
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
          <Toaster />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}
