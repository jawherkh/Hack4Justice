import { createServerFn } from '@tanstack/react-start'
import type { ProfileInput } from '@hack4justice/shared'
import { api } from '#/lib/api'
import { unwrap } from '#/lib/api-error'

export type Profile = NonNullable<Awaited<ReturnType<typeof getProfile>>>
/** `null` until the user has completed onboarding. */
export type ProfileData = Profile | null

export const profileKeys = { me: ['profile', 'me'] as const }

export async function getProfile() {
  return unwrap(await api.api.v1.me.profile.get(), 'Could not load profile')
}

/** Creates the profile on first call (onboarding) and updates it afterwards. */
export async function saveProfile(input: ProfileInput) {
  return unwrap(await api.api.v1.me.profile.put(input), 'Could not save profile')
}

/**
 * Resolves the profile on the server, forwarding the browser's cookie to the
 * API, so route guards can decide between onboarding and the app.
 */
export const getProfileForSession = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ProfileData> => {
    const { getRequestHeader } = await import('@tanstack/react-start/server')
    const cookie = getRequestHeader('cookie')
    try {
      const result = await api.api.v1.me.profile.get({ headers: cookie ? { cookie } : {} })
      // The API answers an empty body before onboarding; treat anything falsy as "not onboarded".
      if (result.error) return null
      return result.data || null
    } catch (error) {
      console.error('[profile] could not reach the API:', error)
      return null
    }
  },
)
