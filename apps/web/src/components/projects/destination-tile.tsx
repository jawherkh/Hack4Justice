import type { ProjectDestination } from '@hack4justice/shared'
import { cn } from '@hack4justice/ui/lib/utils'
import { useTranslation } from '#/i18n'
import { DESTINATION_META } from './destination'

/** Square white tile showing the agency's official logo. */
export function DestinationTile({
  destination,
  size = 'md',
  className,
}: {
  destination: ProjectDestination
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const t = useTranslation()
  const meta = DESTINATION_META[destination]
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-foreground/10',
        size === 'sm' && 'size-8 p-1',
        size === 'md' && 'size-10 p-1.5',
        size === 'lg' && 'size-14 rounded-xl p-2',
        className,
      )}
    >
      <img src={meta.logo} alt={t(meta.full)} className="size-full object-contain" draggable={false} />
    </div>
  )
}
