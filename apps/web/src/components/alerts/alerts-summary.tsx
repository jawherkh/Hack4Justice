import { AlertTriangle, CalendarDays, CheckCircle2, Clock } from 'lucide-react'
import { cn } from '@hack4justice/ui/lib/utils'
import { useTranslation } from '#/i18n'
import type { FiscalAlertsView } from '#/lib/alerts'

interface AlertsSummaryProps {
  summary: FiscalAlertsView['summary']
}

/** Four stat tiles: what is late, what is imminent, what is coming, what is already handled. */
export function AlertsSummary({ summary }: AlertsSummaryProps) {
  const t = useTranslation()
  const tiles = [
    {
      key: 'overdue',
      title: t('alerts.stat.overdue'),
      hint: t('alerts.stat.overdue.hint'),
      count: summary.overdue,
      icon: AlertTriangle,
      tone: summary.overdue > 0 ? 'text-destructive' : 'text-foreground',
      media: 'bg-destructive/10 text-destructive',
    },
    {
      key: 'critical',
      title: t('alerts.stat.critical'),
      hint: t('alerts.stat.critical.hint'),
      count: summary.critical,
      icon: Clock,
      tone: summary.critical > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-foreground',
      media: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    },
    {
      key: 'upcoming',
      title: t('alerts.stat.upcoming'),
      hint: t('alerts.stat.upcoming.hint'),
      count: summary.warning + summary.upcoming,
      icon: CalendarDays,
      tone: 'text-foreground',
      media: 'bg-primary/10 text-primary',
    },
    {
      key: 'done',
      title: t('alerts.stat.done'),
      hint: t('alerts.stat.done.hint'),
      count: summary.done,
      icon: CheckCircle2,
      tone: 'text-foreground',
      media: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    },
  ] as const

  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.key} className="flex items-center gap-4 rounded-xl border bg-card px-4 py-3.5">
          <span className={cn('flex size-11 items-center justify-center rounded-lg', tile.media)}>
            <tile.icon className="size-5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <dt className="text-sm font-semibold">{tile.title}</dt>
            <dd className="truncate text-xs text-muted-foreground">{tile.hint}</dd>
          </div>
          <dd className={cn('text-2xl font-semibold tracking-tight tabular-nums', tile.tone)}>
            {tile.count}
          </dd>
        </div>
      ))}
    </dl>
  )
}
