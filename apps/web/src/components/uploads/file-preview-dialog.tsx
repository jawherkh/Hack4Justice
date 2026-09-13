import { useQuery } from '@tanstack/react-query'
import { Download, ExternalLink } from 'lucide-react'
import { Button } from '@hack4justice/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@hack4justice/ui/components/dialog'
import { Spinner } from '@hack4justice/ui/components/spinner'
import { useI18n } from '#/i18n'
import { ApiError } from '#/lib/api-error'
import { formatBytes } from '#/lib/format'
import { downloadUpload, getUpload } from '#/lib/uploads'
import { UploadStatusBadge } from './upload-status-badge'

interface FilePreviewDialogProps {
  /** Upload to show; null closes the dialog. */
  uploadId: string | null
  onOpenChange: (open: boolean) => void
}

/** Inline PDF viewer on top of the presigned download URL (the browser's own PDF renderer). */
export function FilePreviewDialog({ uploadId, onOpenChange }: FilePreviewDialogProps) {
  const { t, locale } = useI18n()
  const upload = useQuery({
    queryKey: ['uploads', uploadId, 'preview'],
    queryFn: () => getUpload(uploadId!),
    enabled: uploadId !== null,
    // Presigned URLs expire; do not keep serving a stale one.
    staleTime: 5 * 60 * 1000,
  })

  return (
    <Dialog open={uploadId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] flex-col gap-3 p-3 sm:max-w-5xl">
        <DialogHeader className="pe-8">
          <DialogTitle className="flex flex-wrap items-center gap-2 break-all">
            {upload.data?.filename ?? t('uploads.preview')}
            {upload.data ? <UploadStatusBadge status={upload.data.status} /> : null}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-3">
            {upload.data ? (
              <>
                <span>{formatBytes(upload.data.size, locale)}</span>
                {upload.data.pageCount ? (
                  <span>{t('uploads.detail.pages', { count: upload.data.pageCount })}</span>
                ) : null}
                <span className="flex items-center gap-1">
                  <Button variant="ghost" size="xs" onClick={() => void downloadUpload(upload.data.id)}>
                    <Download data-icon="inline-start" />
                    {t('uploads.detail.download')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    render={<a href={upload.data.downloadUrl} target="_blank" rel="noopener noreferrer" />}
                  >
                    <ExternalLink data-icon="inline-start" />
                    {t('uploads.preview.openTab')}
                  </Button>
                </span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted">
          {upload.isPending ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : upload.isError ? (
            <p className="p-4 text-sm text-destructive">
              {upload.error instanceof ApiError ? upload.error.message : t('uploads.preview.loadError')}
            </p>
          ) : (
            <iframe
              key={upload.data.downloadUrl}
              src={upload.data.downloadUrl}
              title={upload.data.filename}
              className="size-full"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
