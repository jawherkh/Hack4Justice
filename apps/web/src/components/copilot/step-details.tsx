import * as React from 'react'
import { Link } from '@tanstack/react-router'
import {
  REQUIREMENTS,
  RequirementStatus,
  SERVICES,
  deriveSteps,
  fieldsFor,
  isSatisfied,
  type ProcedureStep,
  type StepProgress,
} from '@hack4justice/shared'
import { Badge } from '@hack4justice/ui/components/badge'
import { Button } from '@hack4justice/ui/components/button'
import { Progress } from '@hack4justice/ui/components/progress'
import { cn } from '@hack4justice/ui/lib/utils'
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleDotIcon,
  CircleIcon,
  DownloadIcon,
  ExternalLinkIcon,
  EyeIcon,
  FileTextIcon,
  LightbulbIcon,
  ListChecksIcon,
  SendIcon,
} from 'lucide-react'
import {
  REQUIREMENT_TYPE_ICON,
  requirementHint,
  requirementLabel,
  requirementTypeLabel,
  stepDescription,
  stepTitle,
} from '#/components/procedure/labels'
import { ProcedureStatusBadge, RequirementStatusBadge } from '#/components/procedure/status-badges'
import { StepGuide } from '#/components/procedure/step-guide'
import { stepAnchor } from '#/components/procedure/step-rail'
import { FilePreviewDialog } from '#/components/uploads/file-preview-dialog'
import { UploadStatusBadge } from '#/components/uploads/upload-status-badge'
import { toLocaleParam, useI18n, type MessageKey } from '#/i18n'
import { messages } from '#/i18n/messages'
import { formatDate } from '#/lib/format'
import type { ProjectDetail } from '#/lib/projects'
import { downloadUpload } from '#/lib/uploads'

const STEP_ICON = { done: CheckCircle2Icon, current: CircleDotIcon, upcoming: CircleIcon } as const

const STATE_LABEL: Record<StepProgress['state'], MessageKey> = {
  done: 'copilot.steps.state.done',
  current: 'copilot.steps.state.current',
  upcoming: 'copilot.steps.state.upcoming',
}

const SUBMISSION_STEPS: ReadonlySet<ProcedureStep> = new Set([
  'OFFICIAL_SUBMISSION',
  'UNDER_REVIEW',
  'ACCEPTED',
])

/** Some catalog entries have no hint; fall back to nothing instead of the raw key. */
function optionalMessage(key: MessageKey): MessageKey | null {
  return key in messages.en ? key : null
}

function fieldLabel(requirementId: string, key: string): MessageKey {
  return `procedure.field.${requirementId}.${key}` as MessageKey
}

function DetailShell({
  onBack,
  title,
  children,
}: {
  onBack: () => void
  title: React.ReactNode
  children: React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <>
      <header className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
        <Button variant="ghost" size="icon-sm" aria-label={t('copilot.steps.back')} onClick={onBack}>
          <ArrowLeftIcon className="rtl:-scale-x-100" />
        </Button>
        <div className="min-w-0 flex-1 text-sm font-semibold">{title}</div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">{children}</div>
    </>
  )
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof LightbulbIcon
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" />
        {title}
      </h4>
      {children}
    </section>
  )
}

function RequirementRow({
  project,
  requirementId,
  satisfied,
  onSelect,
}: {
  project: ProjectDetail
  requirementId: string
  satisfied: boolean
  onSelect: (requirementId: string) => void
}) {
  const { t } = useI18n()
  const definition = REQUIREMENTS[requirementId]
  const requirement = project.requirements.find((r) => r.requirementId === requirementId)
  const Icon = definition ? REQUIREMENT_TYPE_ICON[definition.type] : CircleIcon
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(requirementId)}
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-start text-sm transition-colors hover:bg-muted"
      >
        <Icon className={cn('size-4 shrink-0', satisfied ? 'text-primary' : 'text-muted-foreground')} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">{t(requirementLabel(requirementId))}</span>
          {requirement?.upload?.filename ? (
            <span className="truncate text-xs text-muted-foreground">{requirement.upload.filename}</span>
          ) : null}
        </span>
        <RequirementStatusBadge
          status={requirement?.status ?? RequirementStatus.MISSING}
          className="shrink-0"
        />
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" />
      </button>
    </li>
  )
}

interface StepDetailProps {
  project: ProjectDetail
  step: ProcedureStep
  onBack: () => void
  onSelectRequirement: (requirementId: string) => void
}

/** Everything about one step: where it stands, what it still needs, guidance and submissions. */
export function StepDetail({ project, step, onBack, onSelectRequirement }: StepDetailProps) {
  const { t, locale } = useI18n()
  const service = project.serviceId ? SERVICES[project.serviceId] : undefined
  const steps = deriveSteps(project.serviceId, project.requirements, project.submissionStatus)
  const index = steps.findIndex((s) => s.step === step)
  const progress = steps[index]
  if (!progress || !service) return null

  const Icon = STEP_ICON[progress.state]
  const total = progress.requirementIds.length
  const percent =
    total > 0 ? Math.round((progress.satisfied / total) * 100) : progress.state === 'done' ? 100 : 0
  const needValid = step !== 'COLLECT_REQUIREMENTS'
  const byId = new Map(project.requirements.map((r) => [r.requirementId, r.status]))
  const satisfiedOf = (id: string) => isSatisfied(byId.get(id) ?? RequirementStatus.MISSING, needValid)
  const missing = progress.requirementIds.filter((id) => !satisfiedOf(id))
  const blockedBy =
    progress.state === 'upcoming' ? steps.slice(0, index).find((s) => s.state !== 'done') : undefined
  const submissions = SUBMISSION_STEPS.has(step) ? project.submissions : []

  return (
    <DetailShell
      onBack={onBack}
      title={
        <span className="flex items-center gap-2">
          <Icon
            className={cn(
              'size-4 shrink-0',
              progress.state === 'upcoming' ? 'text-muted-foreground' : 'text-primary',
            )}
          />
          <span className="truncate">
            {index + 1}. {t(stepTitle(step))}
          </span>
          <Badge
            variant={
              progress.state === 'current' ? 'default' : progress.state === 'done' ? 'secondary' : 'outline'
            }
          >
            {t(STATE_LABEL[progress.state])}
          </Badge>
        </span>
      }
    >
      <p className="text-sm text-muted-foreground">{t(stepDescription(step))}</p>

      {total > 0 ? (
        <Section icon={ListChecksIcon} title={t('copilot.steps.detail.progress')}>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('copilot.steps.progress', { done: progress.satisfied, total })}</span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          <Progress value={percent} className="h-1.5" />
        </Section>
      ) : null}

      <Section icon={LightbulbIcon} title={t('copilot.steps.detail.insights')}>
        <ul className="flex flex-col gap-1.5 text-sm">
          {blockedBy ? (
            <li className="flex items-start gap-2 text-muted-foreground">
              <CircleDotIcon className="mt-0.5 size-4 shrink-0" />
              {t('copilot.steps.detail.blockedBy', { step: t(stepTitle(blockedBy.step)) })}
            </li>
          ) : null}
          {total > 0 && missing.length === 0 ? (
            <li className="flex items-start gap-2">
              <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-primary" />
              {t('copilot.steps.detail.allSatisfied')}
            </li>
          ) : null}
          {missing.length > 0 ? (
            <li className="flex flex-col gap-1">
              <span className="flex items-center gap-2">
                <AlertTriangleIcon className="size-4 shrink-0 text-destructive" />
                {t('copilot.steps.detail.missing', { count: missing.length })}
              </span>
              <ul className="ms-6 flex flex-col gap-0.5">
                {missing.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => onSelectRequirement(id)}
                      className="text-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      {t(requirementLabel(id))}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ) : null}
          {total === 0 && !blockedBy ? (
            <li className="text-muted-foreground">{t('copilot.steps.detail.noRequirements')}</li>
          ) : null}
        </ul>
      </Section>

      {total > 0 ? (
        <Section icon={ListChecksIcon} title={t('copilot.steps.detail.requirements')}>
          <ul className="-mx-2 flex flex-col">
            {progress.requirementIds.map((id) => (
              <RequirementRow
                key={id}
                project={project}
                requirementId={id}
                satisfied={satisfiedOf(id)}
                onSelect={onSelectRequirement}
              />
            ))}
          </ul>
        </Section>
      ) : null}

      {SUBMISSION_STEPS.has(step) ? (
        <Section icon={SendIcon} title={t('copilot.steps.detail.submissions')}>
          {project.submissionStatus ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t('copilot.steps.detail.submissionStatus')}</span>
              <ProcedureStatusBadge status={project.submissionStatus} />
            </div>
          ) : null}
          {submissions.length > 0 ? (
            <ul className="flex flex-col divide-y rounded-md border">
              {submissions.map((submission) => (
                <li key={submission.id} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">{submission.reference}</span>
                    <ProcedureStatusBadge status={submission.status} />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(submission.submittedAt, locale)}
                    {submission.receipt
                      ? ` · ${t('copilot.steps.detail.receipt', { receipt: submission.receipt })}`
                      : ''}
                  </span>
                  {submission.note ? (
                    <p className="text-xs text-muted-foreground">{submission.note}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('copilot.steps.detail.noSubmissions')}</p>
          )}
        </Section>
      ) : null}

      <StepGuide step={progress} service={service} defaultOpen={progress.state === 'current'} />

      <Button
        variant="outline"
        size="sm"
        className="w-fit"
        render={
          <Link
            to="/{-$locale}/projects/$id"
            params={{ locale: toLocaleParam(locale), id: project.id }}
            hash={stepAnchor(step)}
          />
        }
      >
        <ExternalLinkIcon data-icon="inline-start" />
        {t('copilot.steps.detail.openOverview')}
      </Button>
    </DetailShell>
  )
}

interface RequirementDetailProps {
  project: ProjectDetail
  requirementId: string
  onBack: () => void
}

/** One requirement: its definition, the document or data provided, and where it is collected. */
export function RequirementDetail({ project, requirementId, onBack }: RequirementDetailProps) {
  const { t, locale } = useI18n()
  const [previewId, setPreviewId] = React.useState<string | null>(null)
  const definition = REQUIREMENTS[requirementId]
  const requirement = project.requirements.find((r) => r.requirementId === requirementId)
  const service = project.serviceId ? SERVICES[project.serviceId] : undefined
  const collectedIn: ProcedureStep = service?.authentication.includes(requirementId)
    ? 'AUTHENTICATION'
    : 'COLLECT_REQUIREMENTS'
  const Icon = definition ? REQUIREMENT_TYPE_ICON[definition.type] : CircleIcon
  const hint = optionalMessage(requirementHint(requirementId))
  const fields = fieldsFor(requirementId)
  const values = requirement?.value ?? {}
  const providedFields = fields.filter((field) => values[field.key])

  return (
    <DetailShell
      onBack={onBack}
      title={
        <span className="flex items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{t(requirementLabel(requirementId))}</span>
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <RequirementStatusBadge status={requirement?.status ?? RequirementStatus.MISSING} />
        {definition ? <Badge variant="outline">{t(requirementTypeLabel(definition.type))}</Badge> : null}
        <Badge variant="outline">
          {definition?.required === false
            ? t('copilot.steps.detail.optional')
            : t('copilot.steps.detail.required')}
        </Badge>
      </div>

      {hint ? <p className="text-sm text-muted-foreground">{t(hint)}</p> : null}

      <Section icon={LightbulbIcon} title={t('copilot.steps.detail.insights')}>
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          <li>{t('copilot.steps.detail.collectedIn', { step: t(stepTitle(collectedIn)) })}</li>
          {definition?.providedBy ? (
            <li>{t('procedure.requirement.providedBy', { entity: definition.providedBy.entity })}</li>
          ) : null}
          {definition?.requiredWhen ? (
            <li>{t('copilot.steps.detail.requiredWhen', { condition: definition.requiredWhen })}</li>
          ) : null}
          {definition?.notes ? <li>{definition.notes}</li> : null}
          {!requirement ? <li>{t('copilot.steps.detail.notInProject')}</li> : null}
        </ul>
      </Section>

      {definition?.type === 'document' ? (
        <Section icon={FileTextIcon} title={t('copilot.steps.detail.document')}>
          {requirement?.upload ? (
            <div className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">{requirement.upload.filename}</span>
                <UploadStatusBadge status={requirement.upload.status} />
              </div>
              <div className="flex flex-wrap gap-1">
                <Button variant="outline" size="xs" onClick={() => setPreviewId(requirement.upload!.id)}>
                  <EyeIcon data-icon="inline-start" />
                  {t('uploads.preview')}
                </Button>
                <Button variant="ghost" size="xs" onClick={() => void downloadUpload(requirement.upload!.id)}>
                  <DownloadIcon data-icon="inline-start" />
                  {t('uploads.detail.download')}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('copilot.steps.detail.noDocument')}</p>
          )}
        </Section>
      ) : null}

      {fields.length > 0 ? (
        <Section icon={ListChecksIcon} title={t('copilot.steps.detail.data')}>
          {providedFields.length > 0 ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {providedFields.map((field) => (
                <React.Fragment key={field.key}>
                  <dt className="text-muted-foreground">{t(fieldLabel(requirementId, field.key))}</dt>
                  <dd className="min-w-0 truncate font-mono text-xs leading-5">{values[field.key]}</dd>
                </React.Fragment>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">{t('copilot.steps.detail.noData')}</p>
          )}
        </Section>
      ) : null}

      {requirement?.note ? (
        <Section icon={FileTextIcon} title={t('procedure.requirement.note')}>
          <p className="text-sm whitespace-pre-wrap">{requirement.note}</p>
        </Section>
      ) : null}

      <Button
        variant="outline"
        size="sm"
        className="w-fit"
        render={
          <Link
            to="/{-$locale}/projects/$id"
            params={{ locale: toLocaleParam(locale), id: project.id }}
            hash={stepAnchor(collectedIn)}
          />
        }
      >
        <ExternalLinkIcon data-icon="inline-start" />
        {t('copilot.steps.detail.openOverview')}
      </Button>

      <FilePreviewDialog uploadId={previewId} onOpenChange={(open) => !open && setPreviewId(null)} />
    </DetailShell>
  )
}
