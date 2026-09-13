import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { NOTIFICATION_PREVIEW_LIMIT } from '@hack4justice/shared'
import { Bell } from 'lucide-react'
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
  type NotificationItem,
} from '#/lib/notifications'
import { NotificationList } from './notification-list'

type Inbox = Awaited<ReturnType<typeof listNotifications>>

/**
 * Bell with unread badge; opens the latest notifications. Polls while mounted.
 * Opening the popover marks everything as read (the badge clears right away);
 * the items that were unread stay highlighted until the popover closes.
 */
export function NotificationsPopover({ className }: { className?: string }) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [seenIds, setSeenIds] = React.useState<ReadonlySet<string>>(() => new Set())
  const markedThisOpen = React.useRef(false)

  const notifications = useQuery({
    queryKey: notificationKeys.list(NOTIFICATION_PREVIEW_LIMIT),
    queryFn: () => listNotifications(NOTIFICATION_PREVIEW_LIMIT),
    refetchInterval: NOTIFICATIONS_POLL_MS,
  })
  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: () => {
      // Clear the badge immediately; the server is the source of truth once it refetches.
      queryClient.setQueriesData<Inbox>({ queryKey: notificationKeys.all }, (current) =>
        current ? { ...current, unreadCount: 0 } : current,
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })

  const data = notifications.data
  const markAllRead = readAll.mutate
  React.useEffect(() => {
    if (!open) {
      markedThisOpen.current = false
      return
    }
    // Runs once per opening, as soon as the list is available (it may still be loading on open).
    if (markedThisOpen.current || !data || data.unreadCount === 0) return
    markedThisOpen.current = true
    setSeenIds(new Set(data.items.filter((item) => item.readAt === null).map((item) => item.id)))
    markAllRead()
  }, [open, data, markAllRead])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setSeenIds(new Set())
  }

  const unread = data?.unreadCount ?? 0
  // Keep the "new" styling on the items the user is looking at, even though they are now read.
  const items: NotificationItem[] = (data?.items ?? []).map((item) =>
    seenIds.has(item.id) ? { ...item, readAt: null } : item,
  )
  const label = unread
    ? `${t('notifications.open')} (${t('notifications.unread', { count: unread })})`
    : t('notifications.open')

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            className={cn('relative overflow-visible', className)}
          />
        }
      >
        <Bell />
        {unread > 0 ? (
          <span
            style={{ top: -4, insetInlineEnd: -4 }}
            className="absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums ring-2 ring-background"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-0">
        <div className="border-b px-3 py-2">
          <p className="text-sm font-semibold">{t('notifications.title')}</p>
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
            <NotificationList items={items} compact onNavigate={() => handleOpenChange(false)} />
          )}
        </div>
        <div className="border-t p-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => handleOpenChange(false)}
            render={<Link to="/{-$locale}/notifications" params={{ locale: toLocaleParam(locale) }} />}
          >
            {t('notifications.seeAll')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
