import type { MessageKey } from '#/i18n'

/** Maps Better Auth error codes to translation keys. Unknown codes fall back to a generic message. */
export function authErrorKey(code: string | undefined): MessageKey {
  switch (code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
    case 'USER_NOT_FOUND':
      return 'auth.error.invalidCredentials'
    case 'INVALID_PASSWORD':
      return 'auth.error.wrongPassword'
    case 'BANNED_USER':
      return 'auth.error.banned'
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'auth.error.emailTaken'
    case 'INVALID_TOKEN':
    case 'TOKEN_EXPIRED':
      return 'auth.error.invalidToken'
    default:
      return 'auth.error.generic'
  }
}
