import { beforeEach, describe, expect, test, vi } from "vitest";
import { Elysia } from "elysia";
import { SERVICES } from "@hack4justice/shared";
import type { Submission } from "@hack4justice/db";

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  tables: new Map<string, Row[]>(),
  locked: false,
  reads: [] as string[],
  beforeTransaction: () => {},
  queue: Promise.resolve() as Promise<unknown>,
}));
vi.mock("../../auth", async () => {
  const { Elysia } = await import("elysia");
  return { authGuard: new Elysia().macro({ auth: { resolve: () => ({ user: { id: "synthetic-user" } }) } }) };
});
vi.mock("../../admin-auth", async () => {
  const { Elysia } = await import("elysia");
  return {
    adminGuard: new Elysia().macro({ admin: { resolve: () => ({ staff: { id: "synthetic-officer" } }) } }),
  };
});
vi.mock("../../storage", () => ({ storage: {} }));
vi.mock("../../notifications/inbox", () => ({
  notify: vi.fn(async () => {
    if (state.locked) throw new Error("Notification must run after the parent lock is released");
  }),
}));
vi.mock("./export", () => ({ exportSubmission: vi.fn() }));
vi.mock("../../db", async () => {
  const { getTableName } = await import("drizzle-orm");
  const tableName = (table: Parameters<typeof getTableName>[0]) => getTableName(table);
  const db = {
    select: (projection?: Record<string, unknown>) => {
      let table = "";
      let limit: number | undefined;
      let lock = false;
      const query = {
        from: (source: Parameters<typeof getTableName>[0]) => {
          table = tableName(source);
          return query;
        },
        where: () => query,
        innerJoin: () => query,
        limit: (value: number) => {
          limit = value;
          return query;
        },
        orderBy: () => query,
        for: (mode: string) => {
          expect(mode).toBe("update");
          lock = true;
          return query;
        },
        then: (resolve: (value: Row[]) => unknown) => {
          if (lock) {
            expect(table).toBe("project");
            state.locked = true;
          }
          const joined = projection && "submission" in projection;
          if (["project_requirement", "submission"].includes(table) && !joined && !state.locked)
            throw new Error("Checklist and receipt reads must follow the project lock");
          state.reads.push(table);
          if (joined)
            return Promise.resolve(
              structuredClone(
                (state.tables.get("submission") ?? []).slice(0, limit).map((submission) => ({
                  submission,
                  project: state.tables.get("project")![0],
                  user: { id: "synthetic-user" },
                })),
              ),
            ).then(resolve);
          return Promise.resolve(structuredClone((state.tables.get(table) ?? []).slice(0, limit))).then(
            resolve,
          );
        },
      };
      return query;
    },
    update: (table: Parameters<typeof getTableName>[0]) => ({
      set: (patch: Row) => {
        const execute = () => {
          expect(state.locked).toBe(true);
          const rows = state.tables.get(tableName(table)) ?? [];
          // Mutation fixtures target the first requirement or the only project.
          Object.assign(rows[0] ?? {}, patch, { updatedAt: new Date() });
          return structuredClone(rows.slice(0, 1));
        };
        return {
          where: () => ({
            returning: async () => execute(),
            then: (resolve: (rows: Row[]) => unknown) => Promise.resolve(execute()).then(resolve),
          }),
        };
      },
    }),
    insert: (table: Parameters<typeof getTableName>[0]) => ({
      values: (input: Row) => ({
        returning: async () => {
          expect(state.locked).toBe(true);
          const rows = state.tables.get(tableName(table)) ?? [];
          const row = {
            id: `synthetic-record-${rows.length + 1}`,
            status: "SUBMITTED",
            submittedAt: new Date(),
            ...structuredClone(input),
          };
          rows.unshift(row);
          state.tables.set(tableName(table), rows);
          return [structuredClone(row)];
        },
      }),
    }),
    transaction: (run: (transaction: unknown) => Promise<unknown>) => {
      const result = state.queue.then(async () => {
        const saved = structuredClone(state.tables);
        state.beforeTransaction();
        try {
          return await run(db);
        } catch (error) {
          state.tables = saved;
          throw error;
        } finally {
          state.locked = false;
        }
      });
      state.queue = result.catch(() => {});
      return result;
    },
  };
  return { db };
});

import { projectsModule } from "./index";
import { errorHandler } from "../../errors";
import { backofficeModule } from "../backoffice";

const projectId = "00000000-0000-4000-8000-000000000001";
const app = new Elysia().use(errorHandler).use(projectsModule).use(backofficeModule);
const submit = (body: object) =>
  app.handle(
    new Request(`http://localhost/projects/${projectId}/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  const service = SERVICES.RNE_REGISTRATION!;
  state.tables = new Map<string, Row[]>([
    [
      "project",
      [
        {
          id: projectId,
          userId: "synthetic-user",
          name: "Synthetic project",
          destination: "RNE",
          serviceId: "RNE_REGISTRATION",
          submissionStatus: null,
        },
      ],
    ],
    [
      "project_requirement",
      [...service.requirements, ...service.authentication].map((requirementId) => ({
        id: requirementId,
        projectId,
        requirementId,
        status: "VALID",
        value: null,
        uploadId: null,
        note: null,
      })),
    ],
    ["submission", []],
  ]);
  state.reads = [];
  state.locked = false;
  state.beforeTransaction = () => {};
  state.queue = Promise.resolve();
});

describe("atomic project submission recording", () => {
  test("records the locked checklist and returns the same reference for identical retries", async () => {
    const first = await submit({ receipt: " SYNTHETIC-RECEIPT " });
    expect(first.status).toBe(201);
    const record = (await first.json()) as Submission;
    expect(record.receipt).toBe("SYNTHETIC-RECEIPT");
    expect(record.snapshot.requirements).toHaveLength(state.tables.get("project_requirement")!.length);
    expect(state.reads.slice(0, 3)).toEqual(["project", "submission", "project_requirement"]);
    expect(await (await submit({ receipt: "SYNTHETIC-RECEIPT" })).json()).toMatchObject({
      id: record.id,
      reference: record.reference,
    });
    expect(state.tables.get("submission")).toHaveLength(1);
  });

  test("a different receipt or note conflicts instead of silently succeeding", async () => {
    await submit({ receipt: "SYNTHETIC-A", note: "First" });
    for (const body of [
      { receipt: "SYNTHETIC-B", note: "First" },
      { receipt: "SYNTHETIC-A", note: "Changed" },
    ]) {
      const response = await submit(body);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: { code: "idempotency_conflict" } });
    }
    expect(state.tables.get("submission")).toHaveLength(1);
  });

  test("rechecks evidence invalidated immediately before entering the transaction", async () => {
    state.beforeTransaction = () => {
      state.tables.get("project_requirement")![0]!.status = "INVALID";
    };
    expect((await submit({ receipt: "SYNTHETIC-A" })).status).toBe(409);
    expect(state.tables.get("submission")).toHaveLength(0);
    expect(state.tables.get("project")![0]!.submissionStatus).toBeNull();
  });

  test("concurrent duplicate recording creates only one snapshot", async () => {
    const responses = await Promise.all([
      submit({ receipt: "SYNTHETIC-A" }),
      submit({ receipt: "SYNTHETIC-A" }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    expect(state.tables.get("submission")).toHaveLength(1);
  });

  test("explicit keys survive reopening; a new key records the next attempt", async () => {
    const body = { receipt: "SYNTHETIC-A", idempotencyKey: "first" };
    const first = (await (await submit(body)).json()) as Submission;
    state.tables.get("project")![0]!.submissionStatus = null;
    expect(await (await submit(body)).json()).toMatchObject({ id: first.id });
    expect(state.tables.get("project")![0]!.submissionStatus).toBeNull();
    const second = await submit({ receipt: "SYNTHETIC-B", idempotencyKey: "second" });
    expect(second.status).toBe(201);
    expect(state.tables.get("submission")).toHaveLength(2);
    expect((await submit({ ...body, note: "Different" })).status).toBe(409);
  });

  test("does not expose receipts when the owned parent is absent", async () => {
    state.tables.set("project", []);
    expect((await submit({ receipt: "SYNTHETIC-A" })).status).toBe(404);
    expect(state.reads).toEqual(["project"]);
  });

  test("staff review locks the parent first and cannot relock a reopened or changed-service project", async () => {
    await submit({ receipt: "SYNTHETIC-A" });
    const review = () =>
      app.handle(
        new Request("http://localhost/api/admin/submissions/synthetic-record-1/review", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "UNDER_REVIEW" }),
        }),
      );
    expect((await review()).status).toBe(200);
    expect(state.tables.get("project")![0]!.submissionStatus).toBe("UNDER_REVIEW");
    state.tables.get("project")![0]!.submissionStatus = null;
    expect((await review()).status).toBe(200);
    expect(state.tables.get("project")![0]!.submissionStatus).toBeNull();
    Object.assign(state.tables.get("project")![0]!, {
      serviceId: "DIFFERENT",
      submissionStatus: "SUBMITTED",
    });
    expect((await review()).status).toBe(200);
    expect(state.tables.get("project")![0]!.submissionStatus).toBe("SUBMITTED");
  });
});
