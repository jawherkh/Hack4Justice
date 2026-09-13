import { deriveSteps, type ProcedureStep } from '@hack4justice/shared'
import { Check } from 'lucide-react'
import { cn } from '@hack4justice/ui/lib/utils'
import { useI18n } from '#/i18n'
import type { ProjectDetail } from '#/lib/projects'
import { stepTitle } from './labels'

export const stepAnchor = (step: ProcedureStep) => `step-${step}`

interface StepRailProps {
  project: ProjectDetail
  done: number
  total: number
  className?: string
}

/**
 * Compact, sticky version of the timeline: one row per step with its state,
 * linking to the full step below. Horizontal strip on small screens.
 */
export function StepRail({ project, done, total, className }: StepRailProps) {
  const { t } = useI18n()
  const steps = deriveSteps(project.serviceId, project.requirements, project.submissionStatus)
  const percent = total ? Math.round((done / total) * 100) : 0

  return (
    <nav aria-label={t('procedure.overview.steps')} className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">{t('procedure.overview.progress', { done, total })}</span>
          <span className="text-muted-foreground tabular-nums">{percent}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <ol className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {steps.map(({ step, state, requirementIds, satisfied }, index) => (
          <li key={step} className="shrink-0">
            <a
              href={`#${stepAnchor(step)}`}
              aria-current={state === 'current' ? 'step' : undefined}
              onClick={(event) => {
                event.preventDefault()
                document
                  .getElementById(stepAnchor(step))
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
                state === 'current'
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground',
                state === 'done' && 'text-foreground',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
                  state === 'done' && 'border-primary bg-primary text-primary-foreground',
                  state === 'current' && 'border-primary text-primary',
                  state === 'upcoming' && 'border-border',
                )}
              >
                {state === 'done' ? <Check className="size-3" /> : index + 1}
              </span>
              <span className="whitespace-nowrap lg:truncate lg:whitespace-normal">{t(stepTitle(step))}</span>
              {requirementIds.length ? (
                <span className="ms-auto hidden text-xs text-muted-foreground tabular-nums lg:inline">
                  {satisfied}/{requirementIds.length}
                </span>
              ) : null}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
