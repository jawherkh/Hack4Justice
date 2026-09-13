import type { FiscalAlert, FiscalAlertsView } from '@hack4justice/shared'
import { api } from '#/lib/api'
import { unwrap } from '#/lib/api-error'

export type { FiscalAlert, FiscalAlertsView }
export type { FiscalAlertProgress, FiscalAlertSeverity, FiscalObligationId } from '@hack4justice/shared'

export const alertKeys = { me: ['alerts', 'me'] as const }

/** Deadlines are date-based: a refetch every few minutes keeps "days left" honest across midnight. */
export const ALERTS_POLL_MS = 5 * 60_000

export async function getFiscalAlerts(): Promise<FiscalAlertsView> {
  return unwrap(await api.api.v1.me.alerts.get(), 'Could not load fiscal alerts')
}

/** Open alerts sorted for the dashboard: overdue first, then by due date. Fulfilled ones are separate. */
export function groupFiscalAlerts(alerts: readonly FiscalAlert[]): {
  attention: FiscalAlert[]
  upcoming: FiscalAlert[]
  done: FiscalAlert[]
} {
  const attention: FiscalAlert[] = []
  const upcoming: FiscalAlert[] = []
  const done: FiscalAlert[] = []
  for (const alert of alerts) {
    if (alert.progress === 'done') done.push(alert)
    else if (alert.severity === 'overdue' || alert.severity === 'critical') attention.push(alert)
    else upcoming.push(alert)
  }
  return { attention, upcoming, done }
}
