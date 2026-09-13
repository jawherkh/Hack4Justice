import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { REQUIREMENTS, SERVICES, deriveSteps, type ProcedureStep } from '@hack4justice/shared'
import { ArrowRight, Check, ChevronRight, Paperclip, Upload } from 'lucide-react'
import { toast } from '@hack4justice/ui/components/toast'
import { useFileDrop, type FileDropError } from '#/components/uploads/use-file-drop'
import { ApiError } from '#/lib/api-error'
import { Button } from '@hack4justice/ui/components/button'
import { cn } from '@hack4justice/ui/lib/utils'
import { toLocaleParam, useI18n } from '#/i18n'
import { projectKeys, uploadAndAttach, type ProjectDetail, type ProjectRequirementView } from '#/lib/projects'
import {
  REQUIREMENT_TYPE_ICON,
  requirementHint,
  requirementLabel,
  stepDescription,
  stepTitle,
} from './labels'
import { RequirementStatusBadge } from './status-badges'
import { StepGuide } from './step-guide'
import { stepAnchor } from './step-rail'

interface StepsTimelineProps {
  project: ProjectDetail
  onSelectRequirement: (requirement: ProjectRequirementView) => void
}

/** Steps that list their gating requirements as child nodes. */
const STEPS_WITH_NODES: ReadonlySet<ProcedureStep> = new Set(['COLLECT_REQUIREMENTS', 'AUTHENTICATION'])

/** Vertical timeline of the procedure: one node per state machine step, requirement nodes nested under it. */
export function StepsTimeline({ project, onSelectRequirement }: StepsTimelineProps) {
  const { t, locale } = useI18n()
  const steps = deriveSteps(project.serviceId, project.requirements, project.submissionStatus)
  const byId = new Map(project.requirements.map((r) => [r.requirementId, r]))
  const service = project.serviceId ? SERVICES[project.serviceId] : undefined

  return (
    <ol className="flex flex-col">
      {steps.map((progress, index) => {
        const { step, state, requirementIds, satisfied } = progress
        const last = index === steps.length - 1
        const showNodes = STEPS_WITH_NODES.has(step) && requirementIds.length > 0
        return (
          <li key={step} id={stepAnchor(step)} className="relative flex scroll-mt-24 gap-4 pb-8 last:pb-0">
            {!last ? (
              <span
                aria-hidden
                className={cn(
                  'absolute start-[15px] top-8 bottom-0 w-px',
                  state === 'done' ? 'bg-primary' : 'bg-border',
                )}
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                'relative z-[1] flex size-8 shrink-0 items-center justify-center rounded-full border-2 bg-background text-xs font-semibold',
                state === 'done' && 'border-primary bg-primary text-primary-foreground',
                state === 'current' && 'border-primary text-primary',
                state === 'upcoming' && 'border-border text-muted-foreground',
              )}
            >
              {state === 'done' ? <Check className="size-4" /> : index + 1}
            </span>

            <div className="flex min-w-0 flex-1 flex-col gap-3 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <h3 className={cn('font-semibold', state === 'upcoming' && 'text-muted-foreground')}>
                    {t(stepTitle(step))}
                  </h3>
                  <p className="text-sm text-muted-foreground">{t(stepDescription(step))}</p>
                </div>
                {requirementIds.length > 0 ? (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t('procedure.overview.stepProgress', { done: satisfied, total: requirementIds.length })}
                  </span>
                ) : null}
              </div>

              {service ? (
                <StepGuide step={progress} service={service} defaultOpen={state === 'current'} />
              ) : null}

              {showNodes ? (
                <ol className="flex flex-col gap-2">
                  {requirementIds.map((id) => {
                    const requirement = byId.get(id)
                    const def = REQUIREMENTS[id]
                    if (!requirement || !def) return null
                    return (
                      <RequirementNode
                        key={id}
                        projectId={project.id}
                        requirement={requirement}
                        droppable={def.type === 'document'}
                        onSelect={() => onSelectRequirement(requirement)}
                      />
                    )
                  })}
                </ol>
              ) : null}

              {step === 'READY_FOR_SUBMISSION' && state !== 'upcoming' ? (
                <div>
                  <Button
                    variant={state === 'current' ? 'default' : 'outline'}
                    size="sm"
                    render={
                      <Link
                        to="/{-$locale}/projects/$id/submission"
                        params={{ locale: toLocaleParam(locale), id: project.id }}
                      />
                    }
                  >
                    {t('procedure.overview.goToSubmission')}
                    <ArrowRight data-icon="inline-end" className="rtl:rotate-180" />
                  </Button>
                </div>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

interface RequirementNodeProps {
  projectId: string
  requirement: ProjectRequirementView
  /** Document requirements accept a dropped PDF: it is uploaded into the project and attached. */
  droppable: boolean
  onSelect: () => void
}

function RequirementNode({ projectId, requirement, droppable, onSelect }: RequirementNodeProps) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const id = requirement.requirementId
  const def = REQUIREMENTS[id]!
  const Icon = REQUIREMENT_TYPE_ICON[def.type]

  const attach = useMutation({
    mutationFn: (file: File) => uploadAndAttach(projectId, id, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
      void queryClient.invalidateQueries({ queryKey: projectKeys.uploads(projectId) })
      toast.add({ type: 'success', title: t('procedure.requirement.saved') })
    },
    onError: (err) =>
      toast.add({
        type: 'error',
        title: t('procedure.requirement.error'),
        description: err instanceof ApiError ? err.message : t('auth.error.generic'),
      }),
  })
  const dropError = (error: FileDropError) =>
    toast.add({
      type: 'error',
      title: t(error === 'notPdf' ? 'uploads.drop.notPdf' : 'uploads.drop.tooLarge'),
    })
  const { dragging, handlers } = useFileDrop({
    onFile: (file) => attach.mutate(file),
    onError: dropError,
    disabled: !droppable || attach.isPending,
  })

  return (
    <li {...handlers}>
      <button
        type="button"
        onClick={onSelect}
        disabled={attach.isPending}
        className={cn(
          'group/node flex w-full cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-start transition-colors outline-none hover:border-foreground/20 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-progress',
          dragging && 'border-dashed border-primary bg-primary/5',
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {dragging ? <Upload className="size-4 text-primary" /> : <Icon className="size-4" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{t(requirementLabel(id))}</span>
          {attach.isPending ? (
            <span className="truncate text-xs text-muted-foreground">
              {t('procedure.requirement.uploading')}
            </span>
          ) : dragging ? (
            <span className="truncate text-xs text-primary">{t('procedure.requirement.dropHere')}</span>
          ) : requirement.upload ? (
            <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <Paperclip className="size-3" />
              {requirement.upload.filename}
            </span>
          ) : requirement.note ? (
            <span className="truncate text-xs text-muted-foreground">{requirement.note}</span>
          ) : (
            <span className="line-clamp-1 text-xs text-muted-foreground">{t(requirementHint(id))}</span>
          )}
        </span>
        <RequirementStatusBadge status={requirement.status} />
        <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover/node:opacity-100 rtl:rotate-180" />
      </button>
    </li>
  )
}
