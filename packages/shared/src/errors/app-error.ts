export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 410 | 413 | 415 | 422 | 429 | 500 | 501 | 502 | 503;

/** JSON body every API error response carries. */
export interface ErrorBody {
  error: {
    status: number;
    /** Stable machine-readable code, snake_case, e.g. "upload_not_found". */
    code: string;
    /** Human-readable explanation in the request's locale. Safe to show to users. */
    message: string;
    details?: unknown;
  };
}

export interface AppErrorOptions {
  status: ErrorStatus;
  /** Snake_case code. Also the translation key for the response message. */
  code: string;
  /** Fallback message when no translation exists. Defaults to a humanized code. */
  message?: string;
  /** Values interpolated into the translated message, e.g. { maxSize: "25 MB" }. */
  params?: Record<string, string | number>;
  /** Extra data returned to the client. Must be safe to expose. */
  details?: unknown;
  cause?: unknown;
}

/**
 * Error that maps directly to an HTTP response. Throw it anywhere in a request
 * and the API's global error handler turns it into `{ error: { status, code, message } }`,
 * with `message` translated to the request's locale.
 */
export class AppError extends Error {
  override readonly name: string = "AppError";
  readonly status: ErrorStatus;
  readonly code: string;
  readonly params: Record<string, string | number> | undefined;
  readonly details: unknown;

  constructor({ status, code, message, params, details, cause }: AppErrorOptions) {
    super(message ?? humanizeCode(code), cause === undefined ? undefined : { cause });
    this.status = status;
    this.code = code;
    this.params = params;
    this.details = details;
  }

  /** Body with the given (translated) message, or this error's own message. */
  toBody(message: string = this.message): ErrorBody {
    return {
      error: {
        status: this.status,
        code: this.code,
        message,
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }

  static is(value: unknown): value is AppError {
    return value instanceof AppError;
  }
}

/** "upload_not_found" -> "Upload not found" */
export function humanizeCode(code: string): string {
  const text = code.replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function isErrorBody(value: unknown): value is ErrorBody {
  if (typeof value !== "object" || value === null) return false;
  const error = (value as { error?: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}
