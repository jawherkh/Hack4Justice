import * as React from 'react'
import { useForm } from '@tanstack/react-form'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@hack4justice/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hack4justice/ui/components/card'
import { Field, FieldDescription, FieldError, FieldGroup } from '@hack4justice/ui/components/field'
import { Spinner } from '@hack4justice/ui/components/spinner'
import { useI18n } from '#/i18n'
import { authClient } from '#/lib/auth'
import { authErrorKey } from './auth-error'
import { TextField } from './form-field'
import { profileSchema } from './schemas'

export function ProfileForm({ name }: { name: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [status, setStatus] = React.useState<{ ok?: string; error?: string }>({})

  const form = useForm({
    defaultValues: { name },
    validators: { onSubmit: profileSchema(t) },
    onSubmit: async ({ value }) => {
      setStatus({})
      const result = await authClient.updateUser({ name: value.name })
      if (result.error) return setStatus({ error: t(authErrorKey(result.error.code)) })
      await router.invalidate()
      setStatus({ ok: t('account.profile.saved') })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('account.profile.title')}</CardTitle>
        <CardDescription>{t('account.profile.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <FieldGroup>
            <form.Field name="name">
              {(field) => (
                <TextField
                  field={field}
                  label={t('auth.field.name')}
                  placeholder={t('auth.placeholder.name')}
                  autoComplete="name"
                />
              )}
            </form.Field>
            <Field data-invalid={status.error ? true : undefined}>
              {status.error ? <FieldError>{status.error}</FieldError> : null}
              {status.ok ? <FieldDescription>{status.ok}</FieldDescription> : null}
              <form.Subscribe selector={(s) => s.isSubmitting}>
                {(isSubmitting) => (
                  <Button type="submit" disabled={isSubmitting} className="self-start">
                    {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                    {t('account.profile.save')}
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
