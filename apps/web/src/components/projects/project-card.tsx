import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@hack4justice/ui/lib/utils'
import { toLocaleParam, useI18n } from '#/i18n'
import { formatRelative } from '#/lib/format'
import type { ProjectSummary } from '#/lib/projects'
import { DESTINATION_META } from './destination'
import { DestinationBadge } from './destination-badge'
import { DestinationTile } from './destination-tile'
import { Highlight } from './highlight'
import { ProjectActions } from './project-actions'

interface ProjectCardProps {
  project: ProjectSummary
  query?: string
  /** Stagger index for the entrance animation. */
  index?: number
}

/**
 * Whole card is clickable through a stretched link on the title, so the
 * actions menu stays a real button rather than a button nested in an anchor.
 */
export function ProjectCard({ project, query = '', index = 0 }: ProjectCardProps) {
  const { t, locale } = useI18n()
  const meta = DESTINATION_META[project.destination]

  return (
    <article
      data-testid="project-card"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      className={cn(
        'group/card relative flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-all duration-200 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:fill-mode-backwards motion-safe:slide-in-from-bottom-2',
        'focus-within:ring-2 focus-within:ring-ring hover:-translate-y-0.5 hover:shadow-lg hover:shadow-foreground/5',
        meta.ring,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <DestinationTile destination={project.destination} />
        <ProjectActions
          project={project}
          className="opacity-60 group-hover/card:opacity-100 focus-visible:opacity-100"
        />
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="line-clamp-1 leading-snug font-medium">
          <Link
            to="/{-$locale}/projects/$id"
            params={{ locale: toLocaleParam(locale), id: project.id }}
            className="outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
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

      <div className="mt-auto flex items-center justify-between gap-2">
        <DestinationBadge destination={project.destination} />
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <time dateTime={String(project.updatedAt)}>{formatRelative(project.updatedAt, locale)}</time>
          <ArrowUpRight
            aria-hidden
            className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover/card:translate-x-0 group-hover/card:opacity-100 rtl:rotate-[270deg]"
          />
        </span>
      </div>
    </article>
  )
}
