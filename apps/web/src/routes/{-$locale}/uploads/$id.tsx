import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Copy, Download, RefreshCw, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@hack4justice/ui/components/alert-dialog'
import { Button } from '@hack4justice/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@hack4justice/ui/components/card'
import { ScrollArea } from '@hack4justice/ui/components/scroll-area'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import { toast } from '@hack4justice/ui/components/toast'
import { UploadStatusBadge } from '#/components/uploads/upload-status-badge'
import { toLocaleParam, useI18n } from '#/i18n'
import { ApiError } from '#/lib/api-error'
import { formatBytes, formatDate } from '#/lib/format'
import { requireAuth } from '#/lib/guards'
import { deleteUpload, getUpload, pollingInterval, retryExtraction } from '#/lib/uploads'

export const Route = createFileRoute('/{-$locale}/uploads/$id')({
  beforeLoad: requireAuth,
  component: UploadDetail,
})

function UploadDetail() {
  const { id } = Route.useParams()
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = { locale: toLocaleParam(locale) }
  const upload = useQuery({
    queryKey: ['uploads', id],
    queryFn: () => getUpload(id),
    refetchInterval: (query) => pollingInterval(query.state.data ? [query.state.data.status] : []),
  })

  const retry = useMutation({
    mutationFn: () => retryExtraction({ id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['uploads'] }),
    onError: (err) =>
      toast.add({
        type: 'error',
        title: t('uploads.toast.error'),
        description: err instanceof ApiError ? err.message : t('auth.error.generic'),
      }),
  })

  const remove = useMutation({
    mutationFn: () => deleteUpload(id),
    onSuccess: async () => {
      toast.add({ type: 'success', title: t('uploads.toast.deleted') })
      await queryClient.invalidateQueries({ queryKey: ['uploads'] })
      await navigate({ to: '/{-$locale}/uploads', params })
    },
    onError: (err) =>
      toast.add({
        type: 'error',
        title: t('uploads.toast.error'),
        description: err instanceof ApiError ? err.message : t('auth.error.generic'),
      }),
  })

  const copyText = React.useCallback(async () => {
    if (!upload.data?.text) return
    await navigator.clipboard.writeText(upload.data.text)
    toast.add({ type: 'success', title: t('uploads.detail.copied') })
  }, [upload.data?.text, t])

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-8">
      <Link to="/{-$locale}/uploads" params={params} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t('uploads.detail.back')}
      </Link>

      {upload.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : upload.isError ? (
        <p className="text-sm text-destructive">
          {upload.error instanceof ApiError ? upload.error.message : t('uploads.loadError')}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold tracking-tight break-all">{upload.data.filename}</h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <UploadStatusBadge status={upload.data.status} />
                <span>{formatBytes(upload.data.size, locale)}</span>
                {upload.data.pageCount ? <span>{t('uploads.detail.pages', { count: upload.data.pageCount })}</span> : null}
                <span>{formatDate(upload.data.createdAt, locale)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {upload.data.status === 'FAILED' ? (
                <Button variant="secondary" disabled={retry.isPending} onClick={() => retry.mutate()}>
                  <RefreshCw data-icon="inline-start" />
                  {t('uploads.detail.retry')}
                </Button>
              ) : null}
              <Button variant="outline" render={<a href={upload.data.downloadUrl} download={upload.data.filename} />}>
                <Download data-icon="inline-start" />
                {t('uploads.detail.download')}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="destructive" />}>
                  <Trash2 data-icon="inline-start" />
                  {t('uploads.detail.delete')}
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('uploads.detail.confirmTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('uploads.detail.confirmDescription')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('uploads.detail.cancel')}</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
                      {t('uploads.detail.delete')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{t('uploads.detail.text')}</CardTitle>
              {upload.data.text ? (
                <Button variant="ghost" size="sm" onClick={copyText}>
                  <Copy data-icon="inline-start" />
                  {t('uploads.detail.copy')}
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {upload.data.text ? (
                <ScrollArea className="h-[28rem] rounded-lg border">
                  <pre className="p-4 font-sans text-sm whitespace-pre-wrap">{upload.data.text}</pre>
                </ScrollArea>
              ) : upload.data.status === 'PROCESSING' ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{upload.data.error ?? t('uploads.detail.noText')}</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  )
}
