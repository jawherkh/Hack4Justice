import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useMatchRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { AdminPermission, can, type AdminRole } from '@hack4justice/shared'
import { FileCheck2, LayoutDashboard, LogOut, ShieldCheck, UserCircle, Users, UserCog } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@hack4justice/ui/components/sidebar'
import { Badge } from '@hack4justice/ui/components/badge'
import { Separator } from '@hack4justice/ui/components/separator'
import { signOut } from '#/lib/auth'
import type { SessionData } from '#/lib/session'

/** Authenticated shell. Everything under it needs a staff session. */
export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context, location }) => {
    if (!context.session) throw redirect({ to: '/login', search: { redirect: location.href } })
    return { session: context.session as NonNullable<SessionData> }
  },
  component: AppShell,
})

function AppShell() {
  const { session } = Route.useRouteContext()
  const role = (session.user.role ?? 'support') as AdminRole
  const matchRoute = useMatchRoute()
  const navigate = useNavigate()
  const router = useRouter()
  const active = (to: string, fuzzy = true) => Boolean(matchRoute({ to, fuzzy }))

  return (
    <SidebarProvider>
      <Sidebar variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" render={<Link to="/" />}>
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <ShieldCheck className="size-4" />
                </span>
                <span className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Dalil Admin</span>
                  <span className="text-xs text-muted-foreground">Back office</span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Operations</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={active('/', false)} render={<Link to="/" />}>
                  <LayoutDashboard />
                  Dashboard
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={active('/submissions')} render={<Link to="/submissions" />}>
                  <FileCheck2 />
                  Submissions
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={active('/users')} render={<Link to="/users" />}>
                  <Users />
                  Users
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarMenu>
              {can(role, AdminPermission.MANAGE_STAFF) ? (
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={active('/staff')} render={<Link to="/staff" />}>
                    <UserCog />
                    Staff
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}
              <SidebarMenuItem>
                <SidebarMenuButton isActive={active('/account')} render={<Link to="/account" />}>
                  <UserCircle />
                  My account
                </SidebarMenuButton>
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
                isActive={active('/account')}
                render={<Link to="/account" />}
              >
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-muted text-sm font-medium uppercase">
                  {session.user.name.slice(0, 1)}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5 leading-none">
                  <span className="truncate font-medium">{session.user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{session.user.email}</span>
                </span>
                <Badge variant="outline" className="ms-auto">
                  {role}
                </Badge>
              </SidebarMenuButton>
              <SidebarMenuAction
                aria-label="Sign out"
                title="Sign out"
                className="top-1/2 -translate-y-1/2"
                onClick={async () => {
                  await signOut()
                  await router.invalidate()
                  await navigate({ to: '/login' })
                }}
              >
                <LogOut />
              </SidebarMenuAction>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="flex h-14 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger className="-ms-1" />
          <Separator orientation="vertical" className="me-2 data-vertical:h-4 data-vertical:self-auto" />
          <span className="text-sm text-muted-foreground">Signed in as {session.user.name}</span>
        </header>
        <div className="flex min-w-0 flex-1 flex-col gap-6 p-4 pt-0 md:p-6 md:pt-0">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
