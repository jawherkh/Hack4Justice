import {
  project,
  projectRequirement,
  submission,
  upload,
  type NewProject,
  type SubmissionSnapshot,
  type Project,
  type ProjectRequirement,
} from "@hack4justice/db";
import {
  AppError,
  NotificationType,
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_DESTINATIONS,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_NAME_MIN_LENGTH,
  REQUIREMENT_STATUSES,
  REQUIREMENTS,
  RequirementStatus,
  SERVICES,
  SUBMISSION_STATUSES,
  deriveProcedureStatus,
  isProjectDestination,
  isServiceId,
  serviceRequirementIds,
  waivableRequirementIds,
  type ProjectDestination,
  type SubmissionStatus,
} from "@hack4justice/shared";
import { and, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { Elysia, t } from "elysia";

import { authGuard } from "../../auth";
import { db } from "../../db";
import { i18n } from "../../i18n/plugin";
import { notify } from "../../notifications/inbox";

const idParam = t.Object({ id: t.String({ format: "uuid" }) });
const destinationSchema = t.UnionEnum(PROJECT_DESTINATIONS);
// Elysia fills an absent `t.Optional(t.UnionEnum(...))` with the first member,
// so optional enums are taken as plain strings and checked by hand.
const optionalDestinationSchema = t.Optional(t.String({ maxLength: 8 }));
const nameSchema = t.String({ minLength: PROJECT_NAME_MIN_LENGTH, maxLength: PROJECT_NAME_MAX_LENGTH });
const descriptionSchema = t.String({ maxLength: PROJECT_DESCRIPTION_MAX_LENGTH });

export const projectsModule = new Elysia({ prefix: "/projects", tags: ["projects"] })
  .use(i18n)
  .use(authGuard)

  .get(
    "/",
    async ({ user, query }) => {
      const filters: SQL[] = [eq(project.userId, user.id)];
      const destination = parseDestination(query.destination);
      if (destination) filters.push(eq(project.destination, destination));
      const search = query.search?.trim();
      if (search) {
        const pattern = `%${escapeLike(search)}%`;
        filters.push(or(ilike(project.name, pattern), ilike(project.description, pattern))!);
      }
      const rows = await db
        .select()
        .from(project)
        .where(and(...filters))
        .orderBy(desc(project.createdAt));
      if (rows.length === 0) return [];
      const requirements = await db
        .select({
          projectId: projectRequirement.projectId,
          requirementId: projectRequirement.requirementId,
          status: projectRequirement.status,
        })
        .from(projectRequirement)
        .where(
          inArray(
            projectRequirement.projectId,
            rows.map((row) => row.id),
          ),
        );
      return rows.map((row) =>
        toSummary(
          row,
          requirements.filter((r) => r.projectId === row.id),
        ),
      );
    },
    {
      auth: true,
      query: t.Object({
        search: t.Optional(t.String({ maxLength: 200 })),
        destination: optionalDestinationSchema,
      }),
      detail: { summary: "List my projects, newest first, with their procedure status" },
    },
  )

  .post(
    "/",
    async ({ body, user, set }) => {
      const values: NewProject = {
        userId: user.id,
        name: body.name.trim(),
        description: emptyToNull(body.description),
        destination: body.destination,
      };
      const [row] = await db.insert(project).values(values).returning();
      if (!row) throw new AppError({ status: 500, code: "internal_error" });
      await notify({
        userId: user.id,
        type: NotificationType.PROJECT_CREATED,
        idempotencyKey: `project:${row.id}:created`,
        payload: { project: row.name },
        projectId: row.id,
      });
      set.status = 201;
      return toSummary(row, []);
    },
    {
      auth: true,
      body: t.Object({
        name: nameSchema,
        destination: destinationSchema,
        description: t.Optional(descriptionSchema),
      }),
      detail: { summary: "Create a project for a given destination (RNE or DGI)" },
    },
  )

  .get("/:id", async ({ params, user }) => toDetail(await findOwned(params.id, user.id)), {
    auth: true,
    params: idParam,
    detail: { summary: "Get a project with its requirements" },
  })

  .patch(
    "/:id",
    async ({ params, body, user }) => {
      const row = await findOwned(params.id, user.id);
      const patch: Partial<NewProject> = {};
      if (body.name !== undefined) patch.name = body.name.trim();
      if (body.description !== undefined) patch.description = emptyToNull(body.description);
      const destination = parseDestination(body.destination);
      if (destination !== undefined && destination !== row.destination) {
        // Changing agency invalidates the chosen service and its checklist.
        patch.destination = destination;
        patch.serviceId = null;
        patch.onboardedAt = null;
        patch.submissionStatus = null;
        await db.delete(projectRequirement).where(eq(projectRequirement.projectId, row.id));
      }
      if (Object.keys(patch).length === 0) return toDetail(row);
      const [updated] = await db.update(project).set(patch).where(eq(project.id, row.id)).returning();
      if (!updated) throw new AppError({ status: 404, code: "project_not_found" });
      return toDetail(updated);
    },
    {
      auth: true,
      params: idParam,
      body: t.Object({
        name: t.Optional(nameSchema),
        destination: optionalDestinationSchema,
        description: t.Optional(descriptionSchema),
      }),
      detail: { summary: "Rename a project or change its destination" },
    },
  )

  .post(
    "/:id/onboarding",
    async ({ params, body, user }) => {
      const row = await findOwned(params.id, user.id);
      if (!isServiceId(body.serviceId) || SERVICES[body.serviceId]!.destination !== row.destination) {
        throw new AppError({
          status: 422,
          code: "validation_error",
          details: [{ path: "/serviceId", message: `Expected a ${row.destination} service` }],
        });
      }
      const waivable = new Set(waivableRequirementIds(body.serviceId));
      const waived = new Set((body.waived ?? []).filter((id) => waivable.has(id)));
      await db.transaction(async (tx) => {
        await tx.delete(projectRequirement).where(eq(projectRequirement.projectId, row.id));
        await tx.insert(projectRequirement).values(
          serviceRequirementIds(body.serviceId).map((requirementId) => ({
            projectId: row.id,
            requirementId,
            status: waived.has(requirementId) ? RequirementStatus.NOT_APPLICABLE : RequirementStatus.MISSING,
          })),
        );
        await tx
          .update(project)
          .set({ serviceId: body.serviceId, onboardedAt: new Date(), submissionStatus: null })
          .where(eq(project.id, row.id));
      });
      const onboarded = await findOwned(row.id, user.id);
      await notify({
        userId: user.id,
        type: NotificationType.PROCEDURE_STARTED,
        idempotencyKey: `project:${row.id}:procedure-started:${onboarded.onboardedAt?.toISOString() ?? ""}`,
        payload: { project: row.name, service: body.serviceId },
        projectId: row.id,
      });
      return toDetail(onboarded);
    },
    {
      auth: true,
      params: idParam,
      body: t.Object({
        serviceId: t.String({ maxLength: 64 }),
        /** Optional / conditional requirements the user declares not applicable. */
        waived: t.Optional(t.Array(t.String({ maxLength: 64 }), { maxItems: 32 })),
      }),
      detail: { summary: "Pick the service for a project and seed its requirement checklist" },
    },
  )

  .put(
    "/:id/requirements/:requirementId",
    async ({ params, body, user }) => {
      const row = await findOwned(params.id, user.id);
      const [current] = await db
        .select()
        .from(projectRequirement)
        .where(
          and(
            eq(projectRequirement.projectId, row.id),
            eq(projectRequirement.requirementId, params.requirementId),
          ),
        )
        .limit(1);
      if (!current) throw new AppError({ status: 404, code: "requirement_not_found" });

      const patch: Partial<ProjectRequirement> = {};
      if (body.uploadId !== undefined) {
        if (body.uploadId === null) patch.uploadId = null;
        else {
          const [file] = await db
            .select({ id: upload.id })
            .from(upload)
            .where(and(eq(upload.id, body.uploadId), eq(upload.userId, user.id)))
            .limit(1);
          if (!file) throw new AppError({ status: 404, code: "upload_not_found" });
          patch.uploadId = file.id;
          // Attaching a file to a project also files it under that project.
          await db.update(upload).set({ projectId: row.id }).where(eq(upload.id, file.id));
        }
      }
      if (body.value !== undefined) patch.value = body.value;
      if (body.note !== undefined) patch.note = emptyToNull(body.note);
      const status = parseRequirementStatus(body.status);
      if (status !== undefined) patch.status = status;
      else if (
        (patch.uploadId || body.value) &&
        (current.status === RequirementStatus.MISSING ||
          current.status === RequirementStatus.NOT_APPLICABLE ||
          current.status === RequirementStatus.WAIVED)
      ) {
        // Supplying evidence for an item implies it applies after all.
        patch.status = RequirementStatus.PROVIDED;
      }
      const before = deriveProcedureStatus(
        row.serviceId,
        await listRequirements(row.id),
        row.submissionStatus,
      );
      const [updated] = await db
        .update(projectRequirement)
        .set(patch)
        .where(eq(projectRequirement.id, current.id))
        .returning();
      const after = deriveProcedureStatus(
        row.serviceId,
        await listRequirements(row.id),
        row.submissionStatus,
      );
      if (before !== "READY_FOR_SUBMISSION" && after === "READY_FOR_SUBMISSION") {
        await notify({
          userId: user.id,
          type: NotificationType.PROCEDURE_READY,
          // One notification per time the checklist becomes complete, keyed on the change that completed it.
          idempotencyKey: `project:${row.id}:ready:${updated!.updatedAt.toISOString()}`,
          payload: { project: row.name },
          projectId: row.id,
        });
      }
      return updated!;
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: "uuid" }), requirementId: t.String({ maxLength: 64 }) }),
      body: t.Object({
        status: t.Optional(t.String({ maxLength: 20 })),
        value: t.Optional(t.Record(t.String({ maxLength: 64 }), t.String({ maxLength: 2000 }))),
        uploadId: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
        note: t.Optional(t.String({ maxLength: 2000 })),
      }),
      detail: { summary: "Provide, validate or waive a requirement" },
    },
  )

  .patch(
    "/:id/submission",
    async ({ params, body, user }) => {
      const row = await findOwned(params.id, user.id);
      const status = parseSubmissionStatus(body.status);
      if (status !== null && row.submissionStatus === null) {
        // Official submission is only recordable once preparation is complete.
        const requirements = await listRequirements(row.id);
        const derived = deriveProcedureStatus(row.serviceId, requirements, null);
        if (derived !== "READY_FOR_SUBMISSION")
          throw new AppError({ status: 409, code: "project_not_ready" });
      }
      const [updated] = await db
        .update(project)
        .set({ submissionStatus: status })
        .where(eq(project.id, row.id))
        .returning();
      if (status) {
        // Keep the latest submission record in step with the declared status.
        const [latest] = await db
          .select({ id: submission.id })
          .from(submission)
          .where(eq(submission.projectId, row.id))
          .orderBy(desc(submission.submittedAt))
          .limit(1);
        if (latest) await db.update(submission).set({ status }).where(eq(submission.id, latest.id));
      }
      if (status) {
        await notify({
          userId: user.id,
          type: NotificationType.SUBMISSION_UPDATED,
          idempotencyKey: `project:${row.id}:submission:${status}:${updated!.updatedAt.toISOString()}`,
          payload: { project: row.name, status },
          projectId: row.id,
        });
      }
      return toDetail(updated!);
    },
    {
      auth: true,
      params: idParam,
      body: t.Object({ status: t.Nullable(t.String({ maxLength: 20 })) }),
      detail: {
        summary: "Record what happened on the official channel (the app never submits by itself)",
      },
    },
  )

  .get(
    "/:id/submissions",
    async ({ params, user }) => {
      const row = await findOwned(params.id, user.id);
      return listSubmissions(row.id);
    },
    { auth: true, params: idParam, detail: { summary: "Submission history of a project" } },
  )

  .post(
    "/:id/submissions",
    async ({ params, body, user, set }) => {
      const row = await findOwned(params.id, user.id);
      if (!row.serviceId) throw new AppError({ status: 409, code: "project_not_ready" });
      if (row.submissionStatus !== null) throw new AppError({ status: 409, code: "submission_in_progress" });
      const requirements = await listRequirements(row.id);
      if (deriveProcedureStatus(row.serviceId, requirements, null) !== "READY_FOR_SUBMISSION") {
        throw new AppError({ status: 409, code: "project_not_ready" });
      }
      const uploadIds = requirements.flatMap((r) => (r.uploadId ? [r.uploadId] : []));
      const files =
        uploadIds.length > 0
          ? await db
              .select({ id: upload.id, filename: upload.filename })
              .from(upload)
              .where(inArray(upload.id, uploadIds))
          : [];
      const fileById = new Map(files.map((f) => [f.id, f]));
      const snapshot: SubmissionSnapshot = {
        serviceId: row.serviceId,
        requirements: requirements.map((r) => ({
          requirementId: r.requirementId,
          status: r.status,
          upload: r.uploadId ? (fileById.get(r.uploadId) ?? null) : null,
          value: r.value ?? null,
          note: r.note,
        })),
      };
      const created = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(submission)
          .values({
            projectId: row.id,
            reference: newReference(),
            serviceId: row.serviceId!,
            receipt: emptyToNull(body.receipt),
            note: emptyToNull(body.note),
            snapshot,
          })
          .returning();
        await tx.update(project).set({ submissionStatus: "SUBMITTED" }).where(eq(project.id, row.id));
        return inserted!;
      });
      await notify({
        userId: user.id,
        type: NotificationType.SUBMISSION_UPDATED,
        idempotencyKey: `submission:${created.id}:SUBMITTED`,
        payload: { project: row.name, status: "SUBMITTED", reference: created.reference },
        projectId: row.id,
      });
      set.status = 201;
      return created;
    },
    {
      auth: true,
      params: idParam,
      body: t.Object({
        receipt: t.Optional(t.String({ maxLength: 200 })),
        note: t.Optional(t.String({ maxLength: 2000 })),
      }),
      detail: {
        summary: "Record an official submission: snapshots the checklist and moves the project to SUBMITTED",
      },
    },
  )

  .get(
    "/:id/uploads",
    async ({ params, user }) => {
      const row = await findOwned(params.id, user.id);
      const rows = await db
        .select()
        .from(upload)
        .where(and(eq(upload.userId, user.id), eq(upload.projectId, row.id)))
        .orderBy(desc(upload.createdAt));
      return rows.map(({ storageKey: _k, userId: _u, text: _t, ...view }) => view);
    },
    { auth: true, params: idParam, detail: { summary: "Files uploaded into this project" } },
  )

  .delete(
    "/:id",
    async ({ params, user, set }) => {
      const row = await findOwned(params.id, user.id);
      await db.transaction(async (tx) => {
        await tx.update(upload).set({ projectId: null }).where(eq(upload.projectId, row.id));
        await tx.delete(project).where(eq(project.id, row.id));
      });
      set.status = 204;
    },
    { auth: true, params: idParam, detail: { summary: "Delete a project (files are kept, unfiled)" } },
  );

/** Project owned by `userId`, or 404. Never reveals whether another user's id exists. */
async function findOwned(id: string, userId: string): Promise<Project> {
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, id), eq(project.userId, userId)))
    .limit(1);
  if (!row) throw new AppError({ status: 404, code: "project_not_found" });
  return row;
}

async function listSubmissions(projectId: string) {
  return db
    .select()
    .from(submission)
    .where(eq(submission.projectId, projectId))
    .orderBy(desc(submission.submittedAt));
}

/** Short, unique, human-readable reference: date plus 6 random hex chars. */
function newReference(): string {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `H4J-${day}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

async function listRequirements(projectId: string) {
  return db.select().from(projectRequirement).where(eq(projectRequirement.projectId, projectId));
}

function toSummary(row: Project, requirements: { requirementId: string; status: RequirementStatus }[]) {
  const { userId: _userId, ...view } = row;
  return { ...view, status: deriveProcedureStatus(row.serviceId, requirements, row.submissionStatus) };
}

async function toDetail(row: Project) {
  const requirements = await listRequirements(row.id);
  const uploadIds = requirements.flatMap((r) => (r.uploadId ? [r.uploadId] : []));
  const files =
    uploadIds.length > 0
      ? await db
          .select({ id: upload.id, filename: upload.filename, status: upload.status })
          .from(upload)
          .where(inArray(upload.id, uploadIds))
      : [];
  const byId = new Map(files.map((f) => [f.id, f]));
  const submissions = await listSubmissions(row.id);
  return {
    ...toSummary(row, requirements),
    submissions,
    requirements: requirements
      .map((r) => ({ ...r, upload: r.uploadId ? (byId.get(r.uploadId) ?? null) : null }))
      .sort(
        (a, b) =>
          Object.keys(REQUIREMENTS).indexOf(a.requirementId) -
          Object.keys(REQUIREMENTS).indexOf(b.requirementId),
      ),
  };
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Optional destination from a query string or PATCH body; 422 on anything but RNE / DGI. */
function parseDestination(value: string | undefined): ProjectDestination | undefined {
  if (value === undefined || value === "") return undefined;
  if (!isProjectDestination(value)) {
    throw new AppError({
      status: 422,
      code: "validation_error",
      details: [{ path: "/destination", message: `Expected one of: ${PROJECT_DESTINATIONS.join(", ")}` }],
    });
  }
  return value;
}

function parseRequirementStatus(value: string | undefined): RequirementStatus | undefined {
  if (value === undefined) return undefined;
  if (!(REQUIREMENT_STATUSES as readonly string[]).includes(value)) {
    throw new AppError({
      status: 422,
      code: "validation_error",
      details: [{ path: "/status", message: `Expected one of: ${REQUIREMENT_STATUSES.join(", ")}` }],
    });
  }
  return value as RequirementStatus;
}

function parseSubmissionStatus(value: string | null): SubmissionStatus | null {
  if (value === null) return null;
  if (!(SUBMISSION_STATUSES as readonly string[]).includes(value)) {
    throw new AppError({
      status: 422,
      code: "validation_error",
      details: [{ path: "/status", message: `Expected one of: ${SUBMISSION_STATUSES.join(", ")}` }],
    });
  }
  return value as SubmissionStatus;
}

/** Escape LIKE wildcards so a search for "100%" does not match everything. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
