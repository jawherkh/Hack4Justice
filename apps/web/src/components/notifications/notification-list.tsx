import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { NotificationDomain, type NotificationType, type ProcedureStatus } from '@hack4justice/shared'
import { BellOff, FileText, FolderKanban, ListChecks } from 'lucide-react'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@hack4justice/ui/components/empty'
import { cn } from '@hack4justice/ui/lib/utils'
import { procedureStatusLabel, serviceName } from '#/components/procedure/labels'
import { toLocaleParam, useI18n, type MessageKey } from '#/i18n'
import { formatRelative } from '#/lib/format'
import { markNotificationRead, notificationKeys, type NotificationItem } from '#/lib/notifications'

const DOMAIN_ICON: Record<NotificationDomain, typeof FileText> = {
  [NotificationDomain.PROJECT]: FolderKanban,
  [NotificationDomain.PROCEDURE]: ListChecks,
  [NotificationDomain.UPLOAD]: FileText,
}

const typeMessage = (type: NotificationType) => `notifications.type.${type}` as MessageKey
const domainLabel = (domain: NotificationDomain) => `notifications.domain.${domain}` as MessageKey

/** Renders the message from `type` + `payload`, translating catalog ids the payload may carry. */
export function useNotificationText() {
  const { t } = useI18n()
  return (item: NotificationItem): string => {
    const vars: Record<string, string> = { ...item.payload }
    const service = vars['service']
    if (service) vars['service'] = t(serviceName(service))
    const status = vars['status']
    if (status) vars['status'] = t(procedureStatusLabel(status as ProcedureStatus))
    return t(typeMessage(item.type), vars)
  }
}

interface NotificationListProps {
  items: NotificationItem[]
  /** Called after navigating, e.g. to close the popover. */
  onNavigate?: () => void
  compact?: boolean
}

export function NotificationList({ items, onNavigate, compact = false }: NotificationListProps) {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const text = useNotificationText()

  const read = useMutation({
    mutationFn: markNotificationRead,
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })

  if (items.length === 0) {
    return (
      <Empty className={cn(compact ? 'py-8' : 'rounded-xl border border-dashed py-12')}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BellOff />
          </EmptyMedia>
          <EmptyTitle>{t('notifications.empty.title')}</EmptyTitle>
          <EmptyDescription>{t('notifications.empty.description')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ul
      className={cn(
        'flex flex-col',
        compact ? 'divide-y' : 'divide-y overflow-hidden rounded-xl border bg-card',
      )}
    >
      {items.map((item) => {
        const Icon = DOMAIN_ICON[item.domain]
        const unread = item.readAt === null
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => {
                if (unread) read.mutate(item.id)
                if (item.projectId) {
                  void navigate({
                    to: '/{-$locale}/projects/$id',
                    params: { locale: toLocaleParam(locale), id: item.projectId },
                  })
                  onNavigate?.()
                }
              }}
              className={cn(
                'flex w-full items-start gap-3 px-4 py-3 text-start transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60',
                compact && 'px-3',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md',
                  unread ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={cn('text-sm', unread ? 'font-medium' : 'text-muted-foreground')}>
                  {text(item)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t(domainLabel(item.domain))} · {formatRelative(item.createdAt, locale)}
                </span>
              </span>
              {unread ? <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-primary" /> : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
