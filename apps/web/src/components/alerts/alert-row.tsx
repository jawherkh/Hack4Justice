import { Link } from '@tanstack/react-router'
import type { ProjectDestination } from '@hack4justice/shared'
import { ArrowRight, BookOpenCheck, CalendarClock, Coins, FileSpreadsheet, Users } from 'lucide-react'
import { Badge } from '@hack4justice/ui/components/badge'
import { Button } from '@hack4justice/ui/components/button'
import { cn } from '@hack4justice/ui/lib/utils'
import { toLocaleParam, useI18n, type MessageKey } from '#/i18n'
import type { FiscalAlert, FiscalAlertProgress, FiscalAlertSeverity, FiscalObligationId } from '#/lib/alerts'
import { formatDay, formatMonth } from '#/lib/format'

const OBLIGATION_ICON: Record<FiscalObligationId, typeof CalendarClock> = {
  MONTHLY_DECLARATION: CalendarClock,
  EMPLOYER_DECLARATION: Users,
  ANNUAL_RETURN: FileSpreadsheet,
  FINANCIAL_STATEMENTS: BookOpenCheck,
  ADVANCE_INSTALLMENT: Coins,
}

const SEVERITY_CLASS: Record<FiscalAlertSeverity, string> = {
  overdue: 'bg-destructive/10 text-destructive',
  critical: 'bg-destructive/10 text-destructive',
  warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  upcoming: 'bg-muted text-muted-foreground',
}

const PROGRESS_CLASS: Record<FiscalAlertProgress, string> = {
  pending: 'bg-muted text-muted-foreground',
  in_progress: 'bg-primary/10 text-primary',
  done: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
}

export const obligationTitle = (id: FiscalObligationId) => `alerts.obligation.${id}.title` as MessageKey
export const obligationHint = (id: FiscalObligationId) => `alerts.obligation.${id}.hint` as MessageKey
const progressLabel = (progress: FiscalAlertProgress) => `alerts.progress.${progress}` as MessageKey
const agencyLabel = (agency: FiscalAlert['agency']) => `projects.destination.${agency}` as MessageKey

export function AlertRow({ alert }: { alert: FiscalAlert }) {
  const { t, locale } = useI18n()
  const params = { locale: toLocaleParam(locale) }
  const Icon = OBLIGATION_ICON[alert.obligation]
  const done = alert.progress === 'done'
  const iconClass = done ? PROGRESS_CLASS.done : SEVERITY_CLASS[alert.severity]

  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center',
        done && 'opacity-80',
      )}
    >
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', iconClass)}>
        <Icon className="size-5" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{t(obligationTitle(alert.obligation))}</span>
          <Badge variant="outline">{t(agencyLabel(alert.agency))}</Badge>
          <span className={cn('rounded-4xl px-2 py-0.5 text-xs font-medium', PROGRESS_CLASS[alert.progress])}>
            {t(progressLabel(alert.progress))}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          <PeriodLabel alert={alert} /> · {t(obligationHint(alert.obligation))}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
        <span className="text-sm tabular-nums">
          {t('alerts.due', { date: formatDay(alert.dueDate, locale) })}
        </span>
        {!done && <DaysLeft daysLeft={alert.daysLeft} severity={alert.severity} />}
      </div>

      <div className="shrink-0 sm:ms-2">
        {alert.projectId ? (
          <Button
            variant="outline"
            size="sm"
            render={<Link to="/{-$locale}/projects/$id" params={{ ...params, id: alert.projectId }} />}
          >
            {t('alerts.action.open')}
            <ArrowRight data-icon="inline-end" className="rtl:rotate-180" />
          </Button>
        ) : alert.serviceId ? (
          <Button
            size="sm"
            render={
              <Link
                to="/{-$locale}/projects"
                params={params}
                search={{ destination: alert.agency as ProjectDestination }}
              />
            }
          >
            {t('alerts.action.prepare')}
            <ArrowRight data-icon="inline-end" className="rtl:rotate-180" />
          </Button>
        ) : null}
      </div>
    </li>
  )
}

function PeriodLabel({ alert }: { alert: FiscalAlert }) {
  const { t, locale } = useI18n()
  const { period } = alert
  if (period.kind === 'month') return <>{formatMonth(period.year, period.month, locale)}</>
  if (period.kind === 'year') return <>{t('alerts.period.year', { year: period.year })}</>
  return <>{t('alerts.period.installment', { index: period.index, year: period.year })}</>
}

function DaysLeft({ daysLeft, severity }: { daysLeft: number; severity: FiscalAlertSeverity }) {
  const { t } = useI18n()
  const label =
    daysLeft < 0
      ? t('alerts.daysLeft.overdue', { count: -daysLeft })
      : daysLeft === 0
        ? t('alerts.daysLeft.today')
        : t('alerts.daysLeft.remaining', { count: daysLeft })
  return (
    <span
      className={cn('rounded-4xl px-2 py-0.5 text-xs font-medium tabular-nums', SEVERITY_CLASS[severity])}
    >
      {label}
    </span>
  )
}
