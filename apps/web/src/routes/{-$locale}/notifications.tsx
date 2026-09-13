import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CheckCheck } from 'lucide-react'
import { Button } from '@hack4justice/ui/components/button'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import { NotificationList } from '#/components/notifications/notification-list'
import { useI18n } from '#/i18n'
import { requireAuth } from '#/lib/guards'
import {
  NOTIFICATIONS_POLL_MS,
  listNotifications,
  markAllNotificationsRead,
  notificationKeys,
} from '#/lib/notifications'

const PAGE_LIMIT = 100

export const Route = createFileRoute('/{-$locale}/notifications')({
  beforeLoad: requireAuth,
  component: Notifications,
})

function Notifications() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const notifications = useQuery({
    queryKey: notificationKeys.list(PAGE_LIMIT),
    queryFn: () => listNotifications(PAGE_LIMIT),
    refetchInterval: NOTIFICATIONS_POLL_MS,
  })
  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })
  const unread = notifications.data?.unreadCount ?? 0

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">{t('notifications.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {unread > 0 ? t('notifications.unread', { count: unread }) : t('notifications.description')}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={unread === 0 || readAll.isPending}
          onClick={() => readAll.mutate()}
        >
          <CheckCheck data-icon="inline-start" />
          {t('notifications.markAllRead')}
        </Button>
      </header>
      {notifications.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : notifications.isError ? (
        <p className="text-sm text-destructive">{t('notifications.loadError')}</p>
      ) : (
        <NotificationList items={notifications.data.items} />
      )}
    </main>
  )
}
