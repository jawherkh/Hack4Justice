import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { BellRing, Building2, CalendarX2 } from 'lucide-react'
import { Badge } from '@hack4justice/ui/components/badge'
import { Button } from '@hack4justice/ui/components/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@hack4justice/ui/components/empty'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import { AlertRow } from '#/components/alerts/alert-row'
import { AlertsSummary } from '#/components/alerts/alerts-summary'
import { toLocaleParam, useI18n, type MessageKey } from '#/i18n'
import { ALERTS_POLL_MS, alertKeys, getFiscalAlerts, groupFiscalAlerts, type FiscalAlert } from '#/lib/alerts'
import { requireOnboarded } from '#/lib/guards'

export const Route = createFileRoute('/{-$locale}/alerts')({
  beforeLoad: requireOnboarded,
  component: Alerts,
})

function Alerts() {
  const { t } = useI18n()
  const alerts = useQuery({
    queryKey: alertKeys.me,
    queryFn: getFiscalAlerts,
    refetchInterval: ALERTS_POLL_MS,
  })

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t('alerts.eyebrow')}
        </p>
        <h1 className="text-3xl font-bold tracking-tight">{t('alerts.title')}</h1>
        {alerts.data?.company?.name ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="size-4" />
            <span className="font-medium text-foreground">{alerts.data.company.name}</span>
            {alerts.data.company.legalForm && (
              <Badge variant="secondary">{t(legalFormLabel(alerts.data.company.legalForm))}</Badge>
            )}
            {alerts.data.company.taxId && <span className="tabular-nums">{alerts.data.company.taxId}</span>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('alerts.description')}</p>
        )}
      </header>

      {alerts.isPending ? (
        <AlertsSkeleton />
      ) : alerts.isError ? (
        <p className="text-sm text-destructive">{t('alerts.loadError')}</p>
      ) : !alerts.data.applicable ? (
        <NotApplicable reason={alerts.data.reason ?? 'no_company'} />
      ) : (
        <>
          <AlertsSummary summary={alerts.data.summary} />
          <Dashboard alerts={alerts.data.alerts} />
          <p className="text-xs text-muted-foreground">{t('alerts.disclaimer')}</p>
        </>
      )}
    </main>
  )
}

function Dashboard({ alerts }: { alerts: readonly FiscalAlert[] }) {
  const { t } = useI18n()
  const groups = groupFiscalAlerts(alerts)
  return (
    <div className="flex flex-col gap-8">
      <Section
        title={t('alerts.section.attention')}
        description={t('alerts.section.attention.hint')}
        items={groups.attention}
        empty={t('alerts.section.attention.empty')}
      />
      <Section
        title={t('alerts.section.upcoming')}
        description={t('alerts.section.upcoming.hint')}
        items={groups.upcoming}
        empty={t('alerts.section.upcoming.empty')}
      />
      {groups.done.length > 0 && (
        <Section
          title={t('alerts.section.done')}
          description={t('alerts.section.done.hint')}
          items={groups.done}
        />
      )}
    </div>
  )
}

function Section({
  title,
  description,
  items,
  empty,
}: {
  title: string
  description: string
  items: readonly FiscalAlert[]
  empty?: string
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <span className="text-sm text-muted-foreground tabular-nums">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((alert) => (
            <AlertRow key={alert.id} alert={alert} />
          ))}
        </ul>
      )}
    </section>
  )
}

type NotApplicableReason = 'no_profile' | 'no_company' | 'not_registered'

function NotApplicable({ reason }: { reason: NotApplicableReason }) {
  const { t, locale } = useI18n()
  const params = { locale: toLocaleParam(locale) }
  const Icon = reason === 'not_registered' ? CalendarX2 : BellRing
  return (
    <Empty className="rounded-xl border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{t(`alerts.notApplicable.${reason}.title` as MessageKey)}</EmptyTitle>
        <EmptyDescription>{t(`alerts.notApplicable.${reason}.description` as MessageKey)}</EmptyDescription>
      </EmptyHeader>
      <Button render={<Link to="/{-$locale}/account" params={params} />}>
        {t('alerts.notApplicable.action')}
      </Button>
    </Empty>
  )
}

function AlertsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[74px] rounded-xl" />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

const legalFormLabel = (form: string) => `onboarding.legalForm.${form}` as MessageKey
