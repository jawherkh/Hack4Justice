import type { ProjectDestination } from '@hack4justice/shared'
import { Badge } from '@hack4justice/ui/components/badge'
import { cn } from '@hack4justice/ui/lib/utils'
import { useTranslation } from '#/i18n'
import { DESTINATION_META } from './destination'

export function DestinationBadge({
  destination,
  className,
}: {
  destination: ProjectDestination
  className?: string
}) {
  const t = useTranslation()
  const meta = DESTINATION_META[destination]
  return (
    <Badge variant="outline" className={cn('gap-1.5 font-semibold tracking-wide', meta.badge, className)}>
      <span aria-hidden className={cn('size-1.5 rounded-full', meta.dot)} />
      {t(meta.label)}
    </Badge>
  )
}
