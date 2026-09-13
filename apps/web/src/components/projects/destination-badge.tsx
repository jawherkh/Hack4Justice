import type { ProjectDestination } from '@hack4justice/shared'
import { Badge } from '@hack4justice/ui/components/badge'
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
  return (
    <Badge variant="secondary" className={className}>
      {t(DESTINATION_META[destination].label)}
    </Badge>
  )
}
