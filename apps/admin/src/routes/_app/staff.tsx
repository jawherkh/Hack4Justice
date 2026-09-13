import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { ADMIN_ROLES, AdminPermission, AdminRole, can } from '@hack4justice/shared'
import { Ban, ChevronDown, Plus, ShieldOff, Trash2 } from 'lucide-react'
import { Badge } from '@hack4justice/ui/components/badge'
import { Button } from '@hack4justice/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hack4justice/ui/components/card'
import { Field, FieldGroup, FieldLabel } from '@hack4justice/ui/components/field'
import { Input } from '@hack4justice/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hack4justice/ui/components/select'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import { Spinner } from '@hack4justice/ui/components/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@hack4justice/ui/components/table'
import { toast } from '@hack4justice/ui/components/toast'
import { cn } from '@hack4justice/ui/lib/utils'
import { SessionsTable } from '#/components/sessions-table'
import { adminKeys } from '#/lib/admin'
import { authClient } from '#/lib/auth'
import { formatDate } from '#/lib/format'

export const Route = createFileRoute('/_app/staff')({
  beforeLoad: ({ context }) => {
    const role = (context.session.user.role ?? 'support') as AdminRole
    if (!can(role, AdminPermission.MANAGE_STAFF)) throw redirect({ to: '/' })
  },
  component: StaffPage,
})

const roleItems = ADMIN_ROLES.map((value) => ({ value, label: value }))

/** Better Auth admin-plugin calls throw on error; normalise for react-query. */
async function call<T extends { data: unknown; error: { message?: string } | null }>(promise: Promise<T>) {
  const result = await promise
  if (result.error) throw new Error(result.error.message ?? 'Request failed')
  return result.data as NonNullable<T['data']>
}

function StaffPage() {
  const { session } = Route.useRouteContext()
  const queryClient = useQueryClient()
  const staff = useQuery({
    queryKey: adminKeys.staff,
    queryFn: () =>
      call(authClient.admin.listUsers({ query: { limit: 200, sortBy: 'createdAt', sortDirection: 'desc' } })),
  })
  const [form, setForm] = React.useState({
    name: '',
    email: '',
    password: '',
    role: AdminRole.SUPPORT as AdminRole,
  })
  const [expanded, setExpanded] = React.useState<string | null>(null)
  const invalidate = () => queryClient.invalidateQueries({ queryKey: adminKeys.staff })
  const onError = (err: unknown) =>
    toast.add({ type: 'error', title: err instanceof Error ? err.message : 'Request failed.' })

  const create = useMutation({
    mutationFn: () =>
      call(
        authClient.admin.createUser({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
        }),
      ),
    onSuccess: async () => {
      await invalidate()
      setForm({ name: '', email: '', password: '', role: AdminRole.SUPPORT })
      toast.add({ type: 'success', title: 'Staff account created.' })
    },
    onError,
  })
  const setRole = useMutation({
    mutationFn: (input: { userId: string; role: AdminRole }) => call(authClient.admin.setRole(input)),
    onSuccess: invalidate,
    onError,
  })
  const ban = useMutation({
    mutationFn: (userId: string) =>
      call(authClient.admin.banUser({ userId, banReason: 'Suspended by a superadmin' })),
    onSuccess: invalidate,
    onError,
  })
  const unban = useMutation({
    mutationFn: (userId: string) => call(authClient.admin.unbanUser({ userId })),
    onSuccess: invalidate,
    onError,
  })
  const remove = useMutation({
    mutationFn: (userId: string) => call(authClient.admin.removeUser({ userId })),
    onSuccess: invalidate,
    onError,
  })

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Staff</h1>
        <p className="text-sm text-muted-foreground">
          Support is read-only, admin can review submissions and manage users, superadmin also manages staff.
          Managed through Better Auth's admin plugin.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            {staff.isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : staff.isError ? (
              <p className="text-sm text-destructive">Could not load staff.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead />
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.data.users.map((member) => {
                    const self = member.id === session.user.id
                    const open = expanded === member.id
                    return (
                      <React.Fragment key={member.id}>
                        <TableRow>
                          <TableCell className="w-8">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Sessions"
                              aria-expanded={open}
                              onClick={() => setExpanded(open ? null : member.id)}
                            >
                              <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
                            </Button>
                          </TableCell>
                          <TableCell className="font-medium">
                            {member.name}
                            {self ? (
                              <Badge variant="outline" className="ms-2">
                                you
                              </Badge>
                            ) : null}
                            {member.banned ? (
                              <Badge variant="destructive" className="ms-2">
                                Banned
                              </Badge>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{member.email}</TableCell>
                          <TableCell>
                            <Select
                              items={roleItems}
                              value={(member.role as AdminRole | undefined) ?? AdminRole.SUPPORT}
                              disabled={self || setRole.isPending}
                              onValueChange={(value) =>
                                setRole.mutate({ userId: member.id, role: value as AdminRole })
                              }
                            >
                              <SelectTrigger size="sm" className="w-36">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {roleItems.map((item) => (
                                  <SelectItem key={item.value} value={item.value}>
                                    {item.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(member.createdAt)}
                          </TableCell>
                          <TableCell className="text-end whitespace-nowrap">
                            {member.banned ? (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Unban"
                                disabled={self || unban.isPending}
                                onClick={() => unban.mutate(member.id)}
                              >
                                <ShieldOff />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Ban"
                                disabled={self || ban.isPending}
                                onClick={() => ban.mutate(member.id)}
                              >
                                <Ban />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Remove"
                              disabled={self || remove.isPending}
                              onClick={() => remove.mutate(member.id)}
                            >
                              <Trash2 />
                            </Button>
                          </TableCell>
                        </TableRow>
                        {open ? (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={6} className="bg-muted/30 p-3">
                              <StaffSessions
                                userId={member.id}
                                self={self}
                                currentSessionId={session.session.id}
                              />
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </React.Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>New staff account</CardTitle>
            <CardDescription>
              Share the password out of band; there is no invitation email yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                create.mutate()
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="staff-name">Name</FieldLabel>
                  <Input
                    id="staff-name"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="staff-email">Email</FieldLabel>
                  <Input
                    id="staff-email"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="staff-password">Password (10+ characters)</FieldLabel>
                  <Input
                    id="staff-password"
                    type="password"
                    required
                    minLength={10}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel>Role</FieldLabel>
                  <Select
                    items={roleItems}
                    value={form.role}
                    onValueChange={(value) => setForm({ ...form, role: value as AdminRole })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roleItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? <Spinner data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
                Create account
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StaffSessions({
  userId,
  self,
  currentSessionId,
}: {
  userId: string
  self: boolean
  currentSessionId: string
}) {
  const queryClient = useQueryClient()
  const key = ['admin', 'staff', userId, 'sessions'] as const
  const sessions = useQuery({
    queryKey: key,
    queryFn: () => call(authClient.admin.listUserSessions({ userId })),
  })
  const onError = (err: unknown) =>
    toast.add({ type: 'error', title: err instanceof Error ? err.message : 'Request failed.' })
  const revokeOne = useMutation({
    mutationFn: (sessionToken: string) => call(authClient.admin.revokeUserSession({ sessionToken })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError,
  })
  const revokeAll = useMutation({
    mutationFn: () => call(authClient.admin.revokeUserSessions({ userId })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError,
  })
  if (sessions.isPending) return <Skeleton className="h-10 w-full" />
  if (sessions.isError) return <p className="text-sm text-destructive">Could not load sessions.</p>
  const rows = sessions.data.sessions.map((s) => ({ ...s, id: s.token }))
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Sessions</p>
        {rows.length > 0 && !self ? (
          <Button
            variant="outline"
            size="xs"
            disabled={revokeAll.isPending}
            onClick={() => revokeAll.mutate()}
          >
            Sign out everywhere
          </Button>
        ) : null}
      </div>
      <SessionsTable
        sessions={rows}
        currentId={self ? sessions.data.sessions.find((s) => s.id === currentSessionId)?.token : undefined}
        onRevoke={(token) => revokeOne.mutate(token)}
        busy={revokeOne.isPending || revokeAll.isPending}
      />
    </div>
  )
}
