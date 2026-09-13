import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react'
import { Button } from '@hack4justice/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hack4justice/ui/components/card'
import { Field, FieldError, FieldGroup } from '@hack4justice/ui/components/field'
import { Spinner } from '@hack4justice/ui/components/spinner'
import { toast } from '@hack4justice/ui/components/toast'
import { cn } from '@hack4justice/ui/lib/utils'
import { useI18n, type MessageKey } from '#/i18n'
import { ApiError } from '#/lib/api-error'
import { profileKeys, saveProfile } from '#/lib/profile'
import {
  AboutFields,
  CompanyFields,
  ContactFields,
  TermsField,
  useProfileForm,
  validateFields,
} from './profile-fields'
import {
  ONBOARDING_STEPS,
  STEP_FIELDS,
  emptyValues,
  splitName,
  toProfileInput,
  type OnboardingStep,
  type ProfileFormValues,
} from './schemas'

const STEP_COPY: Record<OnboardingStep, { label: MessageKey; title: MessageKey; description: MessageKey }> = {
  about: {
    label: 'onboarding.step.about',
    title: 'onboarding.about.title',
    description: 'onboarding.about.description',
  },
  company: {
    label: 'onboarding.step.company',
    title: 'onboarding.company.title',
    description: 'onboarding.company.description',
  },
  finish: {
    label: 'onboarding.step.finish',
    title: 'onboarding.finish.title',
    description: 'onboarding.finish.description',
  },
}

interface OnboardingWizardProps {
  /** Display name from sign-up, used to prefill first and last name. */
  name: string
  /** Where to go once the profile is saved. Must be a same-origin path. */
  redirectTo: string
}

/**
 * Three steps: about you, your company, finish. One form holds every value.
 * "Continue" validates the current step's fields and refuses to advance
 * while any of them is invalid.
 */
export function OnboardingWizard({ name, redirectTo }: OnboardingWizardProps) {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [step, setStep] = React.useState<OnboardingStep>('about')
  const [serverError, setServerError] = React.useState<string | null>(null)

  const save = useMutation({
    mutationFn: (values: ProfileFormValues) => saveProfile(toProfileInput(values)),
    onSuccess: async (profile) => {
      queryClient.setQueryData(profileKeys.me, profile)
      toast.add({ type: 'success', title: t('onboarding.done', { name: profile.firstName }) })
      // Re-run route guards with the new profile, then leave.
      await router.invalidate()
      await navigate({ href: redirectTo })
    },
    onError: (err) => setServerError(err instanceof ApiError ? err.message : t('onboarding.error')),
  })

  const defaultValues = React.useMemo(() => ({ ...emptyValues(locale), ...splitName(name) }), [locale, name])

  const form = useProfileForm({
    defaultValues,
    onSubmit: async (values) => {
      try {
        await save.mutateAsync(values)
      } catch {
        // Surfaced through `onError`; the user stays on the last step to retry.
      }
    },
  })

  const steps = ONBOARDING_STEPS
  const index = steps.indexOf(step)
  const copy = STEP_COPY[step]
  const last = index === steps.length - 1

  async function continueOrSubmit() {
    setServerError(null)
    if (!(await validateFields(form, STEP_FIELDS[step]))) return
    if (last) {
      await form.handleSubmit()
      return
    }
    setStep(steps[index + 1]!)
  }

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-primary uppercase">
          <Sparkles className="size-3.5" />
          {t('onboarding.eyebrow')}
        </p>
        <h1 className="text-3xl font-bold tracking-tight">{t('onboarding.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('onboarding.description')}</p>
      </header>

      <ol className="flex items-center gap-3 text-sm">
        {steps.map((item, i) => (
          <React.Fragment key={item}>
            {i > 0 ? <span className="h-px flex-1 bg-border" /> : null}
            <StepPill
              index={i + 1}
              label={t(STEP_COPY[item].label)}
              active={item === step}
              done={i < index}
            />
          </React.Fragment>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle>{t(copy.title)}</CardTitle>
          <CardDescription>{t(copy.description)}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void continueOrSubmit()
            }}
            className="flex flex-col gap-6"
          >
            <FieldGroup>
              {step === 'about' ? <AboutFields form={form} /> : null}
              {step === 'company' ? <CompanyFields form={form} /> : null}
              {step === 'finish' ? (
                <>
                  <ContactFields form={form} />
                  <TermsField form={form} />
                </>
              ) : null}
              {serverError ? (
                <Field data-invalid>
                  <FieldError>{serverError}</FieldError>
                </Field>
              ) : null}
            </FieldGroup>

            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                disabled={index === 0}
                onClick={() => setStep(steps[index - 1] ?? 'about')}
              >
                <ArrowLeft data-icon="inline-start" className="rtl:-scale-x-100" />
                {t('onboarding.back')}
              </Button>
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                    {last ? t('onboarding.submit') : t('onboarding.next')}
                    {last ? null : <ArrowRight data-icon="inline-end" className="rtl:-scale-x-100" />}
                  </Button>
                )}
              </form.Subscribe>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  )
}

function StepPill({
  index,
  label,
  active,
  done,
}: {
  index: number
  label: string
  active: boolean
  done: boolean
}) {
  return (
    <li
      aria-current={active ? 'step' : undefined}
      className={cn('flex items-center gap-2', active ? 'text-foreground' : 'text-muted-foreground')}
    >
      <span
        className={cn(
          'flex size-6 items-center justify-center rounded-full border text-xs font-semibold',
          active && 'border-primary bg-primary text-primary-foreground',
          done && 'border-primary text-primary',
        )}
      >
        {done ? <Check className="size-3.5" /> : index}
      </span>
      <span className="font-medium">{label}</span>
    </li>
  )
}
