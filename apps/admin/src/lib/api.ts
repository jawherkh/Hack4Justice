import { treaty } from '@elysiajs/eden'
import type { App } from '@hack4justice/api/app'
import { isErrorBody } from '@hack4justice/shared'

const baseUrl = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:3001'

export const api: ReturnType<typeof treaty<App>> = treaty<App>(baseUrl, {
  fetch: { credentials: 'include' },
})

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

export function unwrap<T>(result: { data: T; error: unknown }, fallbackMessage: string): NonNullable<T> {
  if (result.error) {
    const value = (result.error as { status?: number; value?: unknown }).value
    if (isErrorBody(value)) throw new ApiError(value.error.status, value.error.code, value.error.message)
    throw new ApiError((result.error as { status?: number }).status ?? 500, 'unknown_error', fallbackMessage)
  }
  return result.data as NonNullable<T>
}

