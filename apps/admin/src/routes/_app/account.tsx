import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Badge } from '@hack4justice/ui/components/badge'
import { Button } from '@hack4justice/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hack4justice/ui/components/card'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import { toast } from '@hack4justice/ui/components/toast'
import { SessionsTable } from '#/components/sessions-table'
import { adminKeys } from '#/lib/admin'
import { authClient } from '#/lib/auth'

export const Route = createFileRoute('/_app/account')({ component: AccountPage })

function AccountPage() {
  const { session } = Route.useRouteContext()
  const queryClient = useQueryClient()
  const sessions = useQuery({
    queryKey: adminKeys.mySessions,
    queryFn: async () => {
      const result = await authClient.listSessions()
      if (result.error) throw new Error(result.error.message ?? 'Could not load sessions')
      return result.data
    },
  })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: adminKeys.mySessions })
  const onError = (err: unknown) =>
    toast.add({ type: 'error', title: err instanceof Error ? err.message : 'Request failed.' })
  const revokeOne = useMutation({
    mutationFn: async (token: string) => {
      const r = await authClient.revokeSession({ token })
      if (r.error) throw new Error(r.error.message ?? 'Failed')
    },
    onSuccess: invalidate,
    onError,
  })
  const revokeOthers = useMutation({
    mutationFn: async () => {
      const r = await authClient.revokeOtherSessions()
      if (r.error) throw new Error(r.error.message ?? 'Failed')
    },
    onSuccess: async () => {
      await invalidate()
      toast.add({ type: 'success', title: 'Other sessions signed out.' })
    },
    onError,
  })

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">My account</h1>
        <p className="text-sm text-muted-foreground">
          {session.user.email}{' '}
          <Badge variant="outline" className="ms-1">
            {session.user.role ?? 'support'}
          </Badge>
        </p>
      </header>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Sessions</CardTitle>
            <CardDescription>Where this staff account is signed in.</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={revokeOthers.isPending}
            onClick={() => revokeOthers.mutate()}
          >
            Sign out other devices
          </Button>
        </CardHeader>
        <CardContent>
          {sessions.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : sessions.isError ? (
            <p className="text-sm text-destructive">Could not load sessions.</p>
          ) : (
            <SessionsTable
              sessions={sessions.data.map((s) => ({ ...s, id: s.token }))}
              currentId={sessions.data.find((s) => s.id === session.session.id)?.token}
              onRevoke={(token) => revokeOne.mutate(token)}
              busy={revokeOne.isPending}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
