import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, FolderOpen } from 'lucide-react'
import { Button } from '@hack4justice/ui/components/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@hack4justice/ui/components/empty'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import { DestinationBadge } from '#/components/projects/destination-badge'
import { DestinationTile } from '#/components/projects/destination-tile'
import { ProjectActions } from '#/components/projects/project-actions'
import { toLocaleParam, useI18n } from '#/i18n'
import { ApiError } from '#/lib/api-error'
import { formatDate, formatRelative } from '#/lib/format'
import { requireAuth } from '#/lib/guards'
import { getProject, projectKeys } from '#/lib/projects'

export const Route = createFileRoute('/{-$locale}/projects/$id')({
  beforeLoad: requireAuth,
  component: ProjectDetail,
})

function ProjectDetail() {
  const { id } = Route.useParams()
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const params = { locale: toLocaleParam(locale) }
  const project = useQuery({ queryKey: projectKeys.detail(id), queryFn: () => getProject(id) })

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <Link
        to="/{-$locale}/projects"
        params={params}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t('projects.detail.back')}
      </Link>

      {project.isPending ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <Skeleton className="size-12 rounded-xl" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-7 w-64" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : project.isError ? (
        <p className="text-sm text-destructive">
          {project.error instanceof ApiError ? project.error.message : t('projects.loadError')}
        </p>
      ) : (
        <>
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <DestinationTile destination={project.data.destination} size="lg" />
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight break-words">{project.data.name}</h1>
                  <DestinationBadge destination={project.data.destination} />
                </div>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  {project.data.description ?? (
                    <span className="italic">{t('projects.detail.noDescription')}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('projects.detail.created', { date: formatDate(project.data.createdAt, locale) })}
                  {' · '}
                  {t('projects.detail.updated', { date: formatRelative(project.data.updatedAt, locale) })}
                </p>
              </div>
            </div>
            <ProjectActions
              project={project.data}
              showOpen={false}
              onDeleted={() => navigate({ to: '/{-$locale}/projects', params })}
            />
          </header>

          <Empty className="rounded-2xl border border-dashed py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderOpen />
              </EmptyMedia>
              <EmptyTitle>{t('projects.detail.workspace.title')}</EmptyTitle>
              <EmptyDescription>{t('projects.detail.workspace.description')}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" render={<Link to="/{-$locale}/uploads" params={params} />}>
                {t('projects.detail.workspace.uploads')}
              </Button>
            </EmptyContent>
          </Empty>
        </>
      )}
    </main>
  )
}
