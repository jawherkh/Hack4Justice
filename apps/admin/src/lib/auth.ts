import { createAdminClient } from '@hack4justice/auth/admin/client'

const baseURL = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:3001'

/** Better Auth client for staff sessions (separate instance from end users). */
export const authClient = createAdminClient({ baseURL })

export const { signIn, signOut } = authClient
