import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { FolderOpen } from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@hack4justice/ui/components/breadcrumb'
import { Button } from '@hack4justice/ui/components/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@hack4justice/ui/components/empty'
import { Separator } from '@hack4justice/ui/components/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@hack4justice/ui/components/sidebar'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import { LanguageSwitcher } from '#/components/language-switcher'
import { DestinationBadge } from '#/components/projects/destination-badge'
import { DestinationTile } from '#/components/projects/destination-tile'
import { ProjectActions } from '#/components/projects/project-actions'
import { ProjectSidebar } from '#/components/projects/project-sidebar'
import { toLocaleParam, useI18n } from '#/i18n'
import { ApiError } from '#/lib/api-error'
import { formatDate, formatRelative } from '#/lib/format'
import { requireAuth } from '#/lib/guards'
import { getProject, projectKeys } from '#/lib/projects'

export const Route = createFileRoute('/{-$locale}/projects/$id')({
  beforeLoad: requireAuth,
  staticData: { chrome: 'app' },
  component: ProjectWorkspace,
})

function ProjectWorkspace() {
  const { id } = Route.useParams()
  const { session } = Route.useRouteContext()
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const params = { locale: toLocaleParam(locale) }
  const project = useQuery({ queryKey: projectKeys.detail(id), queryFn: () => getProject(id) })

  return (
    <SidebarProvider style={{ '--sidebar-width': '19rem' } as React.CSSProperties}>
      {project.data ? <ProjectSidebar project={project.data} session={session} /> : null}
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger className="-ms-1" aria-label={t('projects.sidebar.toggle')} />
          <Separator orientation="vertical" className="me-2 data-vertical:h-4 data-vertical:self-auto" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink render={<Link to="/{-$locale}/projects" params={params} />}>
                  {t('projects.title')}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>
                  {project.data?.name ?? <Skeleton className="inline-block h-4 w-32 align-middle" />}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ms-auto">
            <LanguageSwitcher />
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-6 p-4 pt-0 md:p-6 md:pt-0">
          {project.isPending ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <Skeleton className="size-14 rounded-xl" />
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-7 w-64" />
                  <Skeleton className="h-4 w-40" />
                </div>
              </div>
              <Skeleton className="h-64 w-full rounded-xl" />
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

              <Empty className="flex-1 rounded-xl border border-dashed py-16">
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
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
