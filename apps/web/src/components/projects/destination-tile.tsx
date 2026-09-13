import type { ProjectDestination } from '@hack4justice/shared'
import { cn } from '@hack4justice/ui/lib/utils'
import { DESTINATION_META } from './destination'

/** Square icon tile tinted per agency. */
export function DestinationTile({
  destination,
  size = 'md',
  className,
}: {
  destination: ProjectDestination
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const { icon: Icon, tile } = DESTINATION_META[destination]
  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg',
        size === 'sm' && 'size-8 [&_svg]:size-4',
        size === 'md' && 'size-10 [&_svg]:size-5',
        size === 'lg' && 'size-12 rounded-xl [&_svg]:size-6',
        tile,
        className,
      )}
    >
      <Icon />
    </div>
  )
}
