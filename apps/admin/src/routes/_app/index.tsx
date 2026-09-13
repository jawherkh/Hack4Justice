import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  FolderKanban,
  UserCog,
  Users,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@hack4justice/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hack4justice/ui/components/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@hack4justice/ui/components/chart'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import { StatusBadge } from '#/components/status-badge'
import { adminKeys, getStats, listSubmissions, type StatsView } from '#/lib/admin'
import { formatDate, humanize } from '#/lib/format'

export const Route = createFileRoute('/_app/')({ component: Dashboard })

const activityConfig = {
  signups: { label: 'Sign-ups', color: 'var(--chart-1)' },
  projects: { label: 'Projects', color: 'var(--chart-3)' },
  submissions: { label: 'Submissions', color: 'var(--chart-5)' },
} satisfies ChartConfig

const submissionConfig = {
  SUBMITTED: { label: 'Submitted', color: 'var(--chart-4)' },
  UNDER_REVIEW: { label: 'Under review', color: 'var(--chart-3)' },
  ACCEPTED: { label: 'Accepted', color: 'var(--chart-1)' },
  REJECTED: { label: 'Rejected', color: 'var(--destructive)' },
} satisfies ChartConfig

const destinationConfig = {
  RNE: { label: 'RNE', color: 'var(--chart-1)' },
  DGI: { label: 'DGI', color: 'var(--chart-3)' },
} satisfies ChartConfig

const uploadConfig = {
  EXTRACTED: { label: 'Extracted', color: 'var(--chart-1)' },
  PROCESSING: { label: 'Processing', color: 'var(--chart-4)' },
  UPLOADED: { label: 'Uploaded', color: 'var(--chart-5)' },
  FAILED: { label: 'Failed', color: 'var(--destructive)' },
} satisfies ChartConfig

const procedureConfig = {
  NOT_STARTED: { label: 'Not started', color: 'var(--chart-5)' },
  IN_PROGRESS: { label: 'In progress', color: 'var(--chart-4)' },
  READY_FOR_SUBMISSION: { label: 'Ready', color: 'var(--chart-3)' },
  SUBMITTED: { label: 'Submitted', color: 'var(--chart-2)' },
  UNDER_REVIEW: { label: 'Under review', color: 'var(--chart-2)' },
  ACCEPTED: { label: 'Accepted', color: 'var(--chart-1)' },
  REJECTED: { label: 'Rejected', color: 'var(--destructive)' },
  BLOCKED: { label: 'Blocked', color: 'var(--destructive)' },
  COMPLETED: { label: 'Completed', color: 'var(--chart-1)' },
  value: { label: 'Projects', color: 'var(--chart-1)' },
} satisfies ChartConfig

function Dashboard() {
  const stats = useQuery({ queryKey: adminKeys.stats, queryFn: getStats, refetchInterval: 30_000 })
  const pending = useQuery({
    queryKey: adminKeys.submissions('SUBMITTED', ''),
    queryFn: () => listSubmissions('SUBMITTED', ''),
    refetchInterval: 30_000,
  })
  const s = stats.data

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">What needs attention across RNE and DGI procedures.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Users" value={s?.users} icon={Users} to="/users" />
        <Tile label="Projects" value={s?.projects} icon={FolderKanban} to="/users" />
        <Tile
          label="Pending review"
          value={s?.pendingReview}
          icon={FileCheck2}
          to="/submissions"
          highlight={(s?.pendingReview ?? 0) > 0}
        />
        <Tile label="Documents" value={s?.uploads} icon={FileText} to="/users" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile
          label="Acceptance rate"
          value={
            s
              ? s.review.acceptanceRate === null
                ? '—'
                : `${Math.round(s.review.acceptanceRate * 100)}%`
              : undefined
          }
          icon={CheckCircle2}
          hint={s ? `${s.review.reviewedCount} reviewed` : undefined}
        />
        <Tile
          label="Median time to review"
          value={s ? (s.review.medianHours === null ? '—' : formatHours(s.review.medianHours)) : undefined}
          icon={Clock}
          hint="from submission to decision"
        />
        <Tile label="Staff accounts" value={s?.staff} icon={UserCog} to="/staff" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity, last 30 days</CardTitle>
          <CardDescription>New sign-ups, projects created and submissions recorded per day.</CardDescription>
        </CardHeader>
        <CardContent>
          {s ? (
            <ChartContainer config={activityConfig} className="h-64 w-full">
              <AreaChart data={s.days} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Area
                  isAnimationActive={false}
                  dataKey="signups"
                  type="monotone"
                  stroke="var(--color-signups)"
                  fill="var(--color-signups)"
                  fillOpacity={0.15}
                />
                <Area
                  isAnimationActive={false}
                  dataKey="projects"
                  type="monotone"
                  stroke="var(--color-projects)"
                  fill="var(--color-projects)"
                  fillOpacity={0.15}
                />
                <Area
                  isAnimationActive={false}
                  dataKey="submissions"
                  type="monotone"
                  stroke="var(--color-submissions)"
                  fill="var(--color-submissions)"
                  fillOpacity={0.15}
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Projects by agency</CardTitle>
            <CardDescription>RNE versus DGI.</CardDescription>
          </CardHeader>
          <CardContent>
            {s ? (
              <Donut
                config={destinationConfig}
                data={s.projectsByDestination.map((r) => ({ key: r.destination, value: r.value }))}
              />
            ) : (
              <Skeleton className="h-56 w-full" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Where projects stand</CardTitle>
            <CardDescription>Procedure status across all projects.</CardDescription>
          </CardHeader>
          <CardContent>
            {s ? (
              <ChartContainer config={procedureConfig} className="h-56 w-full">
                <BarChart
                  layout="vertical"
                  data={Object.entries(s.procedureStatus).map(([key, value]) => ({
                    key,
                    label: procedureConfig[key as keyof typeof procedureConfig]?.label ?? humanize(key),
                    value,
                  }))}
                  margin={{ left: 8, right: 24 }}
                >
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} width={92} />
                  <ChartTooltip content={<ChartTooltipContent nameKey="label" />} />
                  <Bar isAnimationActive={false} dataKey="value" radius={4}>
                    {Object.keys(s.procedureStatus).map((key) => (
                      <Cell key={key} fill={`var(--color-${key})`} />
                    ))}
                    <LabelList dataKey="value" position="right" className="fill-foreground text-xs" />
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : (
              <Skeleton className="h-56 w-full" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
            <CardDescription>Text extraction outcome of uploaded PDFs.</CardDescription>
          </CardHeader>
          <CardContent>
            {s ? (
              <Donut
                config={uploadConfig}
                data={s.uploadsByStatus.map((r) => ({ key: r.status, value: r.value }))}
              />
            ) : (
              <Skeleton className="h-56 w-full" />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Submissions by agency and status</CardTitle>
            <CardDescription>Every submission recorded, stacked by outcome.</CardDescription>
          </CardHeader>
          <CardContent>
            {s ? (
              <ChartContainer config={submissionConfig} className="h-56 w-full">
                <BarChart data={pivotSubmissions(s)} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="destination" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  {(Object.keys(submissionConfig) as (keyof typeof submissionConfig)[]).map((key) => (
                    <Bar
                      isAnimationActive={false}
                      key={key}
                      dataKey={key}
                      stackId="a"
                      fill={`var(--color-${key})`}
                      radius={key === 'REJECTED' ? [4, 4, 0, 0] : 0}
                    />
                  ))}
                </BarChart>
              </ChartContainer>
            ) : (
              <Skeleton className="h-56 w-full" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Most used services</CardTitle>
            <CardDescription>Projects that picked a service, by service.</CardDescription>
          </CardHeader>
          <CardContent>
            {s ? (
              s.projectsByService.length === 0 ? (
                <p className="text-sm text-muted-foreground">No project has chosen a service yet.</p>
              ) : (
                <ChartContainer
                  config={{ value: { label: 'Projects', color: 'var(--chart-2)' } }}
                  className="h-56 w-full"
                >
                  <BarChart
                    layout="vertical"
                    data={s.projectsByService
                      .slice(0, 8)
                      .map((r) => ({ label: humanize(r.serviceId), value: r.value }))}
                    margin={{ left: 8, right: 24 }}
                  >
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} width={150} />
                    <ChartTooltip content={<ChartTooltipContent nameKey="label" />} />
                    <Bar isAnimationActive={false} dataKey="value" fill="var(--color-value)" radius={4}>
                      <LabelList dataKey="value" position="right" className="fill-foreground text-xs" />
                    </Bar>
                  </BarChart>
                </ChartContainer>
              )
            ) : (
              <Skeleton className="h-56 w-full" />
            )}
          </CardContent>
        </Card>
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

function Tile({
  label,
  value,
  icon: Icon,
  to,
  hint,
  highlight,
}: {
  label: string
  value: number | string | undefined
  icon: typeof Users
  to?: '/users' | '/submissions' | '/staff'
  hint?: string
  highlight?: boolean
}) {
  const body = (
    <>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        {label}
        <Icon className="size-4" />
      </div>
      {value === undefined ? (
        <Skeleton className="mt-2 h-8 w-16" />
      ) : (
        <p className={`mt-1 text-3xl font-semibold tabular-nums ${highlight ? 'text-primary' : ''}`}>
          {value}
        </p>
      )}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </>
  )
  const className = 'rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20'
  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

function Donut({ config, data }: { config: ChartConfig; data: { key: string; value: number }[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  if (total === 0) return <p className="text-sm text-muted-foreground">No data yet.</p>
  return (
    <ChartContainer config={config} className="mx-auto h-56 w-full">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
        <Pie
          isAnimationActive={false}
          data={data}
          dataKey="value"
          nameKey="key"
          innerRadius={55}
          outerRadius={85}
          strokeWidth={2}
          paddingAngle={2}
        >
          {data.map((d) => (
            <Cell key={d.key} fill={`var(--color-${d.key})`} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="key" />} />
      </PieChart>
    </ChartContainer>
  )
}

function pivotSubmissions(s: StatsView) {
  const rows: Record<string, Record<string, number | string>> = {}
  for (const r of s.submissionsByDestination) {
    rows[r.destination] ??= {
      destination: r.destination,
      SUBMITTED: 0,
      UNDER_REVIEW: 0,
      ACCEPTED: 0,
      REJECTED: 0,
    }
    rows[r.destination]![r.status] = r.value
  }
  for (const d of ['RNE', 'DGI'])
    rows[d] ??= { destination: d, SUBMITTED: 0, UNDER_REVIEW: 0, ACCEPTED: 0, REJECTED: 0 }
  return Object.values(rows)
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 48) return `${hours.toFixed(1)} h`
  return `${(hours / 24).toFixed(1)} d`
}
