import { notification } from "@hack4justice/db";
import { AppError } from "@hack4justice/shared";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { authGuard } from "../../auth";
import { db } from "../../db";
import { i18n } from "../../i18n/plugin";

const idParam = t.Object({ id: t.String({ format: "uuid" }) });
const MAX_LIST = 100;

export const notificationsModule = new Elysia({ prefix: "/notifications", tags: ["notifications"] })
  .use(i18n)
  .use(authGuard)

  .get(
    "/",
    async ({ user, query }) => {
      const limit = Math.min(query.limit ?? 30, MAX_LIST);
      const [items, [unread]] = await Promise.all([
        db
          .select()
          .from(notification)
          .where(eq(notification.userId, user.id))
          .orderBy(desc(notification.createdAt))
          .limit(limit),
        db
          .select({ value: count() })
          .from(notification)
          .where(and(eq(notification.userId, user.id), isNull(notification.readAt))),
      ]);
      return { items: items.map(toView), unreadCount: unread?.value ?? 0 };
    },
    {
      auth: true,
      query: t.Object({ limit: t.Optional(t.Numeric({ minimum: 1, maximum: MAX_LIST })) }),
      detail: { summary: "My notifications, newest first, with the unread count" },
    },
  )

  .post(
    "/:id/read",
    async ({ params, user }) => {
      const [row] = await db
        .update(notification)
        .set({ readAt: new Date() })
        .where(
          and(eq(notification.id, params.id), eq(notification.userId, user.id), isNull(notification.readAt)),
        )
        .returning();
      if (!row) {
        const [existing] = await db
          .select()
          .from(notification)
          .where(and(eq(notification.id, params.id), eq(notification.userId, user.id)))
          .limit(1);
        if (!existing) throw new AppError({ status: 404, code: "not_found" });
        return toView(existing);
      }
      return toView(row);
    },
    { auth: true, params: idParam, detail: { summary: "Mark one notification as read" } },
  )

  .post(
    "/read-all",
    async ({ user }) => {
      await db
        .update(notification)
        .set({ readAt: new Date() })
        .where(and(eq(notification.userId, user.id), isNull(notification.readAt)));
      return { ok: true };
    },
    { auth: true, detail: { summary: "Mark every notification as read" } },
  );

function toView(row: typeof notification.$inferSelect) {
  const { userId: _userId, ...view } = row;
  return view;
}
