import { redirect } from '@tanstack/react-router'
import type { SessionData } from '#/lib/session'
import { toLocaleParam, type Locale } from '#/i18n'

interface GuardInput {
  context: { locale: Locale; session: SessionData }
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
