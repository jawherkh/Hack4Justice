import { useQuery } from '@tanstack/react-query'
import { Link, Outlet, createFileRoute, useMatchRoute } from '@tanstack/react-router'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@hack4justice/ui/components/breadcrumb'
import { Separator } from '@hack4justice/ui/components/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@hack4justice/ui/components/sidebar'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import { LanguageSwitcher } from '#/components/language-switcher'
import { NotificationsPopover } from '#/components/notifications/notifications-popover'
import { ProjectSidebar } from '#/components/projects/project-sidebar'
import { ThemeToggle } from '#/components/theme-toggle'
import { toLocaleParam, useI18n } from '#/i18n'
import { ApiError } from '#/lib/api-error'
import { requireAuth } from '#/lib/guards'
import { getProject, projectKeys } from '#/lib/projects'

/** Workspace shell: floating sidebar + breadcrumb header. Child routes render the sections. */
export const Route = createFileRoute('/{-$locale}/projects/$id')({
  beforeLoad: requireAuth,
  staticData: { chrome: 'app' },
  component: ProjectWorkspace,
})

function ProjectWorkspace() {
  const { id } = Route.useParams()
  const { session } = Route.useRouteContext()
  const { t, locale } = useI18n()
  const matchRoute = useMatchRoute()
  const params = { locale: toLocaleParam(locale) }
  const project = useQuery({ queryKey: projectKeys.detail(id), queryFn: () => getProject(id) })

  const idParams = { ...params, id }
  const section = matchRoute({ to: '/{-$locale}/projects/$id/documents', params: idParams })
    ? t('projects.sidebar.documents')
    : matchRoute({ to: '/{-$locale}/projects/$id/submission', params: idParams })
      ? t('projects.sidebar.submission')
      : null

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
                {section ? (
                  <BreadcrumbLink render={<Link to="/{-$locale}/projects/$id" params={idParams} />}>
                    {project.data?.name ?? <Skeleton className="inline-block h-4 w-32 align-middle" />}
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>
                    {project.data?.name ?? <Skeleton className="inline-block h-4 w-32 align-middle" />}
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>
              {section ? (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{section}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              ) : null}
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ms-auto flex items-center gap-1">
            <NotificationsPopover />
            <ThemeToggle />
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
            <Outlet />
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
