import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useMatchRoute, useNavigate, useRouter } from '@tanstack/react-router'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@hack4justice/ui/components/sidebar'
import { ArrowLeftIcon } from '@hack4justice/ui/components/icons/arrow-left'
import { FileTextIcon } from '@hack4justice/ui/components/icons/file-text'
import { LayoutPanelTopIcon } from '@hack4justice/ui/components/icons/layout-panel-top'
import { LogoutIcon } from '@hack4justice/ui/components/icons/logout'
import { SendIcon } from '@hack4justice/ui/components/icons/send'
import { SparklesIcon } from '@hack4justice/ui/components/icons/sparkles'
import { cn } from '@hack4justice/ui/lib/utils'
import { toLocaleParam, useI18n, type MessageKey } from '#/i18n'
import { CopilotSidebarThreads } from '#/components/copilot/sidebar-threads'
import { signOut } from '#/lib/auth'
import { listProjects, projectKeys, type ProjectDetail, type ProjectSummary } from '#/lib/projects'
import type { SessionData } from '#/lib/session'
import { DESTINATION_META } from './destination'

interface ProjectSidebarProps extends React.ComponentProps<typeof Sidebar> {
  project: ProjectDetail
  session: NonNullable<SessionData>
}

interface IconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

/** lucide-animated icon: a div-wrapped SVG whose animation we drive from the parent button. */
type AnimatedIcon = React.ForwardRefExoticComponent<
  React.HTMLAttributes<HTMLDivElement> & { size?: number } & React.RefAttributes<IconHandle>
>

type Section = 'overview' | 'documents' | 'submission' | 'copilot'

const SECTIONS: { key: Section; label: MessageKey; icon: AnimatedIcon }[] = [
  { key: 'overview', label: 'projects.sidebar.overview', icon: LayoutPanelTopIcon },
  { key: 'documents', label: 'projects.sidebar.documents', icon: FileTextIcon },
  { key: 'submission', label: 'projects.sidebar.submission', icon: SendIcon },
  { key: 'copilot', label: 'projects.sidebar.copilot', icon: SparklesIcon },
]

/** Plays the icon animation while the whole row is hovered, not just the icon. */
function useIconHover() {
  const ref = React.useRef<IconHandle>(null)
  return {
    ref,
    onMouseEnter: () => ref.current?.startAnimation(),
    onMouseLeave: () => ref.current?.stopAnimation(),
  }
}

function AnimatedMenuButton({
  icon: Icon,
  iconClassName,
  children,
  ...props
}: React.ComponentProps<typeof SidebarMenuButton> & { icon: AnimatedIcon; iconClassName?: string }) {
  const { ref, onMouseEnter, onMouseLeave } = useIconHover()
  return (
    <SidebarMenuButton {...props} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <Icon ref={ref} size={16} className={cn('flex shrink-0', iconClassName)} />
      {children}
    </SidebarMenuButton>
  )
}

/** One of the user's projects as a small card: agency, name and description, for quick switching. */
function ProjectBox({ project, active }: { project: ProjectSummary; active: boolean }) {
  const { t, locale } = useI18n()
  const meta = DESTINATION_META[project.destination]
  return (
    <Link
      to="/{-$locale}/projects/$id"
      params={{ locale: toLocaleParam(locale), id: project.id }}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-start gap-2.5 rounded-lg border bg-sidebar p-2 text-start transition-colors outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        active ? 'border-primary/60 bg-sidebar-accent' : 'border-sidebar-border',
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-white p-1">
        <img src={meta.logo} alt="" draggable={false} className="size-full object-contain" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm leading-tight font-medium">{project.name}</span>
          <span className="shrink-0 rounded-sm bg-muted px-1 py-px text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            {t(meta.label)}
          </span>
        </span>
        <span className="truncate text-[11px] text-muted-foreground">{t(meta.full)}</span>
        {project.description ? (
          <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">
            {project.description}
          </span>
        ) : null}
      </span>
    </Link>
  )
}

/** Workspace navigation for one project, plus a quick switch to the user's other projects. */
export function ProjectSidebar({ project, session, ...props }: ProjectSidebarProps) {
  const { t, locale } = useI18n()
  const params = { locale: toLocaleParam(locale) }
  const navigate = useNavigate()
  const router = useRouter()
  const matchRoute = useMatchRoute()
  const meta = DESTINATION_META[project.destination]
  const projects = useQuery({ queryKey: projectKeys.all, queryFn: listProjects })
  const logoutIcon = useIconHover()

  const idParams = { ...params, id: project.id }
  const active: Section = matchRoute({ to: '/{-$locale}/projects/$id/documents', params: idParams })
    ? 'documents'
    : matchRoute({ to: '/{-$locale}/projects/$id/submission', params: idParams })
      ? 'submission'
      : matchRoute({ to: '/{-$locale}/projects/$id/copilot', params: idParams, fuzzy: true })
        ? 'copilot'
        : 'overview'

  return (
    <Sidebar variant="floating" side={locale === 'ar' ? 'right' : 'left'} {...props}>
      <SidebarHeader>
        <Link
          to="/{-$locale}"
          params={params}
          aria-label={t('meta.title')}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <img src="/brand/dalil-mark.svg" alt="" draggable={false} className="size-7 rounded-md dark:hidden" />
          <img
            src="/brand/dalil-mark-dark.svg"
            alt=""
            draggable={false}
            className="hidden size-7 rounded-md dark:block"
          />
          <span className="text-base font-semibold tracking-tight">{t('meta.title')}</span>
        </Link>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/{-$locale}/projects/$id" params={idParams} />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg border bg-white p-1">
                <img src={meta.logo} alt="" draggable={false} className="size-full object-contain" />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5 leading-none">
                <span className="truncate font-medium">{project.name}</span>
                <span className="truncate text-xs text-muted-foreground">{t(meta.full)}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('projects.sidebar.project')}</SidebarGroupLabel>
          <SidebarMenu>
            {SECTIONS.map(({ key, label, icon }) => (
              <SidebarMenuItem key={key}>
                <AnimatedMenuButton
                  icon={icon}
                  isActive={active === key}
                  className={cn(key === 'copilot' && 'pe-8')}
                  render={
                    key === 'overview' ? (
                      <Link to="/{-$locale}/projects/$id" params={idParams} />
                    ) : key === 'documents' ? (
                      <Link to="/{-$locale}/projects/$id/documents" params={idParams} />
                    ) : key === 'copilot' ? (
                      <Link to="/{-$locale}/projects/$id/copilot" params={idParams} />
                    ) : (
                      <Link to="/{-$locale}/projects/$id/submission" params={idParams} />
                    )
                  }
                >
                  {t(label)}
                </AnimatedMenuButton>
                {key === 'copilot' ? <CopilotSidebarThreads projectId={project.id} /> : null}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{t('projects.sidebar.projects')}</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <AnimatedMenuButton
                icon={ArrowLeftIcon}
                iconClassName="rtl:rotate-180"
                render={<Link to="/{-$locale}/projects" params={params} />}
              >
                {t('projects.sidebar.allProjects')}
              </AnimatedMenuButton>
              {projects.data?.length ? (
                <ul className="flex flex-col gap-1.5 px-1 pt-1.5 group-data-[collapsible=icon]:hidden">
                  {projects.data.map((item) => (
                    <li key={item.id}>
                      <ProjectBox project={item} active={item.id === project.id} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="pe-9"
              render={<Link to="/{-$locale}/account" params={params} />}
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-medium text-sidebar-primary-foreground uppercase">
                {session.user.name.slice(0, 1)}
              </div>
              <div className="flex min-w-0 flex-col gap-0.5 leading-none">
                <span className="truncate font-medium">{session.user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{session.user.email}</span>
              </div>
            </SidebarMenuButton>
            <SidebarMenuAction
              aria-label={t('nav.logout')}
              title={t('nav.logout')}
              className="top-1/2 -translate-y-1/2 rtl:right-auto rtl:left-1"
              onMouseEnter={logoutIcon.onMouseEnter}
              onMouseLeave={logoutIcon.onMouseLeave}
              onClick={async () => {
                await signOut()
                await router.invalidate()
                await navigate({ to: '/{-$locale}', params })
              }}
            >
              <LogoutIcon ref={logoutIcon.ref} size={16} className="flex" />
            </SidebarMenuAction>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
