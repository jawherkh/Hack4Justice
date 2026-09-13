import { redirect } from '@tanstack/react-router'
import type { ProfileData } from '#/lib/profile'
import type { SessionData } from '#/lib/session'
import { toLocaleParam, type Locale } from '#/i18n'

interface GuardInput {
  context: { locale: Locale; session: SessionData; profile: ProfileData }
  location: { href: string }
}

/** Only same-origin paths, so `?redirect=` cannot send users to another site. */
export function safeRedirect(value: string | undefined, fallback: string): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : fallback
}

/** For pages that need a signed-in user. Sends guests to login and brings them back afterwards. */
export function requireAuth({ context, location }: GuardInput): { session: NonNullable<SessionData> } {
  if (!context.session) {
    throw redirect({
      to: '/{-$locale}/login',
      params: { locale: toLocaleParam(context.locale) },
      search: { redirect: location.href },
    })
  }
  return { session: context.session }
}

/**
 * For the workspace: a signed-in user who has not finished onboarding is sent
 * there first, and comes back to the page they wanted afterwards.
 */
export function requireOnboarded(input: GuardInput): {
  session: NonNullable<SessionData>
  profile: NonNullable<ProfileData>
} {
  const { session } = requireAuth(input)
  if (!input.context.profile) {
    throw redirect({
      to: '/{-$locale}/onboarding',
      params: { locale: toLocaleParam(input.context.locale) },
      search: { redirect: input.location.href },
    })
  }
  return { session, profile: input.context.profile }
}

/** For the onboarding page itself: already-onboarded users go to their projects (or `?redirect=`). */
export function requireNotOnboarded(input: GuardInput & { search: { redirect?: string } }): {
  session: NonNullable<SessionData>
} {
  const { session } = requireAuth(input)
  if (input.context.profile) {
    throw redirect({ href: safeRedirect(input.search.redirect, projectsHref(input.context.locale)) })
  }
  return { session }
}

/** For login and register. Signed-in users go to their projects (or to `?redirect=`). */
export function requireGuest({ context, search }: GuardInput & { search: { redirect?: string } }): void {
  if (context.session) {
    throw redirect({ href: safeRedirect(search.redirect, projectsHref(context.locale)) })
  }
}

/** For the public landing page: signed-in users land on their projects instead. */
export function redirectSignedIn({ context }: Pick<GuardInput, 'context'>): void {
  if (context.session) {
    throw redirect({ to: '/{-$locale}/projects', params: { locale: toLocaleParam(context.locale) } })
  }
}

export function homeHref(locale: Locale): string {
  const prefix = toLocaleParam(locale)
  return prefix ? `/${prefix}` : '/'
}

/** Default destination after login / register. */
export function projectsHref(locale: Locale): string {
  const prefix = toLocaleParam(locale)
  return prefix ? `/${prefix}/projects` : '/projects'
}
