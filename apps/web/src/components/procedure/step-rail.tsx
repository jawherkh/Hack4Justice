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
 * Compact, sticky version of the timeline: progress plus one chip per step
 * with its state, linking to the full step below.
 */
export function StepRail({ project, done, total, className }: StepRailProps) {
  const { t } = useI18n()
  const steps = deriveSteps(project.serviceId, project.requirements, project.submissionStatus)
  const percent = total ? Math.round((done / total) * 100) : 0

  return (
    <nav aria-label={t('procedure.overview.steps')} className={cn('flex flex-col gap-2', className)}>
      {/* Large enough to read at a glance: this is the first thing the user checks on the overview. */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-base font-semibold">{t('procedure.overview.progress', { done, total })}</span>
          <span className="text-2xl font-bold tracking-tight text-primary tabular-nums">{percent}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <ol className="flex flex-wrap gap-1">
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
              <span className="whitespace-nowrap">{t(stepTitle(step))}</span>
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
