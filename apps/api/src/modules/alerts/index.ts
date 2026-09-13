import { project, submission, userProfile } from "@hack4justice/db";
import {
  CompanyStage,
  type FiscalAlertSummary,
  type FiscalAlertsReason,
  type FiscalAlertsView,
} from "@hack4justice/shared";
import { eq, inArray } from "drizzle-orm";
import { Elysia } from "elysia";

import { authGuard } from "../../auth";
import { db } from "../../db";
import { buildFiscalAlerts, summarizeFiscalAlerts } from "../../fiscal/calendar";

/** Fiscal deadlines only apply once the company exists in the registries. */
const REGISTERED_STAGES = new Set<string>([CompanyStage.REGISTERED, CompanyStage.CLOSING]);

type AlertsView = FiscalAlertsView;
type NotApplicableReason = FiscalAlertsReason;

const EMPTY_SUMMARY: FiscalAlertSummary = { overdue: 0, critical: 0, warning: 0, upcoming: 0, done: 0 };

function notApplicable(reason: NotApplicableReason, company: AlertsView["company"]): AlertsView {
  return {
    applicable: false,
    reason,
    company,
    generatedAt: new Date().toISOString(),
    alerts: [],
    summary: EMPTY_SUMMARY,
  };
}

export const alertsModule = new Elysia({ prefix: "/me/alerts", tags: ["alerts"] })
  .use(authGuard)

  .get(
    "/",
    async ({ user }): Promise<AlertsView> => {
      const [profile] = await db.select().from(userProfile).where(eq(userProfile.userId, user.id)).limit(1);
      if (!profile) return notApplicable("no_profile", null);
      const company = {
        name: profile.companyName,
        legalForm: profile.legalForm,
        stage: profile.companyStage,
        taxId: profile.taxId,
      };
      if (!profile.companyName) return notApplicable("no_company", company);
      // No stage recorded: assume the company is active rather than hide every deadline.
      if (profile.companyStage && !REGISTERED_STAGES.has(profile.companyStage)) {
        return notApplicable("not_registered", company);
      }

      const projects = await db
        .select({ id: project.id, serviceId: project.serviceId, createdAt: project.createdAt })
        .from(project)
        .where(eq(project.userId, user.id));
      const submissions =
        projects.length > 0
          ? await db
              .select({
                projectId: submission.projectId,
                serviceId: submission.serviceId,
                submittedAt: submission.submittedAt,
              })
              .from(submission)
              .where(
                inArray(
                  submission.projectId,
                  projects.map((row) => row.id),
                ),
              )
          : [];

      const now = new Date();
      const alerts = buildFiscalAlerts({ legalForm: profile.legalForm }, { projects, submissions }, now);
      return {
        applicable: true,
        reason: null,
        company,
        generatedAt: now.toISOString(),
        alerts,
        summary: summarizeFiscalAlerts(alerts),
      };
    },
    {
      auth: true,
      detail: {
        summary: "Upcoming and overdue fiscal deadlines for my company, with progress from my projects",
      },
    },
  );
