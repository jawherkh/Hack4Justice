import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { Search } from 'lucide-react'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@hack4justice/ui/components/input-group'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@hack4justice/ui/components/table'
import { ToggleGroup, ToggleGroupItem } from '@hack4justice/ui/components/toggle-group'
import { StatusBadge } from '#/components/status-badge'
import { adminKeys, listSubmissions } from '#/lib/admin'
import { formatDate, humanize } from '#/lib/format'

const STATUSES = ['', 'SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED'] as const
const statusSchema = z.enum(STATUSES).optional().catch(undefined)
const searchSchema = z.object({ status: statusSchema, q: z.string().optional() })

export const Route = createFileRoute('/_app/submissions/')({
  validateSearch: searchSchema,
  component: SubmissionsPage,
})

function SubmissionsPage() {
  const { status = '', q = '' } = Route.useSearch()
  const navigate = Route.useNavigate()
  const [search, setSearch] = React.useState(q)
  React.useEffect(() => {
    const id = setTimeout(
      () => void navigate({ search: (prev) => ({ ...prev, q: search || undefined }), replace: true }),
      250,
    )
    return () => clearTimeout(id)
  }, [search, navigate])
  const submissions = useQuery({
    queryKey: adminKeys.submissions(status, q),
    queryFn: () => listSubmissions(status, q),
    refetchInterval: 30_000,
  })

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Submissions</h1>
          <p className="text-sm text-muted-foreground">
            Dossiers users have declared as filed with the RNE or the DGI.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            variant="outline"
            spacing={0}
            value={[status || 'all']}
            onValueChange={(values) =>
              void navigate({
                search: (prev) => ({
                  ...prev,
                  status: statusSchema.parse(values[0]) || undefined,
                }),
              })
            }
          >
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="SUBMITTED">Submitted</ToggleGroupItem>
            <ToggleGroupItem value="UNDER_REVIEW">Under review</ToggleGroupItem>
            <ToggleGroupItem value="ACCEPTED">Accepted</ToggleGroupItem>
            <ToggleGroupItem value="REJECTED">Rejected</ToggleGroupItem>
          </ToggleGroup>
          <InputGroup className="sm:w-64">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              placeholder="Reference, project, user"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
        </div>
      </header>
      {submissions.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.data?.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link
                      to="/submissions/$id"
                      params={{ id: s.id }}
                      className="font-mono text-xs hover:underline"
                    >
                      {s.reference}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className="me-2 rounded bg-muted px-1.5 py-0.5 text-xs">
                      {s.project.destination}
                    </span>
                    {s.project.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{humanize(s.serviceId)}</TableCell>
                  <TableCell className="text-muted-foreground">{s.user.email}</TableCell>
                  <TableCell>
                    <StatusBadge status={s.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(s.submittedAt)}</TableCell>
                </TableRow>
              ))}
              {submissions.data?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No submissions.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
