import { api } from '#/lib/api'
import { unwrap } from '#/lib/api-error'

export type NotificationItem = Awaited<ReturnType<typeof listNotifications>>['items'][number]

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (limit: number) => ['notifications', { limit }] as const,
}

/** Bell and page poll at this interval; there is no push channel yet. */
export const NOTIFICATIONS_POLL_MS = 30_000

export async function listNotifications(limit: number) {
  return unwrap(await api.api.v1.notifications.get({ query: { limit } }), 'Could not load notifications')
}

export async function markNotificationRead(id: string) {
  return unwrap(await api.api.v1.notifications({ id }).read.post(), 'Could not update notification')
}

export async function markAllNotificationsRead() {
  return unwrap(await api.api.v1.notifications['read-all'].post(), 'Could not update notifications')
}
