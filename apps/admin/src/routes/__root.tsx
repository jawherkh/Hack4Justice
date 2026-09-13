import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import * as React from 'react'
import { Toaster } from '@hack4justice/ui/components/toast'
import { getSession } from '#/lib/session'
import appCss from '../styles.css?url'

const adminIconBase = '/brand/favicon-admin'
const adminFaviconSizes = [16, 32, 48, 64] as const
const adminFaviconLinks = [
  { suffix: '', media: '(prefers-color-scheme: light)' },
  { suffix: '-dark', media: '(prefers-color-scheme: dark)' },
].flatMap(({ suffix, media }) => [
  {
    rel: 'icon',
    type: 'image/x-icon',
    sizes: '16x16',
    href: `${adminIconBase}/favicon-admin${suffix}.ico`,
    media,
  },
  ...adminFaviconSizes.map((size) => ({
    rel: 'icon',
    type: 'image/png',
    sizes: `${size}x${size}`,
    href: `${adminIconBase}/favicon-admin${suffix}-${size}.png`,
    media,
  })),
  {
    rel: 'icon',
    type: 'image/svg+xml',
    sizes: 'any',
    href: `${adminIconBase}/favicon-admin${suffix}.svg`,
    media,
  },
])

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
      ...adminFaviconLinks,
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: `${adminIconBase}/app-icon-admin-180.png`,
      },
      { rel: 'manifest', href: `${adminIconBase}/site.webmanifest` },
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
