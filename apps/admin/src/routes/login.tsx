import * as React from 'react'
import { useForm } from '@tanstack/react-form'
import { createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { ShieldCheck } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@hack4justice/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hack4justice/ui/components/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@hack4justice/ui/components/field'
import { Input } from '@hack4justice/ui/components/input'
import { Spinner } from '@hack4justice/ui/components/spinner'
import { signIn } from '#/lib/auth'

const searchSchema = z.object({ redirect: z.string().optional() })
const loginSchema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  beforeLoad: ({ context, search }) => {
    if (context.session) throw redirect({ href: safe(search.redirect) })
  },
  component: Login,
})

function safe(value: string | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

function Login() {
  const { redirect: target } = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()
  const [serverError, setServerError] = React.useState<string | null>(null)

  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: { onSubmit: loginSchema },
    onSubmit: async ({ value }) => {
      setServerError(null)
      const result = await signIn.email(value)
      if (result.error) {
        setServerError(
          result.error.code === 'INVALID_EMAIL_OR_PASSWORD'
            ? 'Invalid email or password.'
            : (result.error.message ?? 'Sign-in failed.'),
        )
        return
      }
      await router.invalidate()
      await navigate({ href: safe(target) })
    },
  })

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center gap-2 text-sm font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-4" />
          </span>
          Dalil Admin
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Staff sign-in</CardTitle>
            <CardDescription>
              Accounts are created by a superadmin. There is no self-registration.
            </CardDescription>
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
                        <FieldLabel htmlFor="email">Email</FieldLabel>
                        <Input
                          id="email"
                          type="email"
                          autoComplete="username"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
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
                        <FieldLabel htmlFor="password">Password</FieldLabel>
                        <Input
                          id="password"
                          type="password"
                          autoComplete="current-password"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
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
                        Sign in
                      </Button>
                    )}
                  </form.Subscribe>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
