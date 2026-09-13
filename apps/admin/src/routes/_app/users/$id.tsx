import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { AdminPermission, can, type AdminRole } from '@hack4justice/shared'
import { ArrowLeft, Ban, ShieldOff } from 'lucide-react'
import { Badge } from '@hack4justice/ui/components/badge'
import { Button } from '@hack4justice/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hack4justice/ui/components/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@hack4justice/ui/components/dialog'
import { Field, FieldLabel } from '@hack4justice/ui/components/field'
import { Input } from '@hack4justice/ui/components/input'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import { Textarea } from '@hack4justice/ui/components/textarea'
import { toast } from '@hack4justice/ui/components/toast'
import { SessionsTable } from '#/components/sessions-table'
import { StatusBadge } from '#/components/status-badge'
import { adminKeys, banUser, getUser, revokeUserSession, revokeUserSessions, unbanUser } from '#/lib/admin'
import { ApiError } from '#/lib/api'
import { formatDate, humanize } from '#/lib/format'

export const Route = createFileRoute('/_app/users/$id')({ component: UserPage })

function UserPage() {
  const { id } = Route.useParams()
  const { session } = Route.useRouteContext()
  const role = (session.user.role ?? 'support') as AdminRole
  const canManage = can(role, AdminPermission.MANAGE_USERS)
  const queryClient = useQueryClient()
  const detail = useQuery({ queryKey: adminKeys.user(id), queryFn: () => getUser(id) })
  const [banning, setBanning] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [days, setDays] = React.useState('')

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin'] })
  const onError = (err: unknown) =>
    toast.add({ type: 'error', title: err instanceof ApiError ? err.message : 'Request failed.' })
  const ban = useMutation({
    mutationFn: () =>
      banUser(id, {
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(days ? { expiresInDays: Number(days) } : {}),
      }),
    onSuccess: async () => {
      await refresh()
      setBanning(false)
      toast.add({ type: 'success', title: 'User banned and signed out everywhere.' })
    },
    onError,
  })
  const unban = useMutation({ mutationFn: () => unbanUser(id), onSuccess: refresh, onError })
  const revokeAll = useMutation({ mutationFn: () => revokeUserSessions(id), onSuccess: refresh, onError })
  const revokeOne = useMutation({
    mutationFn: (sessionId: string) => revokeUserSession(id, sessionId),
    onSuccess: refresh,
    onError,
  })

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/users"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Users
      </Link>
      {detail.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : detail.isError ? (
        <p className="text-sm text-destructive">Could not load this user.</p>
      ) : (
        <>
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{detail.data.user.name}</h1>
                {detail.data.user.banned ? <Badge variant="destructive">Banned</Badge> : null}
                {detail.data.user.emailVerified ? null : <Badge variant="outline">Email not verified</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                {detail.data.user.email} · joined {formatDate(detail.data.user.createdAt)}
              </p>
              {detail.data.user.banned ? (
                <p className="mt-1 text-sm text-destructive">
                  {detail.data.user.banReason ?? 'No reason given'}
                  {detail.data.user.banExpires
                    ? ` · until ${formatDate(detail.data.user.banExpires)}`
                    : ' · permanent'}
                </p>
              ) : null}
            </div>
            {canManage ? (
              detail.data.user.banned ? (
                <Button variant="outline" disabled={unban.isPending} onClick={() => unban.mutate()}>
                  <ShieldOff data-icon="inline-start" />
                  Unban
                </Button>
              ) : (
                <Button variant="destructive" onClick={() => setBanning(true)}>
                  <Ban data-icon="inline-start" />
                  Ban user
                </Button>
              )
            ) : null}
          </header>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Sessions</CardTitle>
                <CardDescription>Devices currently signed in to the web app.</CardDescription>
              </div>
              {canManage && detail.data.sessions.length > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={revokeAll.isPending}
                  onClick={() => revokeAll.mutate()}
                >
                  Sign out everywhere
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              <SessionsTable
                sessions={detail.data.sessions}
                onRevoke={canManage ? (sid) => revokeOne.mutate(sid) : undefined}
                busy={revokeOne.isPending || revokeAll.isPending}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Projects</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.data.projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No projects yet.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {detail.data.projects.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                      <Badge variant="secondary">{p.destination}</Badge>
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground">
                        {p.serviceId ? humanize(p.serviceId) : 'No service yet'}
                      </span>
                      <StatusBadge status={p.status} />
                      <span className="ms-auto text-xs text-muted-foreground">{formatDate(p.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Submissions</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.data.submissions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No submissions yet.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {detail.data.submissions.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                      <Link
                        to="/submissions/$id"
                        params={{ id: s.id }}
                        className="font-mono text-xs hover:underline"
                      >
                        {s.reference}
                      </Link>
                      <span className="text-muted-foreground">{humanize(s.serviceId)}</span>
                      <StatusBadge status={s.status} />
                      <span className="ms-auto text-xs text-muted-foreground">
                        {formatDate(s.submittedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Dialog open={banning} onOpenChange={setBanning}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ban {detail.data.user.name}</DialogTitle>
                <DialogDescription>
                  They are signed out everywhere and cannot sign in until the ban ends or is lifted.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <Field>
                  <FieldLabel htmlFor="ban-reason">Reason (shown to staff)</FieldLabel>
                  <Textarea
                    id="ban-reason"
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ban-days">Duration in days (empty = permanent)</FieldLabel>
                  <Input
                    id="ban-days"
                    type="number"
                    min={1}
                    max={3650}
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                  />
                </Field>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBanning(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" disabled={ban.isPending} onClick={() => ban.mutate()}>
                  Ban user
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}
