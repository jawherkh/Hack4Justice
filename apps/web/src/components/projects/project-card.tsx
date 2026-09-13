import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Clock } from 'lucide-react'
import { cn } from '@hack4justice/ui/lib/utils'
import { toLocaleParam, useI18n } from '#/i18n'
import { formatRelative } from '#/lib/format'
import type { ProjectSummary } from '#/lib/projects'
import { DESTINATION_META } from './destination'
import { DestinationBadge } from './destination-badge'
import { Highlight } from './highlight'
import { ProjectActions } from './project-actions'

interface ProjectCardProps {
  project: ProjectSummary
  query?: string
}

/**
 * Whole card is clickable through a stretched link on the title, so the
 * actions menu stays a real button rather than a button nested in an anchor.
 */
export function ProjectCard({ project, query = '' }: ProjectCardProps) {
  const { t, locale } = useI18n()
  const meta = DESTINATION_META[project.destination]

  return (
    <article
      data-testid="project-card"
      className={cn(
        'group/card relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs',
        'focus-within:ring-2 focus-within:ring-ring hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md',
      )}
    >
      {/* Agency band: the destination is the first thing you read. */}
      <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-5 py-4">
        <img
          src={meta.logo}
          alt={t(meta.full)}
          draggable={false}
          className="h-9 w-auto max-w-24 object-contain"
        />
        <div className="flex items-center gap-1">
          <DestinationBadge destination={project.destination} />
          <ProjectActions
            project={project}
            className="opacity-60 group-hover/card:opacity-100 focus-visible:opacity-100"
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 px-5 pt-4 pb-3">
        <h3 className="line-clamp-1 text-base leading-snug font-semibold">
          <Link
            to="/{-$locale}/projects/$id"
            params={{ locale: toLocaleParam(locale), id: project.id }}
            className="outline-none after:absolute after:inset-0 after:content-['']"
          >
            <Highlight text={project.name} query={query} />
          </Link>
        </h3>
        <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
          {project.description ? (
            <Highlight text={project.description} query={query} />
          ) : (
            <span className="italic opacity-70">{t('projects.detail.noDescription')}</span>
          )}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 px-5 pb-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Clock aria-hidden className="size-3.5" />
          <time dateTime={String(project.updatedAt)}>{formatRelative(project.updatedAt, locale)}</time>
        </span>
        <span className="flex items-center gap-1 font-medium text-foreground/0 transition-colors group-hover/card:text-primary">
          {t('projects.actions.open')}
          <ArrowUpRight aria-hidden className="size-3.5 rtl:rotate-[270deg]" />
        </span>
      </div>
    </article>
  )
}
