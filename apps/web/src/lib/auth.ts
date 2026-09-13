import { createClient } from '@hack4justice/auth/client'

const baseURL = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:3001'

/** Better Auth React client. Session cookies are sent with every request. */
export const authClient = createClient({ baseURL })

export const { useSession, signIn, signUp, signOut } = authClient
