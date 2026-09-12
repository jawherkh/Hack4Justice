import * as React from 'react'
import { useForm } from '@tanstack/react-form'
import { Button } from '@hack4justice/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hack4justice/ui/components/card'
import { Checkbox } from '@hack4justice/ui/components/checkbox'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@hack4justice/ui/components/field'
import { Spinner } from '@hack4justice/ui/components/spinner'
import { useI18n } from '#/i18n'
import { authClient } from '#/lib/auth'
import { authErrorKey } from './auth-error'
import { TextField } from './form-field'
import { changePasswordSchema, type ChangePasswordValues } from './schemas'

const defaultValues: ChangePasswordValues = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
  revokeOtherSessions: true,
}

export function ChangePasswordForm() {
  const { t } = useI18n()
  const [status, setStatus] = React.useState<{ ok?: string; error?: string }>({})

  const form = useForm({
    defaultValues,
    validators: { onSubmit: changePasswordSchema(t) },
    onSubmit: async ({ value, formApi }) => {
      setStatus({})
      const result = await authClient.changePassword({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
        revokeOtherSessions: value.revokeOtherSessions,
      })
      if (result.error) return setStatus({ error: t(authErrorKey(result.error.code)) })
      formApi.reset()
      setStatus({ ok: t('account.password.saved') })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('account.password.title')}</CardTitle>
        <CardDescription>{t('account.password.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={(e) => { e.preventDefault(); void form.handleSubmit() }}>
          <FieldGroup>
            <form.Field name="currentPassword">
              {(field) => (
                <TextField field={field} type="password" label={t('account.password.current')} placeholder={t('auth.placeholder.password')} autoComplete="current-password" />
              )}
            </form.Field>
            <form.Field name="newPassword">
              {(field) => (
                <TextField field={field} type="password" label={t('account.password.new')} placeholder={t('auth.placeholder.newPassword')} hint={t('auth.field.passwordHint')} autoComplete="new-password" />
              )}
            </form.Field>
            <form.Field name="confirmPassword">
              {(field) => (
                <TextField field={field} type="password" label={t('account.password.confirm')} placeholder={t('auth.placeholder.confirmPassword')} autoComplete="new-password" />
              )}
            </form.Field>
            <form.Field name="revokeOtherSessions">
              {(field) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id={field.name}
                    checked={field.state.value}
                    onCheckedChange={(checked) => field.handleChange(checked === true)}
                  />
                  <FieldLabel htmlFor={field.name} className="font-normal">
                    {t('account.password.revokeOthers')}
                  </FieldLabel>
                </Field>
              )}
            </form.Field>
            <Field data-invalid={status.error ? true : undefined}>
              {status.error ? <FieldError>{status.error}</FieldError> : null}
              {status.ok ? <FieldDescription>{status.ok}</FieldDescription> : null}
              <form.Subscribe selector={(s) => s.isSubmitting}>
                {(isSubmitting) => (
                  <Button type="submit" disabled={isSubmitting} className="self-start">
                    {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                    {t('account.password.save')}
                  </Button>
                )}
              </form.Subscribe>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
