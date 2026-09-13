import { UploadStatus } from '@hack4justice/shared'
import { Badge } from '@hack4justice/ui/components/badge'
import { Spinner } from '@hack4justice/ui/components/spinner'
import { useTranslation } from '#/i18n'

const VARIANT: Record<UploadStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  [UploadStatus.UPLOADED]: 'outline',
  [UploadStatus.PROCESSING]: 'secondary',
  [UploadStatus.EXTRACTED]: 'default',
  [UploadStatus.FAILED]: 'destructive',
}

export function UploadStatusBadge({ status }: { status: UploadStatus }) {
  const t = useTranslation()
  return (
    <Badge variant={VARIANT[status]}>
      {status === UploadStatus.PROCESSING ? <Spinner data-icon="inline-start" /> : null}
      {t(`uploads.status.${status}`)}
    </Badge>
  )
}
