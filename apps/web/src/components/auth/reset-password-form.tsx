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
import { resetPasswordSchema } from './schemas'

interface ResetPasswordFormProps {
  /** Token from the emailed link. Missing or rejected tokens show the invalid-link state. */
  token: string | undefined
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const { t, locale } = useI18n()
  const [status, setStatus] = React.useState<{ done?: boolean; error?: string }>({})
  const params = { locale: toLocaleParam(locale) }

  const form = useForm({
    defaultValues: { newPassword: '', confirmPassword: '' },
    validators: { onSubmit: resetPasswordSchema(t) },
    onSubmit: async ({ value }) => {
      if (!token) return
      setStatus({})
      const result = await authClient.resetPassword({ newPassword: value.newPassword, token })
      if (result.error) return setStatus({ error: t(authErrorKey(result.error.code)) })
      setStatus({ done: true })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('auth.reset.title')}</CardTitle>
        <CardDescription>{t('auth.reset.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {!token ? (
          <div className="flex flex-col gap-3 text-sm">
            <p>{t('auth.reset.invalidLink')}</p>
            <Link to="/{-$locale}/forgot-password" params={params} className="underline underline-offset-4">
              {t('auth.forgot.title')}
            </Link>
          </div>
        ) : status.done ? (
          <div className="flex flex-col gap-3 text-sm">
            <p>{t('auth.reset.done')}</p>
            <Link to="/{-$locale}/login" params={params} className="underline underline-offset-4">
              {t('auth.login.submit')}
            </Link>
          </div>
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void form.handleSubmit()
            }}
          >
            <FieldGroup>
              <form.Field name="newPassword">
                {(field) => (
                  <TextField
                    field={field}
                    type="password"
                    label={t('account.password.new')}
                    placeholder={t('auth.placeholder.newPassword')}
                    hint={t('auth.field.passwordHint')}
                    autoComplete="new-password"
                  />
                )}
              </form.Field>
              <form.Field name="confirmPassword">
                {(field) => (
                  <TextField
                    field={field}
                    type="password"
                    label={t('account.password.confirm')}
                    placeholder={t('auth.placeholder.confirmPassword')}
                    autoComplete="new-password"
                  />
                )}
              </form.Field>
              <Field data-invalid={status.error ? true : undefined}>
                {status.error ? <FieldError>{status.error}</FieldError> : null}
                <form.Subscribe selector={(s) => s.isSubmitting}>
                  {(isSubmitting) => (
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                      {t('auth.reset.submit')}
                    </Button>
                  )}
                </form.Subscribe>
                <FieldDescription className="text-center">
                  <Link to="/{-$locale}/login" params={params}>
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
