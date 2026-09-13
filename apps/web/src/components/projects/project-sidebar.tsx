import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { ArrowLeft, ClipboardList, FileText, LayoutDashboard, LogOut, Send } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from '@hack4justice/ui/components/sidebar'
import { toLocaleParam, useI18n, type MessageKey } from '#/i18n'
import { signOut } from '#/lib/auth'
import { listProjects, projectKeys, type ProjectDetail } from '#/lib/projects'
import type { SessionData } from '#/lib/session'
import { DESTINATION_META } from './destination'

interface ProjectSidebarProps extends React.ComponentProps<typeof Sidebar> {
  project: ProjectDetail
  session: NonNullable<SessionData>
}

const SECTIONS: { key: MessageKey; icon: typeof FileText; ready: boolean }[] = [
  { key: 'projects.sidebar.overview', icon: LayoutDashboard, ready: true },
  { key: 'projects.sidebar.documents', icon: FileText, ready: false },
  { key: 'projects.sidebar.requirements', icon: ClipboardList, ready: false },
  { key: 'projects.sidebar.submissions', icon: Send, ready: false },
]

/** Workspace navigation for one project, plus a quick switch to the user's other projects. */
export function ProjectSidebar({ project, session, ...props }: ProjectSidebarProps) {
  const { t, locale } = useI18n()
  const params = { locale: toLocaleParam(locale) }
  const navigate = useNavigate()
  const router = useRouter()
  const meta = DESTINATION_META[project.destination]
  const projects = useQuery({ queryKey: projectKeys.all, queryFn: listProjects })

  return (
    <Sidebar variant="floating" side={locale === 'ar' ? 'right' : 'left'} {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link to="/{-$locale}/projects/$id" params={{ ...params, id: project.id }} />}
            >
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
            {SECTIONS.map(({ key, icon: Icon, ready }) => (
              <SidebarMenuItem key={key}>
                {ready ? (
                  <SidebarMenuButton
                    isActive
                    render={<Link to="/{-$locale}/projects/$id" params={{ ...params, id: project.id }} />}
                  >
                    <Icon />
                    {t(key)}
                  </SidebarMenuButton>
                ) : (
                  <>
                    <SidebarMenuButton disabled aria-disabled>
                      <Icon />
                      {t(key)}
                    </SidebarMenuButton>
                    <SidebarMenuBadge className="rtl:right-auto rtl:left-1">
                      {t('projects.sidebar.soon')}
                    </SidebarMenuBadge>
                  </>
                )}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{t('projects.sidebar.projects')}</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link to="/{-$locale}/projects" params={params} />}>
                <ArrowLeft className="rtl:rotate-180" />
                {t('projects.sidebar.allProjects')}
              </SidebarMenuButton>
              {projects.data?.length ? (
                <SidebarMenuSub className="ml-0 border-l-0 px-1.5">
                  {projects.data.map((item) => (
                    <SidebarMenuSubItem key={item.id}>
                      <SidebarMenuSubButton
                        isActive={item.id === project.id}
                        render={<Link to="/{-$locale}/projects/$id" params={{ ...params, id: item.id }} />}
                      >
                        <span className="truncate">{item.name}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
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
              onClick={async () => {
                await signOut()
                await router.invalidate()
                await navigate({ to: '/{-$locale}', params })
              }}
            >
              <LogOut />
            </SidebarMenuAction>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
