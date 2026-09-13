import { AppError, type ErrorBody } from "@hack4justice/shared";
import { Elysia } from "elysia";

import { env } from "./env";
import { resolveLocale } from "./i18n/index";
import { createTranslator, i18n } from "./i18n/plugin";
import { logger } from "./logger";

/**
 * Global error handler. Every error becomes `{ error: { status, code, message, details? } }`
 * with `message` translated through the request's `t()`.
 */
export const errorHandler = new Elysia({ name: "error-handler" })
  .use(i18n)
  .onError({ as: "global" }, ({ error, code, set, request, t: contextT }): ErrorBody => {
    // `t` is missing when the error happened before derive ran (e.g. unknown route, parse error).
    const t = contextT ?? createTranslator(resolveLocale(request));

    if (AppError.is(error)) {
      set.status = error.status;
      if (error.status >= 500) logger.error({ err: error, code: error.code }, error.message);
      return error.toBody(t(error.code, error.params));
    }

    switch (code) {
      case "VALIDATION": {
        set.status = 422;
        const issues = error.all.map((issue) => ({
          path: "path" in issue ? issue.path : undefined,
          message: issue.summary ?? ("message" in issue ? issue.message : "Invalid value"),
        }));
        return body(422, "validation_error", t("validation_error"), issues);
      }
      case "PARSE":
        set.status = 400;
        return body(400, "invalid_body", t("invalid_body"));
      case "NOT_FOUND":
        set.status = 404;
        return body(404, "not_found", t("not_found"));
      default: {
        set.status = 500;
        logger.error({ err: error }, "unhandled error");
        const detail = error instanceof Error ? error.message : String(error);
        return body(
          500,
          "internal_error",
          t("internal_error"),
          env.NODE_ENV === "production" ? undefined : { cause: detail },
        );
      }
    }
  });

function body(status: number, code: string, message: string, details?: unknown): ErrorBody {
  return { error: { status, code, message, ...(details !== undefined ? { details } : {}) } };
}
