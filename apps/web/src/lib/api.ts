import { treaty } from '@elysiajs/eden'
import type { App } from '@hack4justice/api/app'

const baseUrl = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:3001'

/** Type-safe Eden client for the Elysia API. */
// Cookies (session + locale) must travel cross-origin to the API.
export const api: ReturnType<typeof treaty<App>> = treaty<App>(baseUrl, {
  fetch: { credentials: 'include' },
})
