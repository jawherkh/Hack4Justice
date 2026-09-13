import * as React from 'react'
import { useForm } from '@tanstack/react-form'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { Button } from '@hack4justice/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hack4justice/ui/components/card'
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
import { toLocaleParam, useI18n, type MessageKey } from '#/i18n'
import { signUp } from '#/lib/auth'
import { authErrorKey } from './auth-error'
import { signupSchema, type SignupValues } from './schemas'

const defaultValues: SignupValues = { name: '', email: '', password: '', confirmPassword: '' }

type TextField = {
  name: keyof SignupValues
  label: MessageKey
  placeholder: MessageKey
  type: 'text' | 'email' | 'password'
  autoComplete: string
  hint?: MessageKey
}

const FIELDS: TextField[] = [
  {
    name: 'name',
    label: 'auth.field.name',
    placeholder: 'auth.placeholder.name',
    type: 'text',
    autoComplete: 'name',
  },
  {
    name: 'email',
    label: 'auth.field.email',
    placeholder: 'auth.placeholder.email',
    type: 'email',
    autoComplete: 'email',
  },
  {
    name: 'password',
    label: 'auth.field.password',
    placeholder: 'auth.placeholder.newPassword',
    type: 'password',
    autoComplete: 'new-password',
    hint: 'auth.field.passwordHint',
  },
  {
    name: 'confirmPassword',
    label: 'auth.field.confirmPassword',
    placeholder: 'auth.placeholder.confirmPassword',
    type: 'password',
    autoComplete: 'new-password',
  },
]

interface SignupFormProps extends React.ComponentProps<'div'> {
  /** Where to go after a successful sign-up. Must be a same-origin path. */
  redirectTo: string
}

export function SignupForm({ redirectTo, className, ...props }: SignupFormProps) {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const router = useRouter()
  const [serverError, setServerError] = React.useState<string | null>(null)

  const form = useForm({
    defaultValues,
    validators: { onSubmit: signupSchema(t) },
    onSubmit: async ({ value }) => {
      setServerError(null)
      const result = await signUp.email({ name: value.name, email: value.email, password: value.password })
      if (result.error) {
        setServerError(t(authErrorKey(result.error.code)))
        return
      }
      await router.invalidate()
      await navigate({ href: redirectTo })
    },
  })

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t('auth.register.title')}</CardTitle>
          <CardDescription>{t('auth.register.description')}</CardDescription>
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
              {FIELDS.map((config) => (
                <form.Field key={config.name} name={config.name}>
                  {(field) => {
                    const invalid = field.state.meta.isTouched && field.state.meta.errors.length > 0
                    return (
                      <Field data-invalid={invalid || undefined}>
                        <FieldLabel htmlFor={field.name}>{t(config.label)}</FieldLabel>
                        <Input
                          id={field.name}
                          name={field.name}
                          type={config.type}
                          autoComplete={config.autoComplete}
                          placeholder={t(config.placeholder)}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                          aria-invalid={invalid || undefined}
                        />
                        {invalid ? (
                          <FieldError errors={field.state.meta.errors} />
                        ) : config.hint ? (
                          <FieldDescription>{t(config.hint)}</FieldDescription>
                        ) : null}
                      </Field>
                    )
                  }}
                </form.Field>
              ))}

              <Field data-invalid={serverError ? true : undefined}>
                {serverError ? <FieldError>{serverError}</FieldError> : null}
                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(isSubmitting) => (
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                      {t('auth.register.submit')}
                    </Button>
                  )}
                </form.Subscribe>
                <FieldDescription className="text-center">
                  {t('auth.register.hasAccount')}{' '}
                  <Link
                    to="/{-$locale}/login"
                    params={{ locale: toLocaleParam(locale) }}
                    search={{ redirect: redirectTo }}
                  >
                    {t('auth.register.signIn')}
                  </Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">{t('auth.register.terms')}</FieldDescription>
    </div>
  )
}
