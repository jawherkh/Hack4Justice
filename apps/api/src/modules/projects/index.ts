import { project, type NewProject, type Project } from "@hack4justice/db";
import {
  AppError,
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_DESTINATIONS,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_NAME_MIN_LENGTH,
  isProjectDestination,
  type ProjectDestination,
} from "@hack4justice/shared";
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { authGuard } from "../../auth";
import { db } from "../../db";
import { i18n } from "../../i18n/plugin";

const idParam = t.Object({ id: t.String({ format: "uuid" }) });
const destinationSchema = t.UnionEnum(PROJECT_DESTINATIONS);
// Elysia fills an absent `t.Optional(t.UnionEnum(...))` with the first member,
// so optional destinations are taken as plain strings and checked by hand.
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
      return rows.map(toView);
    },
    {
      auth: true,
      query: t.Object({
        search: t.Optional(t.String({ maxLength: 200 })),
        destination: optionalDestinationSchema,
      }),
      detail: { summary: "List my projects, newest first" },
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
      set.status = 201;
      return toView(row);
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

  .get("/:id", async ({ params, user }) => toView(await findOwned(params.id, user.id)), {
    auth: true,
    params: idParam,
    detail: { summary: "Get one of my projects" },
  })

  .patch(
    "/:id",
    async ({ params, body, user }) => {
      const row = await findOwned(params.id, user.id);
      const patch: Partial<NewProject> = {};
      if (body.name !== undefined) patch.name = body.name.trim();
      if (body.description !== undefined) patch.description = emptyToNull(body.description);
      const destination = parseDestination(body.destination);
      if (destination !== undefined) patch.destination = destination;
      if (Object.keys(patch).length === 0) return toView(row);
      const [updated] = await db.update(project).set(patch).where(eq(project.id, row.id)).returning();
      if (!updated) throw new AppError({ status: 404, code: "project_not_found" });
      return toView(updated);
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

  .delete(
    "/:id",
    async ({ params, user, set }) => {
      const row = await findOwned(params.id, user.id);
      await db.delete(project).where(eq(project.id, row.id));
      set.status = 204;
    },
    { auth: true, params: idParam, detail: { summary: "Delete a project" } },
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

function toView(row: Project) {
  const { userId: _userId, ...view } = row;
  return view;
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

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Escape LIKE wildcards so a search for "100%" does not match everything. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
