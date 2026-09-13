/**
 * Fiscal calendar alerts: recurring Tunisian tax and registry deadlines for a
 * registered company, computed by the API and rendered by the web app.
 */

export type FiscalObligationId =
  | "MONTHLY_DECLARATION"
  | "EMPLOYER_DECLARATION"
  | "ANNUAL_RETURN"
  | "FINANCIAL_STATEMENTS"
  | "ADVANCE_INSTALLMENT";

export const FISCAL_OBLIGATION_IDS: readonly FiscalObligationId[] = [
  "MONTHLY_DECLARATION",
  "EMPLOYER_DECLARATION",
  "ANNUAL_RETURN",
  "FINANCIAL_STATEMENTS",
  "ADVANCE_INSTALLMENT",
];

export type FiscalAgency = "DGI" | "RNE";
export type FiscalAlertSeverity = "overdue" | "critical" | "warning" | "upcoming";
export type FiscalAlertProgress = "pending" | "in_progress" | "done";

export type FiscalPeriod =
  | { kind: "month"; year: number; month: number }
  | { kind: "year"; year: number }
  | { kind: "installment"; year: number; index: 1 | 2 | 3 };

export interface FiscalAlert {
  /** Stable per deadline: `${obligation}:${dueDate}`. */
  id: string;
  obligation: FiscalObligationId;
  agency: FiscalAgency;
  /** Catalog service the user can prepare in the app, when one exists. */
  serviceId: string | null;
  period: FiscalPeriod;
  /** ISO calendar date, `YYYY-MM-DD`. */
  dueDate: string;
  /** Negative once the deadline has passed. */
  daysLeft: number;
  severity: FiscalAlertSeverity;
  progress: FiscalAlertProgress;
  /** Most recent project for `serviceId`, so the dashboard can deep-link. */
  projectId: string | null;
}

/** Open alerts per severity; fulfilled ones count under `done` only. */
export interface FiscalAlertSummary {
  overdue: number;
  critical: number;
  warning: number;
  upcoming: number;
  done: number;
}

export type FiscalAlertsReason = "no_profile" | "no_company" | "not_registered";

export interface FiscalAlertsView {
  /** False when the profile has no registered company to compute deadlines for. */
  applicable: boolean;
  reason: FiscalAlertsReason | null;
  company: {
    name: string | null;
    legalForm: string | null;
    stage: string | null;
    taxId: string | null;
  } | null;
  generatedAt: string;
  alerts: FiscalAlert[];
  summary: FiscalAlertSummary;
}
