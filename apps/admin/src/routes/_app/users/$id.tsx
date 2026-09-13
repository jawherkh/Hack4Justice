import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Badge } from '@hack4justice/ui/components/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@hack4justice/ui/components/card'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import { StatusBadge } from '#/components/status-badge'
import { adminKeys, getUser } from '#/lib/admin'
import { formatDate, humanize } from '#/lib/format'

export const Route = createFileRoute('/_app/users/$id')({ component: UserPage })

function UserPage() {
  const { id } = Route.useParams()
  const detail = useQuery({ queryKey: adminKeys.user(id), queryFn: () => getUser(id) })

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
          <header>
            <h1 className="text-2xl font-bold tracking-tight">{detail.data.user.name}</h1>
            <p className="text-sm text-muted-foreground">
              {detail.data.user.email} · joined {formatDate(detail.data.user.createdAt)}
              {detail.data.user.emailVerified ? null : (
                <Badge variant="outline" className="ms-2">
                  Email not verified
                </Badge>
              )}
            </p>
          </header>
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
        </>
      )}
    </div>
  )
}
