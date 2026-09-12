import * as React from 'react'
import { useForm } from '@tanstack/react-form'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '@hack4justice/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@hack4justice/ui/components/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@hack4justice/ui/components/field'
import { Input } from '@hack4justice/ui/components/input'
import { Spinner } from '@hack4justice/ui/components/spinner'
import { cn } from '@hack4justice/ui/lib/utils'
import { toLocaleParam, useI18n } from '#/i18n'
import { signIn } from '#/lib/auth'
import { authErrorKey } from './auth-error'
import { loginSchema, type LoginValues } from './schemas'

const defaultValues: LoginValues = { email: '', password: '' }

export function LoginForm({ className, ...props }: React.ComponentProps<'div'>) {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const [serverError, setServerError] = React.useState<string | null>(null)

  const form = useForm({
    defaultValues,
    validators: { onSubmit: loginSchema(t) },
    onSubmit: async ({ value }) => {
      setServerError(null)
      const result = await signIn.email(value)
      if (result.error) {
        setServerError(t(authErrorKey(result.error.code)))
        return
      }
      await navigate({ to: '/{-$locale}', params: { locale: toLocaleParam(locale) } })
    },
  })

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>{t('auth.login.title')}</CardTitle>
          <CardDescription>{t('auth.login.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void form.handleSubmit()
            }}
          >
            <FieldGroup>
              <form.Field name="email">
                {(field) => {
                  const invalid = field.state.meta.isTouched && field.state.meta.errors.length > 0
                  return (
                    <Field data-invalid={invalid || undefined}>
                      <FieldLabel htmlFor={field.name}>{t('auth.field.email')}</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="email"
                        autoComplete="email"
                        placeholder={t('auth.placeholder.email')}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        aria-invalid={invalid || undefined}
                      />
                      {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                    </Field>
                  )
                }}
              </form.Field>

              <form.Field name="password">
                {(field) => {
                  const invalid = field.state.meta.isTouched && field.state.meta.errors.length > 0
                  return (
                    <Field data-invalid={invalid || undefined}>
                      <FieldLabel htmlFor={field.name}>{t('auth.field.password')}</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="password"
                        autoComplete="current-password"
                        placeholder={t('auth.placeholder.password')}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        aria-invalid={invalid || undefined}
                      />
                      {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                    </Field>
                  )
                }}
              </form.Field>

              <Field data-invalid={serverError ? true : undefined}>
                {serverError ? <FieldError>{serverError}</FieldError> : null}
                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(isSubmitting) => (
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                      {t('auth.login.submit')}
                    </Button>
                  )}
                </form.Subscribe>
                <FieldDescription className="text-center">
                  {t('auth.login.noAccount')}{' '}
                  <Link to="/{-$locale}/register" params={{ locale: toLocaleParam(locale) }}>
                    {t('auth.login.signUp')}
                  </Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
