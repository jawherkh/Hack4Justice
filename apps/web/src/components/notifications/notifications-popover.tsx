import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { NOTIFICATION_PREVIEW_LIMIT } from '@hack4justice/shared'
import { Bell, CheckCheck } from 'lucide-react'
import { Button } from '@hack4justice/ui/components/button'
import { Popover, PopoverContent, PopoverTrigger } from '@hack4justice/ui/components/popover'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import { cn } from '@hack4justice/ui/lib/utils'
import { toLocaleParam, useI18n } from '#/i18n'
import {
  NOTIFICATIONS_POLL_MS,
  listNotifications,
  markAllNotificationsRead,
  notificationKeys,
} from '#/lib/notifications'
import { NotificationList } from './notification-list'

/** Bell with unread badge; opens the latest notifications. Polls while mounted. */
export function NotificationsPopover({ className }: { className?: string }) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)

  const notifications = useQuery({
    queryKey: notificationKeys.list(NOTIFICATION_PREVIEW_LIMIT),
    queryFn: () => listNotifications(NOTIFICATION_PREVIEW_LIMIT),
    refetchInterval: NOTIFICATIONS_POLL_MS,
  })
  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })

  const unread = notifications.data?.unreadCount ?? 0
  const label = unread
    ? `${t('notifications.open')} (${t('notifications.unread', { count: unread })})`
    : t('notifications.open')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={label} className={cn('relative', className)} />
        }
      >
        <Bell />
        {unread > 0 ? (
          <span className="absolute end-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <p className="text-sm font-semibold">{t('notifications.title')}</p>
          <Button
            variant="ghost"
            size="xs"
            disabled={unread === 0 || readAll.isPending}
            onClick={() => readAll.mutate()}
          >
            <CheckCheck data-icon="inline-start" />
            {t('notifications.markAllRead')}
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.isPending ? (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : notifications.isError ? (
            <p className="p-3 text-sm text-destructive">{t('notifications.loadError')}</p>
          ) : (
            <NotificationList items={notifications.data.items} compact onNavigate={() => setOpen(false)} />
          )}
        </div>
        <div className="border-t p-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setOpen(false)}
            render={<Link to="/{-$locale}/notifications" params={{ locale: toLocaleParam(locale) }} />}
          >
            {t('notifications.seeAll')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
