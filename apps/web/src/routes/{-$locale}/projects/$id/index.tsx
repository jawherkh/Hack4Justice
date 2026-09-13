import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { SERVICES, isSatisfied } from '@hack4justice/shared'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@hack4justice/ui/components/alert-dialog'
import { Button } from '@hack4justice/ui/components/button'
import { OnboardingWizard } from '#/components/procedure/onboarding-wizard'
import { serviceName, submissionModeLabel } from '#/components/procedure/labels'
import { RequirementSheet } from '#/components/procedure/requirement-sheet'
import { StepRail } from '#/components/procedure/step-rail'
import { ProcedureStatusBadge } from '#/components/procedure/status-badges'
import { StepsTimeline } from '#/components/procedure/steps-timeline'
import { DestinationBadge } from '#/components/projects/destination-badge'
import { DestinationTile } from '#/components/projects/destination-tile'
import { ProjectActions } from '#/components/projects/project-actions'
import { toLocaleParam, useI18n } from '#/i18n'
import { formatRelative } from '#/lib/format'
import { getProject, onboardProject, projectKeys, type ProjectRequirementView } from '#/lib/projects'

export const Route = createFileRoute('/{-$locale}/projects/$id/')({ component: Overview })

function Overview() {
  const { id } = Route.useParams()
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = { locale: toLocaleParam(locale) }
  const project = useQuery({ queryKey: projectKeys.detail(id), queryFn: () => getProject(id) })
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [changing, setChanging] = React.useState(false)
  const [reselecting, setReselecting] = React.useState(false)

  // Re-run onboarding with the same service to wipe progress, then let the wizard pick a new one.
  const reset = useMutation({
    mutationFn: () => onboardProject(id, { serviceId: project.data!.serviceId!, waived: [] }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectKeys.detail(id) })
      setChanging(false)
      setReselecting(true)
    },
  })

  if (!project.data) return null
  const data = project.data

  if (!data.serviceId || reselecting) {
    return <OnboardingWizard key={data.serviceId ?? 'new'} project={data} />
  }

  const service = SERVICES[data.serviceId]
  const total = data.requirements.length
  const done = data.requirements.filter((r) => isSatisfied(r.status, true)).length
  const selected: ProjectRequirementView | null =
    data.requirements.find((r) => r.requirementId === selectedId) ?? null

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <DestinationTile destination={data.destination} size="lg" />
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight break-words">{data.name}</h1>
              <DestinationBadge destination={data.destination} />
              <ProcedureStatusBadge status={data.status} />
            </div>
            {service ? (
              <p className="text-sm">
                <span className="text-muted-foreground">{t('procedure.overview.service')}: </span>
                <span className="font-medium">{t(serviceName(service.id))}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {t(submissionModeLabel(service.submissionMode))}
                </span>
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {t('projects.detail.updated', { date: formatRelative(data.updatedAt, locale) })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setChanging(true)}>
            {t('procedure.overview.changeService')}
          </Button>
          <ProjectActions
            project={data}
            showOpen={false}
            onDeleted={() => navigate({ to: '/{-$locale}/projects', params })}
          />
        </div>
      </header>

      {/* Sticky strip: keeps progress and the step list in view while the timeline scrolls. */}
      <div className="sticky top-0 z-20 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 md:-mx-6 md:px-6">
        <StepRail project={data} done={done} total={total} />
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold">{t('procedure.overview.steps')}</h2>
        <StepsTimeline project={data} onSelectRequirement={(r) => setSelectedId(r.requirementId)} />
      </section>

      <RequirementSheet
        projectId={id}
        requirement={selected}
        onOpenChange={(open) => !open && setSelectedId(null)}
      />

      <AlertDialog open={changing} onOpenChange={setChanging}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('procedure.overview.changeService')}</AlertDialogTitle>
            <AlertDialogDescription>{t('procedure.overview.changeService.confirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('projects.delete.cancel')}</AlertDialogCancel>
            <AlertDialogAction disabled={reset.isPending} onClick={() => reset.mutate()}>
              {t('procedure.overview.changeService')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
