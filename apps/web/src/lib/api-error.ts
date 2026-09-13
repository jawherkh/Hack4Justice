import { isErrorBody } from '@hack4justice/shared'

/** Error thrown by API helpers. `message` is already translated by the API. */
export class ApiError extends Error {
  override readonly name = 'ApiError'
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/** Turns an Eden `{ data, error }` result into data or a thrown `ApiError`. */
export function unwrap<T>(result: { data: T; error: unknown }, fallbackMessage: string): NonNullable<T> {
  if (result.error) {
    const value = (result.error as { status?: number; value?: unknown }).value
    if (isErrorBody(value)) {
      throw new ApiError(value.error.status, value.error.code, value.error.message)
    }
    const status = (result.error as { status?: number }).status ?? 500
    throw new ApiError(status, 'unknown_error', fallbackMessage)
  }
  // Eden types `data` as nullable because of the error union; it is set when `error` is null.
  return result.data as NonNullable<T>
}
