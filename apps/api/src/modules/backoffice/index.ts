import {
  adminAccount,
  adminUser,
  project,
  projectRequirement,
  submission,
  upload,
  user,
  type AdminUser,
} from "@hack4justice/db";
import {
  ADMIN_ROLES,
  AdminPermission,
  AdminRole,
  AppError,
  NotificationType,
  SUBMISSION_STATUSES,
  SubmissionStatus,
  deriveProcedureStatus,
  isAdminRole,
} from "@hack4justice/shared";
import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { hashPassword } from "better-auth/crypto";

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
      const [[users], [projects], [uploads], byStatus, [pending]] = await Promise.all([
        db.select({ value: count() }).from(user),
        db.select({ value: count() }).from(project),
        db.select({ value: count() }).from(upload),
        db.select({ status: submission.status, value: count() }).from(submission).groupBy(submission.status),
        db
          .select({ value: count() })
          .from(submission)
          .where(inArray(submission.status, [SubmissionStatus.SUBMITTED, SubmissionStatus.UNDER_REVIEW])),
      ]);
      const submissions: Record<string, number> = {};
      for (const row of byStatus) submissions[row.status] = row.value;
      return {
        users: users?.value ?? 0,
        projects: projects?.value ?? 0,
        uploads: uploads?.value ?? 0,
        submissions,
        pendingReview: pending?.value ?? 0,
      };
    },
    { admin: AdminPermission.VIEW, detail: { summary: "Dashboard counters" } },
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

  .get(
    "/staff",
    async () =>
      db
        .select({
          id: adminUser.id,
          name: adminUser.name,
          email: adminUser.email,
          role: adminUser.role,
          createdAt: adminUser.createdAt,
        })
        .from(adminUser)
        .orderBy(desc(adminUser.createdAt)),
    { admin: AdminPermission.MANAGE_STAFF, detail: { summary: "Staff accounts" } },
  )

  .post(
    "/staff",
    async ({ body, set }) => {
      const role = body.role;
      if (!isAdminRole(role))
        throw new AppError({
          status: 422,
          code: "validation_error",
          details: [{ path: "/role", message: `Expected one of: ${ADMIN_ROLES.join(", ")}` }],
        });
      const [existing] = await db
        .select({ id: adminUser.id })
        .from(adminUser)
        .where(eq(adminUser.email, body.email.toLowerCase()))
        .limit(1);
      if (existing) throw new AppError({ status: 409, code: "email_taken" });
      const password = await hashPassword(body.password);
      const created = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(adminUser)
          .values({
            name: body.name.trim(),
            email: body.email.toLowerCase(),
            emailVerified: true,
            role,
          })
          .returning();
        // Credential account in Better Auth's format so the panel login works.
        await tx.insert(adminAccount).values({
          userId: row!.id,
          providerId: "credential",
          accountId: row!.id,
          password,
          updatedAt: new Date(),
        });
        return row!;
      });
      set.status = 201;
      return toStaff(created);
    },
    {
      admin: AdminPermission.MANAGE_STAFF,
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 120 }),
        email: t.String({ format: "email", maxLength: 200 }),
        password: t.String({ minLength: 10, maxLength: 200 }),
        role: t.String({ maxLength: 20 }),
      }),
      detail: { summary: "Create a staff account" },
    },
  )

  .patch(
    "/staff/:id",
    async ({ params, body, staff }) => {
      const patch: Partial<AdminUser> = {};
      if (body.name !== undefined) patch.name = body.name.trim();
      if (body.role !== undefined) {
        if (!isAdminRole(body.role))
          throw new AppError({
            status: 422,
            code: "validation_error",
            details: [{ path: "/role", message: `Expected one of: ${ADMIN_ROLES.join(", ")}` }],
          });
        if (params.id === staff.id && body.role !== AdminRole.SUPERADMIN)
          throw new AppError({ status: 409, code: "cannot_demote_self" });
        patch.role = body.role;
      }
      if (Object.keys(patch).length === 0) throw new AppError({ status: 422, code: "validation_error" });
      const [updated] = await db.update(adminUser).set(patch).where(eq(adminUser.id, params.id)).returning();
      if (!updated) throw new AppError({ status: 404, code: "not_found" });
      return toStaff(updated);
    },
    {
      admin: AdminPermission.MANAGE_STAFF,
      params: idParam,
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
        role: t.Optional(t.String({ maxLength: 20 })),
      }),
      detail: { summary: "Rename a staff member or change their role" },
    },
  )

  .delete(
    "/staff/:id",
    async ({ params, staff, set }) => {
      if (params.id === staff.id) throw new AppError({ status: 409, code: "cannot_delete_self" });
      const [deleted] = await db
        .delete(adminUser)
        .where(eq(adminUser.id, params.id))
        .returning({ id: adminUser.id });
      if (!deleted) throw new AppError({ status: 404, code: "not_found" });
      set.status = 204;
    },
    { admin: AdminPermission.MANAGE_STAFF, params: idParam, detail: { summary: "Remove a staff account" } },
  );

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

function toStaff(row: AdminUser) {
  return { id: row.id, name: row.name, email: row.email, role: row.role, createdAt: row.createdAt };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
