import {
  LegalForm,
  type FiscalAgency,
  type FiscalAlert,
  type FiscalAlertSeverity,
  type FiscalAlertSummary,
  type FiscalObligationId,
  type FiscalPeriod,
} from "@hack4justice/shared";

/**
 * Recurring Tunisian tax and registry deadlines for a registered company.
 *
 * Dates follow the common calendar-year fiscal year (closing 31 December).
 * The rules are informational: the competent authority or a chartered
 * accountant remains the reference (see README, "does not file").
 */

export type { FiscalAlert, FiscalAlertSummary } from "@hack4justice/shared";

export interface FiscalCompany {
  legalForm: LegalForm | null;
}

export interface FiscalActivity {
  projects: readonly { id: string; serviceId: string | null; createdAt: Date }[];
  submissions: readonly { projectId: string; serviceId: string; submittedAt: Date }[];
}

export interface FiscalWindow {
  /** How far back overdue deadlines are still surfaced. */
  pastDays: number;
  futureDays: number;
}

export const DEFAULT_FISCAL_WINDOW: FiscalWindow = { pastDays: 60, futureDays: 180 };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Sole traders (personnes physiques) file the monthly declaration by the 15th; companies by the 28th. */
function monthlyDueDay(legalForm: LegalForm | null): number {
  return legalForm === LegalForm.EI ? 15 : 28;
}

/** Annual income return: 25 April for sole traders (BIC), 25 March for companies subject to IS. */
function annualReturnDue(legalForm: LegalForm | null): { month: number; day: number } {
  return legalForm === LegalForm.EI ? { month: 4, day: 25 } : { month: 3, day: 25 };
}

/** Annual financial statements (bilan) to deposit before 30 April. */
const FINANCIAL_STATEMENTS_DUE = { month: 4, day: 30 } as const;
/** Employer's declaration (déclaration de l'employeur) for the previous year. */
const EMPLOYER_DECLARATION_DUE = { month: 2, day: 28 } as const;
/** Advance installments (acomptes provisionnels): 25 June, 25 September, 25 December. */
const ADVANCE_INSTALLMENT_DUES: readonly { index: 1 | 2 | 3; month: number; day: number }[] = [
  { index: 1, month: 6, day: 25 },
  { index: 2, month: 9, day: 25 },
  { index: 3, month: 12, day: 25 },
];

function utcDay(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day);
}

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): number {
  return utcDay(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

interface Deadline {
  obligation: FiscalObligationId;
  agency: FiscalAgency;
  serviceId: string | null;
  period: FiscalPeriod;
  dueMs: number;
  /** Activity (projects, submissions) in `[countsFromMs, countsUntilMs)` belongs to this deadline. */
  countsFromMs: number;
  countsUntilMs: number;
}

function* deadlinesForYear(year: number, company: FiscalCompany): Generator<Deadline> {
  const monthlyDay = monthlyDueDay(company.legalForm);
  for (let month = 1; month <= 12; month += 1) {
    // Declaration for month M is due in month M+1.
    const dueYear = month === 12 ? year + 1 : year;
    const dueMonth = month === 12 ? 1 : month + 1;
    yield {
      obligation: "MONTHLY_DECLARATION",
      agency: "DGI",
      serviceId: "DGI_MONTHLY_DECLARATION",
      period: { kind: "month", year, month },
      dueMs: utcDay(dueYear, dueMonth, monthlyDay),
      countsFromMs: utcDay(dueYear, dueMonth, 1),
      countsUntilMs: utcDay(dueYear, dueMonth + 1, 1),
    };
  }

  // Yearly obligations due in `year` concern the previous fiscal year.
  const previous = year - 1;
  yield {
    obligation: "EMPLOYER_DECLARATION",
    agency: "DGI",
    serviceId: null,
    period: { kind: "year", year: previous },
    dueMs: utcDay(year, EMPLOYER_DECLARATION_DUE.month, EMPLOYER_DECLARATION_DUE.day),
    countsFromMs: utcDay(year, 1, 1),
    countsUntilMs: utcDay(year + 1, 1, 1),
  };
  const annual = annualReturnDue(company.legalForm);
  yield {
    obligation: "ANNUAL_RETURN",
    agency: "DGI",
    serviceId: "DGI_ANNUAL_RETURN",
    period: { kind: "year", year: previous },
    dueMs: utcDay(year, annual.month, annual.day),
    countsFromMs: utcDay(year, 1, 1),
    countsUntilMs: utcDay(year + 1, 1, 1),
  };
  yield {
    obligation: "FINANCIAL_STATEMENTS",
    agency: "RNE",
    serviceId: null,
    period: { kind: "year", year: previous },
    dueMs: utcDay(year, FINANCIAL_STATEMENTS_DUE.month, FINANCIAL_STATEMENTS_DUE.day),
    countsFromMs: utcDay(year, 1, 1),
    countsUntilMs: utcDay(year + 1, 1, 1),
  };
  for (const installment of ADVANCE_INSTALLMENT_DUES) {
    const previousDue = ADVANCE_INSTALLMENT_DUES[installment.index - 2];
    const nextDue = ADVANCE_INSTALLMENT_DUES[installment.index];
    yield {
      obligation: "ADVANCE_INSTALLMENT",
      agency: "DGI",
      serviceId: null,
      period: { kind: "installment", year, index: installment.index },
      dueMs: utcDay(year, installment.month, installment.day),
      countsFromMs: previousDue
        ? utcDay(year, previousDue.month, previousDue.day) + DAY_MS
        : utcDay(year, 1, 1),
      countsUntilMs: nextDue ? utcDay(year, nextDue.month, nextDue.day) + DAY_MS : utcDay(year + 1, 1, 1),
    };
  }
}

export function severityFor(daysLeft: number): FiscalAlertSeverity {
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= 7) return "critical";
  if (daysLeft <= 30) return "warning";
  return "upcoming";
}

function submissionFor(deadline: Deadline, activity: FiscalActivity) {
  if (!deadline.serviceId) return undefined;
  return activity.submissions
    .filter(
      (s) =>
        s.serviceId === deadline.serviceId &&
        s.submittedAt.getTime() >= deadline.countsFromMs &&
        s.submittedAt.getTime() < deadline.countsUntilMs,
    )
    .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())[0];
}

/**
 * A project that has not been submitted yet is assumed to target the first
 * still-open deadline of its service whose filing window had not closed when
 * the project was created: the one currently due, or the next one.
 */
function assignOpenProjects(
  candidates: { alert: FiscalAlert; deadline: Deadline }[],
  activity: FiscalActivity,
) {
  const submittedProjects = new Set(activity.submissions.map((s) => s.projectId));
  const open = activity.projects
    .filter((p) => p.serviceId && !submittedProjects.has(p.id))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const project of open) {
    const target = candidates.find(
      ({ alert, deadline }) =>
        deadline.serviceId === project.serviceId &&
        alert.progress === "pending" &&
        deadline.countsUntilMs > project.createdAt.getTime(),
    );
    if (!target) continue;
    target.alert.progress = "in_progress";
    target.alert.projectId = project.id;
  }
}

/**
 * Deadlines inside the window around `now`, oldest first. Overdue deadlines
 * that were already fulfilled stay listed as `done` so the user can see the
 * period is covered.
 */
export function buildFiscalAlerts(
  company: FiscalCompany,
  activity: FiscalActivity,
  now: Date,
  window: FiscalWindow = DEFAULT_FISCAL_WINDOW,
): FiscalAlert[] {
  const today = startOfUtcDay(now);
  const from = today - window.pastDays * DAY_MS;
  const to = today + window.futureDays * DAY_MS;
  const firstYear = new Date(from).getUTCFullYear() - 1;
  const lastYear = new Date(to).getUTCFullYear() + 1;

  const candidates: { alert: FiscalAlert; deadline: Deadline }[] = [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    for (const deadline of deadlinesForYear(year, company)) {
      if (deadline.dueMs < from || deadline.dueMs > to) continue;
      const daysLeft = Math.round((deadline.dueMs - today) / DAY_MS);
      const dueDate = toIsoDate(deadline.dueMs);
      const submitted = submissionFor(deadline, activity);
      candidates.push({
        deadline,
        alert: {
          id: `${deadline.obligation}:${dueDate}`,
          obligation: deadline.obligation,
          agency: deadline.agency,
          serviceId: deadline.serviceId,
          period: deadline.period,
          dueDate,
          daysLeft,
          severity: severityFor(daysLeft),
          progress: submitted ? "done" : "pending",
          projectId: submitted?.projectId ?? null,
        },
      });
    }
  }
  // Yearly items are generated after the monthly ones of the same year: order once by due date.
  candidates.sort(
    (a, b) =>
      a.alert.dueDate.localeCompare(b.alert.dueDate) || a.alert.obligation.localeCompare(b.alert.obligation),
  );
  assignOpenProjects(candidates, activity);
  return candidates.map(({ alert }) => alert);
}

export function summarizeFiscalAlerts(alerts: readonly FiscalAlert[]): FiscalAlertSummary {
  const summary: FiscalAlertSummary = { overdue: 0, critical: 0, warning: 0, upcoming: 0, done: 0 };
  for (const alert of alerts) {
    if (alert.progress === "done") summary.done += 1;
    else summary[alert.severity] += 1;
  }
  return summary;
}
