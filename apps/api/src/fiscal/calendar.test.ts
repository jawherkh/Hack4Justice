import { describe, expect, it } from "vitest";

import { buildFiscalAlerts, severityFor, summarizeFiscalAlerts, type FiscalAlert } from "./calendar";

const NO_ACTIVITY = { projects: [], submissions: [] };
const at = (iso: string) => new Date(`${iso}T09:00:00Z`);
const byId = (alerts: FiscalAlert[], id: string) => alerts.find((alert) => alert.id === id);

describe("buildFiscalAlerts", () => {
  it("lists the bilan deposit before 30 April with the year it covers", () => {
    const alerts = buildFiscalAlerts({ legalForm: "sarl" }, NO_ACTIVITY, at("2026-04-01"));
    const bilan = byId(alerts, "FINANCIAL_STATEMENTS:2026-04-30");
    expect(bilan).toMatchObject({
      agency: "RNE",
      period: { kind: "year", year: 2025 },
      daysLeft: 29,
      severity: "warning",
      progress: "pending",
    });
  });

  it("uses company deadlines for legal persons and sole-trader deadlines for EI", () => {
    const company = buildFiscalAlerts({ legalForm: "sarl" }, NO_ACTIVITY, at("2026-03-01"));
    expect(byId(company, "MONTHLY_DECLARATION:2026-03-28")?.period).toEqual({
      kind: "month",
      year: 2026,
      month: 2,
    });
    expect(byId(company, "ANNUAL_RETURN:2026-03-25")).toBeDefined();
    expect(byId(company, "ANNUAL_RETURN:2026-04-25")).toBeUndefined();

    const soleTrader = buildFiscalAlerts({ legalForm: "ei" }, NO_ACTIVITY, at("2026-03-01"));
    expect(byId(soleTrader, "MONTHLY_DECLARATION:2026-03-15")).toBeDefined();
    expect(byId(soleTrader, "MONTHLY_DECLARATION:2026-03-28")).toBeUndefined();
    expect(byId(soleTrader, "ANNUAL_RETURN:2026-04-25")).toBeDefined();
  });

  it("treats an unknown legal form like a company", () => {
    const alerts = buildFiscalAlerts({ legalForm: null }, NO_ACTIVITY, at("2026-03-01"));
    expect(byId(alerts, "MONTHLY_DECLARATION:2026-03-28")).toBeDefined();
    expect(byId(alerts, "ANNUAL_RETURN:2026-03-25")).toBeDefined();
  });

  it("keeps recent overdue deadlines and drops those outside the window", () => {
    const alerts = buildFiscalAlerts({ legalForm: "sa" }, NO_ACTIVITY, at("2026-09-13"), {
      pastDays: 60,
      futureDays: 180,
    });
    expect(alerts.map((alert) => alert.dueDate)).toEqual([...alerts.map((alert) => alert.dueDate)].sort());
    expect(byId(alerts, "MONTHLY_DECLARATION:2026-08-28")).toMatchObject({
      daysLeft: -16,
      severity: "overdue",
    });
    expect(byId(alerts, "MONTHLY_DECLARATION:2026-06-28")).toBeUndefined();
    expect(byId(alerts, "ADVANCE_INSTALLMENT:2026-12-25")).toMatchObject({
      period: { kind: "installment", index: 3 },
    });
    expect(byId(alerts, "FINANCIAL_STATEMENTS:2027-04-30")).toBeUndefined();
    expect(byId(alerts, "MONTHLY_DECLARATION:2027-01-28")).toMatchObject({
      period: { kind: "month", year: 2026, month: 12 },
    });
  });

  it("marks a deadline done when a submission for its service lands in its filing window", () => {
    const activity = {
      projects: [{ id: "p1", serviceId: "DGI_MONTHLY_DECLARATION", createdAt: at("2026-08-20") }],
      submissions: [{ projectId: "p1", serviceId: "DGI_MONTHLY_DECLARATION", submittedAt: at("2026-09-05") }],
    };
    const alerts = buildFiscalAlerts({ legalForm: "sarl" }, activity, at("2026-09-13"));
    expect(byId(alerts, "MONTHLY_DECLARATION:2026-09-28")).toMatchObject({
      progress: "done",
      projectId: "p1",
    });
    // A submitted project is not reused for other periods.
    expect(byId(alerts, "MONTHLY_DECLARATION:2026-08-28")).toMatchObject({
      progress: "pending",
      projectId: null,
    });
    expect(byId(alerts, "MONTHLY_DECLARATION:2026-10-28")).toMatchObject({
      progress: "pending",
      projectId: null,
    });
  });

  it("attaches an unsubmitted project to the first open deadline whose window was still open at creation", () => {
    const activity = {
      projects: [
        { id: "old", serviceId: "DGI_MONTHLY_DECLARATION", createdAt: at("2026-08-10") },
        { id: "new", serviceId: "DGI_MONTHLY_DECLARATION", createdAt: at("2026-09-10") },
        { id: "other", serviceId: "DGI_ANNUAL_RETURN", createdAt: at("2026-09-10") },
      ],
      submissions: [],
    };
    const alerts = buildFiscalAlerts({ legalForm: "sarl" }, activity, at("2026-09-13"));
    // Window for July's declaration is August: the project created 10 August targets it.
    expect(byId(alerts, "MONTHLY_DECLARATION:2026-08-28")).toMatchObject({
      progress: "in_progress",
      projectId: "old",
    });
    // Created 10 September: August's declaration (window September) is the first open one.
    expect(byId(alerts, "MONTHLY_DECLARATION:2026-09-28")).toMatchObject({
      progress: "in_progress",
      projectId: "new",
    });
    // One project marks one period only.
    expect(byId(alerts, "MONTHLY_DECLARATION:2026-10-28")).toMatchObject({
      progress: "pending",
      projectId: null,
    });
    // No annual-return deadline in the window: the project stays unassigned without error.
    expect(alerts.some((alert) => alert.projectId === "other")).toBe(false);
  });

  it("leaves obligations without an app service pending", () => {
    const alerts = buildFiscalAlerts({ legalForm: "sarl" }, NO_ACTIVITY, at("2026-02-01"));
    expect(byId(alerts, "EMPLOYER_DECLARATION:2026-02-28")).toMatchObject({
      serviceId: null,
      progress: "pending",
    });
  });
});

describe("severityFor", () => {
  it("grades by days left", () => {
    expect(severityFor(-1)).toBe("overdue");
    expect(severityFor(0)).toBe("critical");
    expect(severityFor(7)).toBe("critical");
    expect(severityFor(8)).toBe("warning");
    expect(severityFor(30)).toBe("warning");
    expect(severityFor(31)).toBe("upcoming");
  });
});

describe("summarizeFiscalAlerts", () => {
  it("counts fulfilled alerts under done only", () => {
    const alerts = buildFiscalAlerts(
      { legalForm: "sarl" },
      {
        projects: [{ id: "p1", serviceId: "DGI_MONTHLY_DECLARATION", createdAt: at("2026-08-01") }],
        submissions: [
          { projectId: "p1", serviceId: "DGI_MONTHLY_DECLARATION", submittedAt: at("2026-08-10") },
        ],
      },
      at("2026-09-13"),
    );
    const summary = summarizeFiscalAlerts(alerts);
    expect(summary.done).toBe(1);
    // July's declaration (due 28 July) had no submission: overdue and still counted.
    expect(summary.overdue).toBe(1);
    expect(summary.overdue + summary.critical + summary.warning + summary.upcoming + summary.done).toBe(
      alerts.length,
    );
  });
});
