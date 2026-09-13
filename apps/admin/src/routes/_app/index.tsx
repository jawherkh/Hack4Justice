import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight, FileCheck2, FileText, FolderKanban, Users } from 'lucide-react'
import { Button } from '@hack4justice/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hack4justice/ui/components/card'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import { StatusBadge } from '#/components/status-badge'
import { adminKeys, getStats, listSubmissions } from '#/lib/admin'
import { formatDate } from '#/lib/format'

export const Route = createFileRoute('/_app/')({ component: Dashboard })

function Dashboard() {
  const stats = useQuery({ queryKey: adminKeys.stats, queryFn: getStats, refetchInterval: 30_000 })
  const pending = useQuery({
    queryKey: adminKeys.submissions('SUBMITTED', ''),
    queryFn: () => listSubmissions('SUBMITTED', ''),
    refetchInterval: 30_000,
  })

  const tiles = [
    { label: 'Users', value: stats.data?.users, icon: Users, to: '/users' },
    { label: 'Projects', value: stats.data?.projects, icon: FolderKanban, to: '/users' },
    { label: 'Pending review', value: stats.data?.pendingReview, icon: FileCheck2, to: '/submissions' },
    { label: 'Documents', value: stats.data?.uploads, icon: FileText, to: '/users' },
  ] as const

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">What needs attention across RNE and DGI procedures.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(({ label, value, icon: Icon, to }) => (
          <Link
            key={label}
            to={to}
            className="rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20"
          >
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              {label}
              <Icon className="size-4" />
            </div>
            {value === undefined ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
            )}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Awaiting review</CardTitle>
          <CardDescription>Submissions users have recorded but nobody has picked up yet.</CardDescription>
        </CardHeader>
        <CardContent>
          {pending.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : pending.data && pending.data.length > 0 ? (
            <ul className="divide-y rounded-lg border">
              {pending.data.slice(0, 8).map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                  <span className="font-mono text-xs">{item.reference}</span>
                  <span className="font-medium">{item.project.name}</span>
                  <span className="text-muted-foreground">{item.user.email}</span>
                  <StatusBadge status={item.status} />
                  <span className="ms-auto text-xs text-muted-foreground">
                    {formatDate(item.submittedAt)}
                  </span>
                  <Button
                    variant="outline"
                    size="xs"
                    render={<Link to="/submissions/$id" params={{ id: item.id }} />}
                  >
                    Review
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing waiting. Nice.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
