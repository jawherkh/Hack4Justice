import type { ProcedureStatus, SubmissionStatus } from '@hack4justice/shared'
import { Badge } from '@hack4justice/ui/components/badge'
import { humanize } from '#/lib/format'

type Variant = 'default' | 'secondary' | 'outline' | 'destructive'
const VARIANT: Record<string, Variant> = {
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

export function StatusBadge({ status }: { status: ProcedureStatus | SubmissionStatus | string }) {
  return <Badge variant={VARIANT[status] ?? 'outline'}>{humanize(status)}</Badge>
}
