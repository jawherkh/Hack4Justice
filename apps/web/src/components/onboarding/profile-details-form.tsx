import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@hack4justice/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hack4justice/ui/components/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldSeparator,
} from '@hack4justice/ui/components/field'
import { Spinner } from '@hack4justice/ui/components/spinner'
import { useI18n } from '#/i18n'
import { ApiError } from '#/lib/api-error'
import { profileKeys, saveProfile, type Profile } from '#/lib/profile'
import { AboutFields, CompanyFields, ContactFields, useProfileForm, validateFields } from './profile-fields'
import { PROFILE_FIELDS, toProfileInput, valuesFromProfile, type ProfileFormValues } from './schemas'

/** Account page: the whole onboarding profile as one editable card. */
export function ProfileDetailsForm({ profile }: { profile: Profile }) {
  const { t } = useI18n()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [status, setStatus] = React.useState<{ ok?: string; error?: string }>({})

  const save = useMutation({
    mutationFn: (values: ProfileFormValues) => saveProfile(toProfileInput(values)),
    onSuccess: async (saved) => {
      queryClient.setQueryData(profileKeys.me, saved)
      await router.invalidate()
      setStatus({ ok: t('account.profile.saved') })
    },
    onError: (err) => setStatus({ error: err instanceof ApiError ? err.message : t('onboarding.error') }),
  })

  const form = useProfileForm({
    defaultValues: valuesFromProfile(profile),
    onSubmit: async (values) => {
      setStatus({})
      try {
        await save.mutateAsync(values)
      } catch {
        // Surfaced through `onError`.
      }
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('account.profile.title')}</CardTitle>
        <CardDescription>{t('account.profile.detailsDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void validateFields(form, PROFILE_FIELDS).then((valid) =>
              valid ? form.handleSubmit() : undefined,
            )
          }}
        >
          <FieldGroup>
            <AboutFields form={form} />
            <FieldSeparator />
            <CompanyFields form={form} />
            <FieldSeparator />
            <ContactFields form={form} />
            <Field data-invalid={status.error ? true : undefined}>
              {status.error ? <FieldError>{status.error}</FieldError> : null}
              {status.ok ? <FieldDescription>{status.ok}</FieldDescription> : null}
              <form.Subscribe selector={(state) => state.isSubmitting}>
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
