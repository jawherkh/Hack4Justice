import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { fieldsFor, type ProcedureStatus, type RequirementStatus } from '@hack4justice/shared'
import {
  SERVICES,
  SubmissionStatus,
  isSatisfied,
  type SubmissionStatus as SubmissionStatusType,
} from '@hack4justice/shared'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileDown,
  FolderArchive,
  Send,
} from 'lucide-react'
import { Button } from '@hack4justice/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hack4justice/ui/components/card'
import { toast } from '@hack4justice/ui/components/toast'
import { toLocaleParam, useI18n } from '#/i18n'
import { formatDate } from '#/lib/format'
import { ApiError } from '#/lib/api-error'
import {
  exportSubmission,
  projectKeys,
  setSubmissionStatus,
  type ProjectDetail,
  type ProjectSubmission,
} from '#/lib/projects'
import {
  humanize,
  procedureStatusLabel,
  requirementLabel,
  requirementStatusLabel,
  serviceName,
  submissionModeLabel,
} from './labels'
import { fieldLabel } from './requirement-fields'
import { ProcedureStatusBadge } from './status-badges'
import { SubmitDialog } from './submit-dialog'

/** What the user records after acting on the official channel. The app itself never submits. */
export function SubmissionPanel({ project }: { project: ProjectDetail }) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const [submitting, setSubmitting] = React.useState(false)

  // Translated strings the API needs to print the cover sheet in the user's language.
  const exportLabels = (item: ProjectSubmission): Record<string, string> => {
    const labels: Record<string, string> = {
      service: t(serviceName(item.serviceId)),
      [`status:${item.status}`]: t(procedureStatusLabel(item.status as ProcedureStatus)),
    }
    for (const r of item.snapshot.requirements) {
      labels[`req:${r.requirementId}`] = t(requirementLabel(r.requirementId))
      labels[`rstatus:${r.status}`] = t(requirementStatusLabel(r.status as RequirementStatus))
      for (const field of fieldsFor(r.requirementId)) {
        labels[`field:${r.requirementId}.${field.key}`] = t(fieldLabel(r.requirementId, field.key))
      }
      labels[`field:${r.requirementId}.details`] = t('procedure.field.otherDetails')
    }
    return labels
  }
  const doExport = useMutation({
    mutationFn: (input: { item: ProjectSubmission; format: 'pdf' | 'zip' }) =>
      exportSubmission(project.id, input.item.id, input.format, exportLabels(input.item)),
    onError: () => toast.add({ type: 'error', title: t('procedure.submissions.export.error') }),
  })
  const params = { locale: toLocaleParam(locale), id: project.id }
  const service = project.serviceId ? SERVICES[project.serviceId] : undefined

  const update = useMutation({
    mutationFn: (status: SubmissionStatusType | null) => setSubmissionStatus(project.id, status),
    onSuccess: (detail) => {
      queryClient.setQueryData(projectKeys.detail(project.id), detail)
      void queryClient.invalidateQueries({ queryKey: projectKeys.all })
      toast.add({ type: 'success', title: t('procedure.submission.updated') })
    },
    onError: (err) =>
      toast.add({
        type: 'error',
        title: t('procedure.submission.error'),
        description: err instanceof ApiError ? err.message : t('auth.error.generic'),
      }),
  })

  if (!service) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">
          {t('procedure.submission.onboardFirst')}
        </CardContent>
      </Card>
    )
  }

  const missing = project.requirements.filter((r) => !isSatisfied(r.status, true))
  const ready = missing.length === 0
  const current = project.submissionStatus
  const pending = update.isPending
  // The newest submission first; the list is ordered by submission date.
  const latest = project.submissions[0]
  // A reviewer has ruled on this one. The outcome is theirs to state, not the applicant's,
  // so the buttons that would contradict it are not offered. Going back to preparation
  // stays available, because that is how a refusal gets corrected and submitted again.
  const reviewed = Boolean(latest?.reviewedAt)

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t('procedure.submission.current')}
            <ProcedureStatusBadge status={project.status} />
          </CardTitle>
          <CardDescription>{t('procedure.submission.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted-foreground">{t('procedure.submission.channel')}</dt>
            <dd className="flex flex-wrap gap-1.5">
              <span className="font-medium">{t(submissionModeLabel(service.submissionMode))}</span>
              {service.channels.length ? (
                <span className="text-muted-foreground">· {service.channels.map(humanize).join(', ')}</span>
              ) : null}
            </dd>
            <dt className="text-muted-foreground">{t('procedure.submission.outputs')}</dt>
            <dd>{service.outputs.map(humanize).join(', ')}</dd>
          </dl>

          {current === null && !ready ? (
            <div className="flex flex-col gap-2 rounded-lg border border-dashed p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="size-4 text-destructive" />
                {t('procedure.submission.notReady')}
              </p>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t('procedure.submission.missing')}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {missing.map((r) => (
                  <li key={r.requirementId} className="rounded-md bg-muted px-2 py-0.5 text-xs">
                    {t(requirementLabel(r.requirementId))}
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                render={<Link to="/{-$locale}/projects/$id" params={params} />}
              >
                <ArrowLeft data-icon="inline-start" className="rtl:rotate-180" />
                {t('projects.sidebar.overview')}
              </Button>
            </div>
          ) : null}

          {current === null && ready ? (
            <div className="flex flex-col gap-3 rounded-lg border p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="size-4 text-primary" />
                {t('procedure.submission.ready')}
              </p>
              <Button className="self-start" onClick={() => setSubmitting(true)}>
                <Send data-icon="inline-start" />
                {t('procedure.submit.button')}
              </Button>
            </div>
          ) : null}

          {(current === 'SUBMITTED' || current === 'UNDER_REVIEW') && !reviewed ? (
            <div className="flex flex-wrap gap-2">
              {current === 'SUBMITTED' ? (
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => update.mutate(SubmissionStatus.UNDER_REVIEW)}
                >
                  {t('procedure.submission.mark.UNDER_REVIEW')}
                </Button>
              ) : null}
              <Button disabled={pending} onClick={() => update.mutate(SubmissionStatus.ACCEPTED)}>
                {t('procedure.submission.mark.ACCEPTED')}
              </Button>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => update.mutate(SubmissionStatus.REJECTED)}
              >
                {t('procedure.submission.mark.REJECTED')}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => update.mutate(null)}>
                {t('procedure.submission.reset')}
              </Button>
            </div>
          ) : null}

          {(current === 'SUBMITTED' || current === 'UNDER_REVIEW') && reviewed ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{t('procedure.submission.reviewed')}</p>
              {latest?.reviewNote ? (
                <p className="rounded-lg bg-muted p-3 text-sm">{latest.reviewNote}</p>
              ) : null}
              <Button
                variant="ghost"
                className="self-start"
                disabled={pending}
                onClick={() => update.mutate(null)}
              >
                {t('procedure.submission.reset')}
              </Button>
            </div>
          ) : null}

          {current === 'REJECTED' ? (
            <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              {service.rejectionEffects.length ? (
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {t('procedure.submission.effects')}
                  </p>
                  <ul className="list-disc ps-4 text-sm">
                    {service.rejectionEffects.map((effect) => (
                      <li key={effect}>{effect}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <Button
                variant="outline"
                className="self-start"
                disabled={pending}
                onClick={() => update.mutate(null)}
              >
                <ArrowLeft data-icon="inline-start" className="rtl:rotate-180" />
                {t('procedure.submission.reset')}
              </Button>
            </div>
          ) : null}

          {current === 'ACCEPTED' ? (
            <div className="flex flex-col gap-2 rounded-lg border p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="size-4 text-primary" />
                {t('procedure.status.ACCEPTED')}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {service.outputs.map((output) => (
                  <li key={output} className="rounded-md bg-muted px-2 py-0.5 text-xs">
                    {humanize(output)}
                  </li>
                ))}
              </ul>
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                disabled={pending}
                onClick={() => update.mutate(null)}
              >
                {t('procedure.submission.reset')}
              </Button>
            </div>
          ) : null}

          {service.channels.some((c) => c.includes('online')) ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ExternalLink className="size-3.5" />
              {service.channels.map(humanize).join(' · ')}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('procedure.submissions.history')}</CardTitle>
        </CardHeader>
        <CardContent>
          {project.submissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('procedure.submissions.empty')}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {project.submissions.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                  <span className="font-mono text-xs font-medium">{item.reference}</span>
                  <ProcedureStatusBadge status={item.status} />
                  <span className="text-muted-foreground">
                    {t('procedure.submissions.submittedAt', { date: formatDate(item.submittedAt, locale) })}
                  </span>
                  <span className="text-muted-foreground">
                    {t('procedure.submissions.items', { count: item.snapshot.requirements.length })}
                  </span>
                  {item.receipt ? (
                    <span className="text-muted-foreground">
                      {t('procedure.submissions.receipt')}:{' '}
                      <span className="text-foreground">{item.receipt}</span>
                    </span>
                  ) : null}
                  {item.note ? (
                    <span className="w-full text-xs text-muted-foreground">{item.note}</span>
                  ) : null}
                  <span className="flex w-full flex-wrap gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={doExport.isPending}
                      onClick={() => doExport.mutate({ item, format: 'pdf' })}
                    >
                      <FileDown data-icon="inline-start" />
                      {t('procedure.submissions.export.pdf')}
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={doExport.isPending}
                      onClick={() => doExport.mutate({ item, format: 'zip' })}
                    >
                      <FolderArchive data-icon="inline-start" />
                      {t('procedure.submissions.export.zip')}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <SubmitDialog project={project} open={submitting} onOpenChange={setSubmitting} />
    </div>
  )
}
