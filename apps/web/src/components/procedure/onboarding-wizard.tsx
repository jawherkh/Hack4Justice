import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  REQUIREMENTS,
  servicesForDestination,
  waivableRequirementIds,
  type RequirementType,
} from '@hack4justice/shared'
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react'
import { Badge } from '@hack4justice/ui/components/badge'
import { Button } from '@hack4justice/ui/components/button'
import { Checkbox } from '@hack4justice/ui/components/checkbox'
import { Spinner } from '@hack4justice/ui/components/spinner'
import { toast } from '@hack4justice/ui/components/toast'
import { cn } from '@hack4justice/ui/lib/utils'
import { useI18n } from '#/i18n'
import { ApiError } from '#/lib/api-error'
import { onboardProject, projectKeys, type ProjectDetail } from '#/lib/projects'
import { DESTINATION_META } from '#/components/projects/destination'
import {
  REQUIREMENT_TYPE_ICON,
  humanize,
  requirementLabel,
  requirementTypeLabel,
  serviceName,
  serviceSummary,
  submissionModeLabel,
} from './labels'

const TYPE_ORDER: RequirementType[] = ['document', 'data', 'action', 'authentication']

/** Two steps: pick the agency service, then confirm the checklist (untick optional items). */
export function OnboardingWizard({ project }: { project: ProjectDetail }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const services = servicesForDestination(project.destination)
  const [serviceId, setServiceId] = React.useState<string | null>(project.serviceId)
  const [step, setStep] = React.useState<'service' | 'review'>('service')
  const [waived, setWaived] = React.useState<Set<string>>(new Set())

  const onboard = useMutation({
    mutationFn: (input: { serviceId: string; waived: string[] }) => onboardProject(project.id, input),
    onSuccess: (detail) => {
      queryClient.setQueryData(projectKeys.detail(project.id), detail)
      void queryClient.invalidateQueries({ queryKey: projectKeys.all })
      toast.add({ type: 'success', title: t('procedure.onboarding.done') })
    },
    onError: (err) =>
      toast.add({
        type: 'error',
        title: t('procedure.onboarding.error'),
        description: err instanceof ApiError ? err.message : t('auth.error.generic'),
      }),
  })

  const service = serviceId ? services.find((s) => s.id === serviceId) : undefined
  const waivable = serviceId ? new Set(waivableRequirementIds(serviceId)) : new Set<string>()
  const requirementIds = service ? [...service.requirements, ...service.authentication] : []
  const grouped = TYPE_ORDER.map((type) => ({
    type,
    ids: requirementIds.filter((id) => REQUIREMENTS[id]?.type === type),
  })).filter((group) => group.ids.length > 0)

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-primary uppercase">
          <Sparkles className="size-3.5" />
          {t('procedure.onboarding.eyebrow')}
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">
          {t('procedure.onboarding.title', { destination: project.destination })}
        </h2>
        <p className="text-sm text-muted-foreground">{t('procedure.onboarding.description')}</p>
      </header>

      <ol className="flex items-center gap-3 text-sm">
        <StepPill
          index={1}
          label={t('procedure.onboarding.step.service')}
          active={step === 'service'}
          done={step === 'review'}
        />
        <span className="h-px flex-1 bg-border" />
        <StepPill
          index={2}
          label={t('procedure.onboarding.step.review')}
          active={step === 'review'}
          done={false}
        />
      </ol>

      {step === 'service' ? (
        <>
          <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
            {services.map((item) => {
              const selected = item.id === serviceId
              const count = item.requirements.length + item.authentication.length
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setServiceId(item.id)}
                  className={cn(
                    'flex flex-col gap-3 rounded-xl border bg-card p-4 text-start transition-colors outline-none',
                    'hover:border-foreground/20 focus-visible:ring-3 focus-visible:ring-ring/50',
                    selected ? 'border-primary ring-1 ring-primary' : 'border-border',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <img
                      src={DESTINATION_META[project.destination].logo}
                      alt=""
                      draggable={false}
                      className="h-7 w-auto max-w-20 object-contain"
                    />
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-5 items-center justify-center rounded-full border',
                        selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                      )}
                    >
                      <Check className={cn('size-3', selected ? 'opacity-100' : 'opacity-0')} />
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold">{t(serviceName(item.id))}</span>
                    <span className="text-sm text-muted-foreground">{t(serviceSummary(item.id))}</span>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{t('procedure.onboarding.requirements', { count })}</Badge>
                    <Badge variant="outline">{t(submissionModeLabel(item.submissionMode))}</Badge>
                  </div>
                </button>
              )
            })}
          </div>
          <div className="flex justify-end">
            <Button disabled={!service} onClick={() => setStep('review')}>
              {t('procedure.onboarding.next')}
              <ArrowRight data-icon="inline-end" className="rtl:rotate-180" />
            </Button>
          </div>
        </>
      ) : service ? (
        <>
          <div className="flex flex-col gap-1 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{t(serviceName(service.id))}</span>
              <Badge variant="outline">{t(submissionModeLabel(service.submissionMode))}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{t(serviceSummary(service.id))}</p>
            {service.outputs.length ? (
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{t('procedure.onboarding.outputs')}: </span>
                {service.outputs.map(humanize).join(', ')}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <h3 className="font-semibold">{t('procedure.onboarding.review.title')}</h3>
            <p className="text-sm text-muted-foreground">{t('procedure.onboarding.review.description')}</p>
          </div>

          <div className="flex flex-col gap-4">
            {grouped.map(({ type, ids }) => {
              const Icon = REQUIREMENT_TYPE_ICON[type]
              return (
                <div key={type} className="flex flex-col gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <Icon className="size-3.5" />
                    {t(requirementTypeLabel(type))}
                  </p>
                  <ul className="divide-y rounded-xl border bg-card">
                    {ids.map((id) => {
                      const optional = waivable.has(id)
                      const included = !waived.has(id)
                      return (
                        <li key={id} className="flex items-center gap-3 px-4 py-3">
                          {optional ? (
                            <Checkbox
                              checked={included}
                              onCheckedChange={(checked) =>
                                setWaived((prev) => {
                                  const next = new Set(prev)
                                  if (checked) next.delete(id)
                                  else next.add(id)
                                  return next
                                })
                              }
                              aria-label={t(requirementLabel(id))}
                            />
                          ) : (
                            <Check className="size-4 text-primary" aria-hidden />
                          )}
                          <span
                            className={cn(
                              'flex-1 text-sm',
                              !included && 'text-muted-foreground line-through',
                            )}
                          >
                            {t(requirementLabel(id))}
                          </span>
                          {optional ? (
                            <Badge variant="outline">{t('procedure.onboarding.optional')}</Badge>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep('service')}>
              <ArrowLeft data-icon="inline-start" className="rtl:rotate-180" />
              {t('procedure.onboarding.back')}
            </Button>
            <Button
              disabled={onboard.isPending}
              onClick={() => onboard.mutate({ serviceId: service.id, waived: [...waived] })}
            >
              {onboard.isPending ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
              {t('procedure.onboarding.confirm')}
            </Button>
          </div>
        </>
      ) : null}
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
    <li className={cn('flex items-center gap-2', active ? 'text-foreground' : 'text-muted-foreground')}>
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
