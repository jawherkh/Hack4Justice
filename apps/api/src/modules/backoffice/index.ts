import { adminUser, project, projectRequirement, session, submission, upload, user } from "@hack4justice/db";
import {
  AdminPermission,
  AppError,
  NotificationType,
  SUBMISSION_STATUSES,
  type SubmissionStatus,
  deriveProcedureStatus,
} from "@hack4justice/shared";
import { and, count, desc, eq, gte, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { Elysia, t } from "elysia";

import { adminGuard } from "../../admin-auth";
import { db } from "../../db";
import { i18n } from "../../i18n/plugin";
import { notify } from "../../notifications/inbox";
import { storage } from "../../storage";

// Ids are opaque: Better Auth and drizzle-seed both mint non-RFC UUID strings.
const idParam = t.Object({ id: t.String({ minLength: 1, maxLength: 64 }) });
const MAX_LIST = 200;
const REVIEW_STATUSES = ["UNDER_REVIEW", "ACCEPTED", "REJECTED"] as const;

/** Staff-only API. Every route resolves the admin session and checks the role. */
export const backofficeModule = new Elysia({ prefix: "/api/admin", tags: ["backoffice"] })
  .use(i18n)
  .use(adminGuard)

  .get("/me", ({ staff }) => staff, {
    admin: AdminPermission.VIEW,
    detail: { summary: "Current staff member" },
  })

  .get(
    "/stats",
    async () => {
      // UTC day buckets on both sides (Postgres date_trunc runs in the session timezone, UTC here).
      const since = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
      since.setUTCHours(0, 0, 0, 0);
      const day = (column: PgColumn) => sql<string>`to_char(date_trunc('day', ${column}), 'YYYY-MM-DD')`;

      const [
        [users],
        [projects],
        [uploads],
        [staff],
        byStatus,
        byDestination,
        byService,
        submissionsByDestination,
        uploadsByStatus,
        signupsByDay,
        projectsByDay,
        submissionsByDay,
        reviewed,
        allProjects,
        allRequirements,
      ] = await Promise.all([
        db.select({ value: count() }).from(user),
        db.select({ value: count() }).from(project),
        db.select({ value: count() }).from(upload),
        db.select({ value: count() }).from(adminUser),
        db.select({ status: submission.status, value: count() }).from(submission).groupBy(submission.status),
        db
          .select({ destination: project.destination, value: count() })
          .from(project)
          .groupBy(project.destination),
        db
          .select({ serviceId: project.serviceId, value: count() })
          .from(project)
          .where(sql`${project.serviceId} is not null`)
          .groupBy(project.serviceId),
        db
          .select({ destination: project.destination, status: submission.status, value: count() })
          .from(submission)
          .innerJoin(project, eq(project.id, submission.projectId))
          .groupBy(project.destination, submission.status),
        db.select({ status: upload.status, value: count() }).from(upload).groupBy(upload.status),
        db
          .select({ day: day(user.createdAt), value: count() })
          .from(user)
          .where(gte(user.createdAt, since))
          .groupBy(day(user.createdAt)),
        db
          .select({ day: day(project.createdAt), value: count() })
          .from(project)
          .where(gte(project.createdAt, since))
          .groupBy(day(project.createdAt)),
        db
          .select({ day: day(submission.submittedAt), value: count() })
          .from(submission)
          .where(gte(submission.submittedAt, since))
          .groupBy(day(submission.submittedAt)),
        db
          .select({
            status: submission.status,
            submittedAt: submission.submittedAt,
            reviewedAt: submission.reviewedAt,
          })
          .from(submission)
          .where(sql`${submission.reviewedAt} is not null`),
        db
          .select({
            id: project.id,
            serviceId: project.serviceId,
            submissionStatus: project.submissionStatus,
          })
          .from(project),
        db
          .select({
            projectId: projectRequirement.projectId,
            requirementId: projectRequirement.requirementId,
            status: projectRequirement.status,
          })
          .from(projectRequirement),
      ]);

      const submissions: Record<string, number> = {};
      for (const row of byStatus) submissions[row.status] = row.value;

      // Procedure status per project (derived, same engine as the web app).
      const procedureStatus: Record<string, number> = {};
      for (const p of allProjects) {
        const status = deriveProcedureStatus(
          p.serviceId,
          allRequirements.filter((r) => r.projectId === p.id),
          p.submissionStatus,
        );
        procedureStatus[status] = (procedureStatus[status] ?? 0) + 1;
      }

      // 30 continuous days so charts have no gaps.
      const days: { day: string; label: string; signups: number; projects: number; submissions: number }[] =
        [];
      const index = (rows: { day: string; value: number }[]) => new Map(rows.map((r) => [r.day, r.value]));
      const s1 = index(signupsByDay);
      const s2 = index(projectsByDay);
      const s3 = index(submissionsByDay);
      for (let i = 0; i < 30; i += 1) {
        const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        // `label` is deliberately not date-like: Eden would otherwise parse it into a Date on the client.
        days.push({
          day: d,
          label: d.slice(5),
          signups: s1.get(d) ?? 0,
          projects: s2.get(d) ?? 0,
          submissions: s3.get(d) ?? 0,
        });
      }

      const durations = reviewed
        .filter((r) => r.reviewedAt)
        .map((r) => (r.reviewedAt!.getTime() - r.submittedAt.getTime()) / (60 * 60 * 1000))
        .sort((a, b) => a - b);
      const median = durations.length ? durations[Math.floor(durations.length / 2)]! : null;
      const decided = reviewed.filter((r) => r.status === "ACCEPTED" || r.status === "REJECTED");
      const acceptanceRate = decided.length
        ? decided.filter((r) => r.status === "ACCEPTED").length / decided.length
        : null;

      return {
        users: users?.value ?? 0,
        projects: projects?.value ?? 0,
        uploads: uploads?.value ?? 0,
        staff: staff?.value ?? 0,
        submissions,
        pendingReview: (submissions["SUBMITTED"] ?? 0) + (submissions["UNDER_REVIEW"] ?? 0),
        review: { medianHours: median, acceptanceRate, reviewedCount: reviewed.length },
        procedureStatus,
        projectsByDestination: byDestination.map((r) => ({ destination: r.destination, value: r.value })),
        projectsByService: byService
          .map((r) => ({ serviceId: r.serviceId!, value: r.value }))
          .sort((a, b) => b.value - a.value),
        submissionsByDestination: submissionsByDestination.map((r) => ({
          destination: r.destination,
          status: r.status,
          value: r.value,
        })),
        uploadsByStatus: uploadsByStatus.map((r) => ({ status: r.status, value: r.value })),
        days,
      };
    },
    {
      admin: AdminPermission.VIEW,
      detail: { summary: "Dashboard counters, breakdowns and 30-day activity" },
    },
  )

  .get(
    "/users",
    async ({ query }) => {
      const filters: SQL[] = [];
      const search = query.search?.trim();
      if (search) {
        const pattern = `%${escapeLike(search)}%`;
        filters.push(or(ilike(user.name, pattern), ilike(user.email, pattern))!);
      }
      const rows = await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          banned: user.banned,
          createdAt: user.createdAt,
          projects: sql<number>`(select count(*) from project p where p.user_id = "user".id)`.mapWith(Number),
          submissions:
            sql<number>`(select count(*) from submission s join project p on p.id = s.project_id where p.user_id = "user".id)`.mapWith(
              Number,
            ),
        })
        .from(user)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(user.createdAt))
        .limit(Math.min(query.limit ?? 50, MAX_LIST));
      return rows;
    },
    {
      admin: AdminPermission.VIEW,
      query: t.Object({ search: t.Optional(t.String({ maxLength: 200 })), limit: t.Optional(t.Numeric()) }),
      detail: { summary: "End users with project and submission counts" },
    },
  )

  .get(
    "/users/:id",
    async ({ params }) => {
      const [row] = await db.select().from(user).where(eq(user.id, params.id)).limit(1);
      if (!row) throw new AppError({ status: 404, code: "not_found" });
      const projects = await db
        .select()
        .from(project)
        .where(eq(project.userId, row.id))
        .orderBy(desc(project.createdAt));
      const projectIds = projects.map((p) => p.id);
      const [requirements, submissions] = await Promise.all([
        projectIds.length
          ? db
              .select({
                projectId: projectRequirement.projectId,
                requirementId: projectRequirement.requirementId,
                status: projectRequirement.status,
              })
              .from(projectRequirement)
              .where(inArray(projectRequirement.projectId, projectIds))
          : Promise.resolve([]),
        projectIds.length
          ? db
              .select()
              .from(submission)
              .where(inArray(submission.projectId, projectIds))
              .orderBy(desc(submission.submittedAt))
          : Promise.resolve([]),
      ]);
      return {
        user: row,
        sessions: await listSessions(row.id),
        projects: projects.map((p) => ({
          ...p,
          status: deriveProcedureStatus(
            p.serviceId,
            requirements.filter((r) => r.projectId === p.id),
            p.submissionStatus,
          ),
        })),
        submissions,
      };
    },
    {
      admin: AdminPermission.VIEW,
      params: idParam,
      detail: { summary: "One end user with their projects and submissions" },
    },
  )

  .get(
    "/submissions",
    async ({ query }) => {
      const filters: SQL[] = [];
      if (query.status && (SUBMISSION_STATUSES as readonly string[]).includes(query.status)) {
        filters.push(eq(submission.status, query.status as SubmissionStatus));
      }
      const search = query.search?.trim();
      if (search) {
        const pattern = `%${escapeLike(search)}%`;
        filters.push(
          or(
            ilike(submission.reference, pattern),
            ilike(project.name, pattern),
            ilike(user.email, pattern),
            ilike(user.name, pattern),
          )!,
        );
      }
      return db
        .select({
          id: submission.id,
          reference: submission.reference,
          serviceId: submission.serviceId,
          status: submission.status,
          receipt: submission.receipt,
          submittedAt: submission.submittedAt,
          reviewedAt: submission.reviewedAt,
          project: { id: project.id, name: project.name, destination: project.destination },
          user: { id: user.id, name: user.name, email: user.email },
        })
        .from(submission)
        .innerJoin(project, eq(project.id, submission.projectId))
        .innerJoin(user, eq(user.id, project.userId))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(submission.submittedAt))
        .limit(Math.min(query.limit ?? 50, MAX_LIST));
    },
    {
      admin: AdminPermission.VIEW,
      query: t.Object({
        status: t.Optional(t.String({ maxLength: 20 })),
        search: t.Optional(t.String({ maxLength: 200 })),
        limit: t.Optional(t.Numeric()),
      }),
      detail: { summary: "All submissions, newest first" },
    },
  )

  .get(
    "/submissions/:id",
    async ({ params }) => {
      const found = await loadSubmission(params.id);
      const uploadIds = found.submission.snapshot.requirements.flatMap((r) =>
        r.upload ? [r.upload.id] : [],
      );
      const files = uploadIds.length
        ? await db
            .select({
              id: upload.id,
              filename: upload.filename,
              storageKey: upload.storageKey,
              status: upload.status,
              size: upload.size,
            })
            .from(upload)
            .where(inArray(upload.id, uploadIds))
        : [];
      const evidence = await Promise.all(
        files.map(async ({ storageKey, ...file }) => ({
          ...file,
          downloadUrl: await storage.presignGet(storageKey),
        })),
      );
      const reviewer = found.submission.reviewedBy
        ? ((
            await db
              .select({ id: adminUser.id, name: adminUser.name })
              .from(adminUser)
              .where(eq(adminUser.id, found.submission.reviewedBy))
              .limit(1)
          )[0] ?? null)
        : null;
      return { ...found, evidence, reviewer };
    },
    {
      admin: AdminPermission.VIEW,
      params: idParam,
      detail: { summary: "Submission with project, user, snapshot and evidence links" },
    },
  )

  .patch(
    "/submissions/:id/review",
    async ({ params, body, staff }) => {
      const found = await loadSubmission(params.id);
      if (!(REVIEW_STATUSES as readonly string[]).includes(body.status)) {
        throw new AppError({
          status: 422,
          code: "validation_error",
          details: [{ path: "/status", message: `Expected one of: ${REVIEW_STATUSES.join(", ")}` }],
        });
      }
      const status = body.status as SubmissionStatus;
      const note = body.note?.trim() || null;
      await db.transaction(async (tx) => {
        await tx
          .update(submission)
          .set({ status, reviewedAt: new Date(), reviewedBy: staff.id, reviewNote: note })
          .where(eq(submission.id, found.submission.id));
        // Only the project's current submission drives the project status.
        const [latest] = await tx
          .select({ id: submission.id })
          .from(submission)
          .where(eq(submission.projectId, found.project.id))
          .orderBy(desc(submission.submittedAt))
          .limit(1);
        if (latest?.id === found.submission.id) {
          await tx.update(project).set({ submissionStatus: status }).where(eq(project.id, found.project.id));
        }
      });
      await notify({
        userId: found.user.id,
        type: NotificationType.SUBMISSION_UPDATED,
        idempotencyKey: `submission:${found.submission.id}:${status}:${Date.now()}`,
        payload: {
          project: found.project.name,
          status,
          reference: found.submission.reference,
          ...(note ? { note } : {}),
        },
        projectId: found.project.id,
      });
      return loadSubmission(params.id);
    },
    {
      admin: AdminPermission.REVIEW_SUBMISSIONS,
      params: idParam,
      body: t.Object({
        status: t.String({ maxLength: 20 }),
        note: t.Optional(t.String({ maxLength: 2000 })),
      }),
      detail: { summary: "Move a submission to under review / accepted / rejected and notify the user" },
    },
  )

  .post(
    "/users/:id/ban",
    async ({ params, body }) => {
      const found = await findUser(params.id);
      const days = body.expiresInDays;
      const banExpires = days && days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
      await db.transaction(async (tx) => {
        await tx
          .update(user)
          .set({ banned: true, banReason: body.reason?.trim() || null, banExpires })
          .where(eq(user.id, found.id));
        // A banned user is signed out everywhere immediately.
        await tx.delete(session).where(eq(session.userId, found.id));
      });
      return findUser(found.id);
    },
    {
      admin: AdminPermission.MANAGE_USERS,
      params: idParam,
      body: t.Object({
        reason: t.Optional(t.String({ maxLength: 500 })),
        /** Omit for a permanent ban. */
        expiresInDays: t.Optional(t.Number({ minimum: 1, maximum: 3650 })),
      }),
      detail: { summary: "Ban an end user (Better Auth admin semantics) and revoke their sessions" },
    },
  )

  .post(
    "/users/:id/unban",
    async ({ params }) => {
      const found = await findUser(params.id);
      await db
        .update(user)
        .set({ banned: false, banReason: null, banExpires: null })
        .where(eq(user.id, found.id));
      return findUser(found.id);
    },
    { admin: AdminPermission.MANAGE_USERS, params: idParam, detail: { summary: "Lift a ban" } },
  )

  .get("/users/:id/sessions", async ({ params }) => listSessions((await findUser(params.id)).id), {
    admin: AdminPermission.VIEW,
    params: idParam,
    detail: { summary: "Active sessions of an end user" },
  })

  .delete(
    "/users/:id/sessions",
    async ({ params, set }) => {
      await db.delete(session).where(eq(session.userId, (await findUser(params.id)).id));
      set.status = 204;
    },
    {
      admin: AdminPermission.MANAGE_USERS,
      params: idParam,
      detail: { summary: "Revoke every session of an end user" },
    },
  )

  .delete(
    "/users/:id/sessions/:sessionId",
    async ({ params, set }) => {
      const found = await findUser(params.id);
      const [deleted] = await db
        .delete(session)
        .where(and(eq(session.id, params.sessionId), eq(session.userId, found.id)))
        .returning({ id: session.id });
      if (!deleted) throw new AppError({ status: 404, code: "not_found" });
      set.status = 204;
    },
    {
      admin: AdminPermission.MANAGE_USERS,
      params: t.Object({
        id: t.String({ minLength: 1, maxLength: 64 }),
        sessionId: t.String({ minLength: 1, maxLength: 64 }),
      }),
      detail: { summary: "Revoke one session of an end user" },
    },
  );

async function findUser(id: string) {
  const [row] = await db.select().from(user).where(eq(user.id, id)).limit(1);
  if (!row) throw new AppError({ status: 404, code: "not_found" });
  return row;
}

async function listSessions(userId: string) {
  return db
    .select({
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
    })
    .from(session)
    .where(eq(session.userId, userId))
    .orderBy(desc(session.updatedAt));
}

async function loadSubmission(id: string) {
  const [row] = await db
    .select({ submission, project, user: { id: user.id, name: user.name, email: user.email } })
    .from(submission)
    .innerJoin(project, eq(project.id, submission.projectId))
    .innerJoin(user, eq(user.id, project.userId))
    .where(eq(submission.id, id))
    .limit(1);
  if (!row) throw new AppError({ status: 404, code: "not_found" });
  return row;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
