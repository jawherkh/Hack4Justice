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
import { DestinationBadge } from './destination-badge'
import { DestinationTile } from './destination-tile'
import { Highlight } from './highlight'
import { ProjectActions } from './project-actions'

export function ProjectsTable({ projects, query = '' }: { projects: ProjectSummary[]; query?: string }) {
  const { t, locale } = useI18n()
  const params = (id: string) => ({ locale: toLocaleParam(locale), id })

  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="ps-4">{t('projects.table.name')}</TableHead>
            <TableHead>{t('projects.table.destination')}</TableHead>
            <TableHead className="hidden md:table-cell">{t('projects.table.created')}</TableHead>
            <TableHead className="hidden sm:table-cell">{t('projects.table.updated')}</TableHead>
            <TableHead className="w-12 pe-3 text-end">
              <span className="sr-only">{t('projects.table.actions')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project, index) => (
            <TableRow
              key={project.id}
              data-testid="project-row"
              style={{ animationDelay: `${Math.min(index, 10) * 25}ms` }}
              className="group/row relative motion-safe:animate-in motion-safe:fade-in-0 motion-safe:fill-mode-backwards"
            >
              <TableCell className="ps-4">
                <div className="flex items-center gap-3">
                  <DestinationTile destination={project.destination} size="sm" />
                  <div className="flex min-w-0 flex-col">
                    <Link
                      to="/{-$locale}/projects/$id"
                      params={params(project.id)}
                      className="truncate font-medium outline-none group-hover/row:underline group-hover/row:underline-offset-4 after:absolute after:inset-0 after:content-['']"
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
                <time dateTime={String(project.updatedAt)}>{formatRelative(project.updatedAt, locale)}</time>
              </TableCell>
              <TableCell className="pe-3 text-end">
                <ProjectActions project={project} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
