import { PROJECT_DESTINATIONS, type ProjectDestination } from '@hack4justice/shared'
import { FolderKanban } from 'lucide-react'
import { cn } from '@hack4justice/ui/lib/utils'
import { useTranslation } from '#/i18n'
import { DESTINATION_META } from './destination'

interface DestinationStatsProps {
  counts: Record<string, number>
  total: number
  value: ProjectDestination | undefined
  onChange: (destination: ProjectDestination | undefined) => void
}

/**
 * Agency overview that doubles as the destination filter: one card per
 * destination with its official logo and project count, plus "all".
 */
export function DestinationStats({ counts, total, value, onChange }: DestinationStatsProps) {
  const t = useTranslation()
  return (
    <div role="radiogroup" aria-label={t('projects.filter.label')} className="grid gap-3 sm:grid-cols-3">
      <StatCard
        selected={value === undefined}
        onSelect={() => onChange(undefined)}
        title={t('projects.stats.all')}
        subtitle={t('projects.stats.hint')}
        count={total}
        media={
          <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderKanban className="size-5" />
          </span>
        }
      />
      {PROJECT_DESTINATIONS.map((destination) => {
        const meta = DESTINATION_META[destination]
        return (
          <StatCard
            key={destination}
            selected={value === destination}
            onSelect={() => onChange(value === destination ? undefined : destination)}
            title={t(meta.label)}
            subtitle={t(meta.full)}
            count={counts[destination] ?? 0}
            media={
              <span className="flex h-11 w-16 items-center justify-center">
                <img
                  src={meta.logo}
                  alt=""
                  draggable={false}
                  className="max-h-11 w-auto max-w-16 object-contain"
                />
              </span>
            }
          />
        )
      })}
    </div>
  )
}

function StatCard({
  selected,
  onSelect,
  title,
  subtitle,
  count,
  media,
}: {
  selected: boolean
  onSelect: () => void
  title: string
  subtitle: string
  count: number
  media: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'group/stat relative flex items-center gap-4 rounded-xl border bg-card px-4 py-3.5 text-start transition-all outline-none',
        'hover:border-foreground/20 hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50',
        selected ? 'border-primary shadow-sm ring-1 ring-primary' : 'border-border',
      )}
    >
      {media}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
      <span
        className={cn(
          'text-2xl font-semibold tracking-tight tabular-nums',
          selected ? 'text-primary' : 'text-foreground',
        )}
      >
        {count}
      </span>
    </button>
  )
}
