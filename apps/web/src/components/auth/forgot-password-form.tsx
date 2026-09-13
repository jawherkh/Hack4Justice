import * as React from 'react'
import { useForm } from '@tanstack/react-form'
import { Link } from '@tanstack/react-router'
import { Button } from '@hack4justice/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hack4justice/ui/components/card'
import { Field, FieldDescription, FieldError, FieldGroup } from '@hack4justice/ui/components/field'
import { Spinner } from '@hack4justice/ui/components/spinner'
import { toLocaleParam, useI18n } from '#/i18n'
import { authClient } from '#/lib/auth'
import { authErrorKey } from './auth-error'
import { TextField } from './form-field'
import { forgotPasswordSchema } from './schemas'

export function ForgotPasswordForm() {
  const { t, locale } = useI18n()
  const [status, setStatus] = React.useState<{ sent?: boolean; error?: string }>({})

  const form = useForm({
    defaultValues: { email: '' },
    validators: { onSubmit: forgotPasswordSchema(t) },
    onSubmit: async ({ value }) => {
      setStatus({})
      const prefix = toLocaleParam(locale)
      const redirectTo = `${window.location.origin}${prefix ? `/${prefix}` : ''}/reset-password`
      const result = await authClient.requestPasswordReset({ email: value.email, redirectTo })
      if (result.error) return setStatus({ error: t(authErrorKey(result.error.code)) })
      setStatus({ sent: true })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('auth.forgot.title')}</CardTitle>
        <CardDescription>{t('auth.forgot.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {status.sent ? (
          <p className="text-sm">{t('auth.forgot.sent')}</p>
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void form.handleSubmit()
            }}
          >
            <FieldGroup>
              <form.Field name="email">
                {(field) => (
                  <TextField
                    field={field}
                    type="email"
                    label={t('auth.field.email')}
                    placeholder={t('auth.placeholder.email')}
                    autoComplete="email"
                  />
                )}
              </form.Field>
              <Field data-invalid={status.error ? true : undefined}>
                {status.error ? <FieldError>{status.error}</FieldError> : null}
                <form.Subscribe selector={(s) => s.isSubmitting}>
                  {(isSubmitting) => (
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                      {t('auth.forgot.submit')}
                    </Button>
                  )}
                </form.Subscribe>
                <FieldDescription className="text-center">
                  <Link to="/{-$locale}/login" params={{ locale: toLocaleParam(locale) }}>
                    {t('auth.forgot.back')}
                  </Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
