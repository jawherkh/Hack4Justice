import { z } from 'zod'
import type { Translate } from '#/i18n'

export const MIN_PASSWORD_LENGTH = 8

/** Schemas are built per render so validation messages follow the active locale. */
export function loginSchema(t: Translate) {
  return z.object({
    email: z.email(t('auth.validation.email')),
    password: z.string().min(1, t('auth.validation.passwordRequired')),
  })
}

export function signupSchema(t: Translate) {
  return z
    .object({
      name: z.string().trim().min(1, t('auth.validation.nameRequired')),
      email: z.email(t('auth.validation.email')),
      password: z
        .string()
        .min(MIN_PASSWORD_LENGTH, t('auth.validation.passwordMin', { min: MIN_PASSWORD_LENGTH })),
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t('auth.error.passwordMismatch'),
      path: ['confirmPassword'],
    })
}

export type LoginValues = z.infer<ReturnType<typeof loginSchema>>
export type SignupValues = z.infer<ReturnType<typeof signupSchema>>
