import { createServerFn } from '@tanstack/react-start'
import { authClient } from '#/lib/auth'

export type SessionData = NonNullable<Awaited<ReturnType<typeof authClient.getSession>>['data']> | null

/** Staff session resolved on the server so route guards work during SSR. */
export const getSession = createServerFn({ method: 'GET' }).handler(async (): Promise<SessionData> => {
  const { getRequestHeader } = await import('@tanstack/react-start/server')
  const cookie = getRequestHeader('cookie')
  try {
    const { data } = await authClient.getSession({ fetchOptions: { headers: cookie ? { cookie } : {} } })
    return data ?? null
  } catch (error) {
    console.error('[admin session] could not reach the auth API:', error)
    return null
  }
})
