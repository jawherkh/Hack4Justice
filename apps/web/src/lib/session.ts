import { createServerFn } from '@tanstack/react-start'
import { authClient } from '#/lib/auth'

/** `{ user, session }` from Better Auth, or null when signed out. */
export type SessionData = NonNullable<
  Awaited<ReturnType<typeof authClient.getSession>>['data']
> | null

/**
 * Resolves the current session on the server, forwarding the browser's cookie
 * to the API. Works during SSR and from client navigations alike, so route
 * guards can rely on it in `beforeLoad`.
 */
export const getSession = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SessionData> => {
    const { getRequestHeader } = await import('@tanstack/react-start/server')
    const cookie = getRequestHeader('cookie')
    const { data } = await authClient.getSession({
      fetchOptions: { headers: cookie ? { cookie } : {} },
    })
    return data ?? null
  },
)
