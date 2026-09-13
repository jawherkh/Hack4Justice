import { Link } from '@tanstack/react-router'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@hack4justice/ui/components/table'
import { toLocaleParam, useI18n } from '#/i18n'
import { formatDate, formatRelative } from '#/lib/format'
import type { ProjectSummary } from '#/lib/projects'
import { DESTINATION_META } from './destination'
import { DestinationBadge } from './destination-badge'
import { Highlight } from './highlight'
import { ProjectActions } from './project-actions'

export function ProjectsTable({ projects, query = '' }: { projects: ProjectSummary[]; query?: string }) {
  const { t, locale } = useI18n()
  const params = (id: string) => ({ locale: toLocaleParam(locale), id })

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="h-10 ps-5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t('projects.table.name')}
            </TableHead>
            <TableHead className="h-10 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t('projects.table.destination')}
            </TableHead>
            <TableHead className="hidden h-10 text-xs font-semibold tracking-wide text-muted-foreground uppercase md:table-cell">
              {t('projects.table.created')}
            </TableHead>
            <TableHead className="hidden h-10 text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:table-cell">
              {t('projects.table.updated')}
            </TableHead>
            <TableHead className="h-10 w-12 pe-3 text-end">
              <span className="sr-only">{t('projects.table.actions')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => {
            const meta = DESTINATION_META[project.destination]
            return (
              <TableRow key={project.id} data-testid="project-row" className="group/row relative">
                <TableCell className="ps-5">
                  <div className="flex items-center gap-4 py-1">
                    <span className="flex h-9 w-14 shrink-0 items-center justify-center">
                      <img
                        src={meta.logo}
                        alt=""
                        draggable={false}
                        className="max-h-9 w-auto max-w-14 object-contain"
                      />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <Link
                        to="/{-$locale}/projects/$id"
                        params={params(project.id)}
                        className="truncate font-semibold outline-none group-hover/row:text-primary after:absolute after:inset-0 after:content-['']"
                      >
                        <Highlight text={project.name} query={query} />
                      </Link>
                      {project.description ? (
                        <span className="line-clamp-1 max-w-md text-xs text-muted-foreground">
                          <Highlight text={project.description} query={query} />
                        </span>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <DestinationBadge destination={project.destination} />
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {formatDate(project.createdAt, locale)}
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  <time dateTime={String(project.updatedAt)}>
                    {formatRelative(project.updatedAt, locale)}
                  </time>
                </TableCell>
                <TableCell className="pe-3 text-end">
                  <ProjectActions project={project} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
