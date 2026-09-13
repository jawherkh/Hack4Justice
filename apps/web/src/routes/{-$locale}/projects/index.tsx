import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { projectDestinationSchema } from '@hack4justice/shared'
import { Plus } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@hack4justice/ui/components/button'
import { Kbd } from '@hack4justice/ui/components/kbd'
import { CreateProjectDialog } from '#/components/projects/create-project-dialog'
import { DestinationStats } from '#/components/projects/destination-stats'
import { ProjectCard } from '#/components/projects/project-card'
import { ProjectsNoResults, ProjectsWelcome } from '#/components/projects/projects-empty'
import { ProjectsSkeleton } from '#/components/projects/projects-skeleton'
import { ProjectsTable } from '#/components/projects/projects-table'
import { ProjectsToolbar, isTypingTarget } from '#/components/projects/projects-toolbar'
import {
  DEFAULT_VIEW,
  VIEW_MODES,
  readStoredView,
  storeView,
  type ViewMode,
} from '#/components/projects/view-mode'
import { useI18n } from '#/i18n'
import { requireAuth } from '#/lib/guards'
import {
  countByDestination,
  filterProjects,
  listProjects,
  projectKeys,
  type ProjectSummary,
} from '#/lib/projects'

const NO_PROJECTS: ProjectSummary[] = []

// Search, filter and view live in the URL: shareable, survives refresh, back button works.
const searchSchema = z.object({
  q: z.string().optional(),
  destination: projectDestinationSchema.optional(),
  view: z.enum(VIEW_MODES).optional(),
})

export const Route = createFileRoute('/{-$locale}/projects/')({
  validateSearch: searchSchema,
  beforeLoad: requireAuth,
  component: Projects,
})

function Projects() {
  const { t } = useI18n()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const [creating, setCreating] = React.useState(false)

  const query = search.q ?? ''
  const destination = search.destination
  const view: ViewMode = search.view ?? DEFAULT_VIEW

  const setSearch = React.useCallback(
    (patch: Partial<z.infer<typeof searchSchema>>) =>
      navigate({
        search: (previous) => clean({ ...previous, ...patch }),
        replace: true,
        resetScroll: false,
      }),
    [navigate],
  )

  // Restore the last chosen view when the URL does not say otherwise.
  React.useEffect(() => {
    if (search.view) return
    const stored = readStoredView()
    if (stored && stored !== DEFAULT_VIEW) void setSearch({ view: stored })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // "N" opens the create dialog, unless the user is typing somewhere.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'n' || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target) || creating) return
      event.preventDefault()
      setCreating(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [creating])

  const projects = useQuery({ queryKey: projectKeys.all, queryFn: listProjects })
  const all = projects.data ?? NO_PROJECTS
  const visible = React.useMemo(() => filterProjects(all, { query, destination }), [all, query, destination])
  const counts = React.useMemo(() => countByDestination(all), [all])
  const isFiltering = query.trim().length > 0 || destination !== undefined

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">{t('projects.title')}</h1>
          <p className="max-w-xl text-sm text-muted-foreground">{t('projects.subtitle')}</p>
        </div>
        <Button size="lg" onClick={() => setCreating(true)} className="gap-2">
          <Plus data-icon="inline-start" />
          {t('projects.new')}
          <Kbd className="hidden bg-primary-foreground/20 text-primary-foreground md:inline-flex">N</Kbd>
        </Button>
      </header>
      {projects.isSuccess && all.length === 0 ? (
        <ProjectsWelcome onCreate={() => setCreating(true)} />
      ) : (
        <>
          <DestinationStats
            counts={counts}
            total={all.length}
            value={destination}
            onChange={(next) => void setSearch({ destination: next })}
          />

          <ProjectsToolbar
            summary={projects.isSuccess ? <ProjectCount count={visible.length} /> : null}
            query={query}
            onQueryChange={(q) => void setSearch({ q: q || undefined })}
            view={view}
            onViewChange={(next) => {
              storeView(next)
              void setSearch({ view: next === DEFAULT_VIEW ? undefined : next })
            }}
          />

          {projects.isPending ? (
            <ProjectsSkeleton view={view} />
          ) : projects.isError ? (
            <p className="text-sm text-destructive">{t('projects.loadError')}</p>
          ) : visible.length === 0 ? (
            <ProjectsNoResults
              query={query}
              filtered={isFiltering}
              onClear={() => void setSearch({ q: undefined, destination: undefined })}
            />
          ) : view === 'list' ? (
            <ProjectsTable projects={visible} query={query} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((project, index) => (
                <ProjectCard key={project.id} project={project} query={query} index={index} />
              ))}
            </div>
          )}
        </>
      )}
      <CreateProjectDialog open={creating} onOpenChange={setCreating} defaultDestination={destination} />
    </main>
  )
}

function ProjectCount({ count }: { count: number }) {
  const { t } = useI18n()
  if (count === 0) return <>{t('projects.count.zero')}</>
  if (count === 1) return <>{t('projects.count.one')}</>
  return <>{t('projects.count.other', { count })}</>
}

/** Drop empty keys so the URL stays clean (`/projects` instead of `/projects?q=&view=`). */
function clean<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== '')) as T
}
