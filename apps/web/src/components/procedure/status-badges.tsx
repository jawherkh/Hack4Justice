import type { ProcedureStatus, RequirementStatus } from '@hack4justice/shared'
import { Badge } from '@hack4justice/ui/components/badge'
import { useTranslation } from '#/i18n'
import { procedureStatusLabel, requirementStatusLabel } from './labels'

type Variant = 'default' | 'secondary' | 'outline' | 'destructive'

const PROCEDURE_VARIANT: Record<ProcedureStatus, Variant> = {
  NOT_STARTED: 'outline',
  IN_PROGRESS: 'secondary',
  READY_FOR_SUBMISSION: 'default',
  SUBMITTED: 'secondary',
  UNDER_REVIEW: 'secondary',
  ACCEPTED: 'default',
  REJECTED: 'destructive',
  BLOCKED: 'destructive',
  COMPLETED: 'default',
}

const REQUIREMENT_VARIANT: Record<RequirementStatus, Variant> = {
  MISSING: 'outline',
  PROVIDED: 'secondary',
  VALID: 'default',
  INVALID: 'destructive',
  WAIVED: 'outline',
  NOT_APPLICABLE: 'outline',
}

export function ProcedureStatusBadge({ status, className }: { status: ProcedureStatus; className?: string }) {
  const t = useTranslation()
  return (
    <Badge variant={PROCEDURE_VARIANT[status]} className={className}>
      {t(procedureStatusLabel(status))}
    </Badge>
  )
}

export function RequirementStatusBadge({
  status,
  className,
}: {
  status: RequirementStatus
  className?: string
}) {
  const t = useTranslation()
  return (
    <Badge variant={REQUIREMENT_VARIANT[status]} className={className}>
      {t(requirementStatusLabel(status))}
    </Badge>
  )
}
