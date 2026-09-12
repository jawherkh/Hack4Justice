import { upload, type NewUpload, type Upload } from "@hack4justice/db";
import { AppError, UploadStatus } from "@hack4justice/shared";
import { and, desc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { authGuard } from "../../auth";
import { db } from "../../db";
import { i18n } from "../../i18n/plugin";
import { logger } from "../../logger";
import { tika, TikaError } from "../../ocr/index";
import { storage } from "../../storage";

const PDF_CONTENT_TYPE = "application/pdf";
const PDF_MAGIC = "%PDF-";
const MAX_PDF_SIZE = "25m";

const idParam = t.Object({ id: t.String({ format: "uuid" }) });
const languagesSchema = t.String({ pattern: "^[a-z_]{3,7}(\\+[a-z_]{3,7})*$" });

export const uploadsModule = new Elysia({ prefix: "/uploads", tags: ["uploads"] })
  .use(i18n)
  .use(authGuard)

  .post(
    "/",
    async ({ body, user, set }) => {
      const bytes = new Uint8Array(await body.file.arrayBuffer());
      if (!isPdf(bytes)) throw new AppError({ status: 415, code: "invalid_pdf" });

      const id = crypto.randomUUID();
      const storageKey = `users/${user.id}/uploads/${id}.pdf`;

      await storage.put({
        key: storageKey,
        body: bytes,
        contentType: PDF_CONTENT_TYPE,
        metadata: { filename: encodeURIComponent(body.file.name), userId: user.id },
      });
      const [row] = await db
        .insert(upload)
        .values({
          id,
          userId: user.id,
          storageKey,
          filename: body.file.name,
          contentType: PDF_CONTENT_TYPE,
          size: bytes.byteLength,
          status: UploadStatus.PROCESSING,
        })
        .returning();
      if (!row) throw new AppError({ status: 500, code: "internal_error" });

      // Extraction runs after the response; clients poll GET /uploads/:id.
      void extractInBackground(id, bytes, body.languages);

      set.status = 201;
      return toView(row);
    },
    {
      auth: true,
      body: t.Object({
        file: t.File({ type: PDF_CONTENT_TYPE, maxSize: MAX_PDF_SIZE }),
        /** Tesseract language codes joined with "+", default "fra+eng". */
        languages: t.Optional(languagesSchema),
      }),
      detail: { summary: "Upload a PDF; text extraction (OCR for scanned pages) starts in the background" },
    },
  )

  .post(
    "/:id/extract",
    async ({ params, body, user, set }) => {
      const row = await findOwned(params.id, user.id);
      if (row.status === UploadStatus.PROCESSING) throw new AppError({ status: 409, code: "extraction_in_progress" });

      const bytes = await storage.get(row.storageKey);
      const updated = await updateUpload(row.id, { status: UploadStatus.PROCESSING, error: null });
      void extractInBackground(row.id, bytes, body?.languages);

      set.status = 202;
      return toView(updated);
    },
    {
      auth: true,
      params: idParam,
      body: t.Optional(t.Object({ languages: t.Optional(languagesSchema) })),
      detail: { summary: "Re-run text extraction for an upload" },
    },
  )

  .get(
    "/",
    async ({ user }) => {
      const rows = await db.select().from(upload).where(eq(upload.userId, user.id)).orderBy(desc(upload.createdAt));
      return rows.map(toView);
    },
    { auth: true, detail: { summary: "List my uploads" } },
  )

  .get(
    "/:id",
    async ({ params, user }) => {
      const row = await findOwned(params.id, user.id);
      const downloadUrl = await storage.presignGet(row.storageKey);
      return { ...toView(row), downloadUrl };
    },
    { auth: true, params: idParam, detail: { summary: "Get an upload with a temporary download URL" } },
  )

  .delete(
    "/:id",
    async ({ params, user, set }) => {
      const row = await findOwned(params.id, user.id);
      await storage.delete(row.storageKey);
      await db.delete(upload).where(eq(upload.id, row.id));
      set.status = 204;
    },
    { auth: true, params: idParam, detail: { summary: "Delete an upload" } },
  );

/**
 * Runs Tika and stores the outcome on the row. Never throws: it runs detached
 * from the request, so failures are persisted as FAILED and logged instead.
 */
async function extractInBackground(id: string, bytes: Uint8Array, languages?: string): Promise<void> {
  try {
    const { text, pageCount } = await tika.extract(bytes, { contentType: PDF_CONTENT_TYPE, ocrLanguages: languages });
    await updateUpload(id, { status: UploadStatus.EXTRACTED, text, pageCount, extractedAt: new Date(), error: null });
  } catch (cause) {
    const error = cause instanceof TikaError ? cause.message : "Text extraction failed";
    logger.error({ err: cause, uploadId: id }, "extraction failed");
    await updateUpload(id, { status: UploadStatus.FAILED, error }).catch((err) =>
      logger.error({ err, uploadId: id }, "could not persist extraction failure"),
    );
  }
}

async function updateUpload(id: string, values: Partial<NewUpload>): Promise<Upload> {
  const [row] = await db.update(upload).set(values).where(eq(upload.id, id)).returning();
  if (!row) throw new AppError({ status: 404, code: "upload_not_found" });
  return row;
}

/** Upload owned by `userId`, or 404. Never reveals whether another user's id exists. */
async function findOwned(id: string, userId: string): Promise<Upload> {
  const [row] = await db
    .select()
    .from(upload)
    .where(and(eq(upload.id, id), eq(upload.userId, userId)))
    .limit(1);
  if (!row) throw new AppError({ status: 404, code: "upload_not_found" });
  return row;
}

function toView(row: Upload) {
  const { storageKey: _storageKey, userId: _userId, updatedAt: _updatedAt, ...view } = row;
  return view;
}

function isPdf(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.subarray(0, PDF_MAGIC.length)) === PDF_MAGIC;
}
