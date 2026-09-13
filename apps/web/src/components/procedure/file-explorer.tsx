import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { REQUIREMENTS } from '@hack4justice/shared'
import {
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  Link2,
  Link2Off,
  MoreHorizontal,
  Upload,
} from 'lucide-react'
import { Badge } from '@hack4justice/ui/components/badge'
import { Button } from '@hack4justice/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@hack4justice/ui/components/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@hack4justice/ui/components/dropdown-menu'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@hack4justice/ui/components/empty'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import { toast } from '@hack4justice/ui/components/toast'
import { cn } from '@hack4justice/ui/lib/utils'
import { UploadDropzone } from '#/components/uploads/upload-dropzone'
import { useFileDrop } from '#/components/uploads/use-file-drop'
import { UploadStatusBadge } from '#/components/uploads/upload-status-badge'
import { toLocaleParam, useI18n } from '#/i18n'
import { ApiError } from '#/lib/api-error'
import { formatBytes, formatRelative } from '#/lib/format'
import { listProjectUploads, projectKeys, updateRequirement, type ProjectDetail } from '#/lib/projects'
import { pollingInterval, uploadPdf } from '#/lib/uploads'
import { requirementLabel } from './labels'

const ALL = '__all__'
const UNLINKED = '__unlinked__'

/** Two-pane explorer: virtual folders per document requirement on the start side, files on the end side. */
export function FileExplorer({ project }: { project: ProjectDetail }) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const [folder, setFolder] = React.useState<string>(ALL)
  const [uploading, setUploading] = React.useState(false)

  const uploads = useQuery({
    queryKey: projectKeys.uploads(project.id),
    queryFn: () => listProjectUploads(project.id),
    refetchInterval: (query) => pollingInterval((query.state.data ?? []).map((u) => u.status)),
  })

  const link = useMutation({
    mutationFn: (input: { requirementId: string; uploadId: string | null }) =>
      updateRequirement(project.id, input.requirementId, { uploadId: input.uploadId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectKeys.detail(project.id) })
      void queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
    onError: (err) =>
      toast.add({
        type: 'error',
        title: t('procedure.requirement.error'),
        description: err instanceof ApiError ? err.message : t('auth.error.generic'),
      }),
  })

  const dropUpload = useMutation({
    mutationFn: (file: File) => uploadPdf({ file, languages: 'fra+eng', projectId: project.id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.uploads(project.id) })
      toast.add({ type: 'success', title: t('procedure.explorer.uploaded') })
    },
    onError: (err) =>
      toast.add({
        type: 'error',
        title: t('uploads.toast.error'),
        description: err instanceof ApiError ? err.message : t('auth.error.generic'),
      }),
  })
  const drop = useFileDrop({
    onFile: (file) => dropUpload.mutate(file),
    onError: (error) =>
      toast.add({
        type: 'error',
        title: t(error === 'notPdf' ? 'uploads.drop.notPdf' : 'uploads.drop.tooLarge'),
      }),
    disabled: dropUpload.isPending,
  })

  const documentRequirements = project.requirements.filter(
    (r) => REQUIREMENTS[r.requirementId]?.type === 'document',
  )
  const requirementByUpload = new Map(
    project.requirements.flatMap((r) => (r.uploadId ? [[r.uploadId, r.requirementId] as const] : [])),
  )
  const files = uploads.data ?? []
  const visible =
    folder === ALL
      ? files
      : folder === UNLINKED
        ? files.filter((f) => !requirementByUpload.has(f.id))
        : files.filter((f) => requirementByUpload.get(f.id) === folder)
  const countFor = (id: string) =>
    id === ALL
      ? files.length
      : id === UNLINKED
        ? files.filter((f) => !requirementByUpload.has(f.id)).length
        : files.filter((f) => requirementByUpload.get(f.id) === id).length

  return (
    <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
      <nav aria-label={t('procedure.explorer.folders')} className="flex flex-col gap-1">
        <p className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t('procedure.explorer.folders')}
        </p>
        <FolderButton
          active={folder === ALL}
          label={t('procedure.explorer.all')}
          count={countFor(ALL)}
          onClick={() => setFolder(ALL)}
        />
        {documentRequirements.map((r) => (
          <FolderButton
            key={r.requirementId}
            active={folder === r.requirementId}
            label={t(requirementLabel(r.requirementId))}
            count={countFor(r.requirementId)}
            onClick={() => setFolder(r.requirementId)}
          />
        ))}
        <FolderButton
          active={folder === UNLINKED}
          label={t('procedure.explorer.unlinked')}
          count={countFor(UNLINKED)}
          onClick={() => setFolder(UNLINKED)}
        />
      </nav>

      <section
        {...drop.handlers}
        className={cn(
          'relative flex min-w-0 flex-col gap-3 rounded-xl transition-colors',
          drop.dragging && 'ring-2 ring-primary ring-offset-4 ring-offset-background',
        )}
      >
        {drop.dragging ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/80 text-sm font-medium text-primary backdrop-blur-sm">
            <Upload className="me-2 size-4" />
            {t('procedure.explorer.dropHere')}
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {t('procedure.explorer.files', { count: visible.length })}
          </p>
          <Button onClick={() => setUploading(true)}>
            <Upload data-icon="inline-start" />
            {t('procedure.explorer.upload')}
          </Button>
        </div>

        {uploads.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : visible.length === 0 ? (
          <Empty className="rounded-xl border border-dashed py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderOpen />
              </EmptyMedia>
              <EmptyTitle>{t('procedure.explorer.empty.title')}</EmptyTitle>
              <EmptyDescription>{t('procedure.explorer.empty.description')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {visible.map((file) => {
              const linkedTo = requirementByUpload.get(file.id)
              return (
                <li key={file.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <FileText className="size-4" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Link
                      to="/{-$locale}/uploads/$id"
                      params={{ locale: toLocaleParam(locale), id: file.id }}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {file.filename}
                    </Link>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span>{formatBytes(file.size, locale)}</span>
                      <span>·</span>
                      <span>{formatRelative(file.createdAt, locale)}</span>
                      {linkedTo ? (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Link2 className="size-3" />
                            {t(requirementLabel(linkedTo))}
                          </span>
                        </>
                      ) : null}
                    </span>
                  </div>
                  <UploadStatusBadge status={file.status} />
                  {linkedTo ? <Badge variant="secondary">{t('procedure.explorer.linked')}</Badge> : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon-sm" aria-label={t('projects.actions.menu')} />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        render={
                          <Link
                            to="/{-$locale}/uploads/$id"
                            params={{ locale: toLocaleParam(locale), id: file.id }}
                          />
                        }
                      >
                        <ExternalLink />
                        {t('procedure.explorer.open')}
                      </DropdownMenuItem>
                      {documentRequirements.length > 0 ? (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <Link2 />
                            {t('procedure.explorer.linkTo')}
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {documentRequirements.map((r) => (
                              <DropdownMenuItem
                                key={r.requirementId}
                                disabled={linkedTo === r.requirementId}
                                onClick={() =>
                                  link.mutate({ requirementId: r.requirementId, uploadId: file.id })
                                }
                              >
                                {t(requirementLabel(r.requirementId))}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      ) : null}
                      {linkedTo ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => link.mutate({ requirementId: linkedTo, uploadId: null })}
                          >
                            <Link2Off />
                            {t('procedure.explorer.unlink')}
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <Dialog open={uploading} onOpenChange={setUploading}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('procedure.explorer.upload.title')}</DialogTitle>
            <DialogDescription>{t('procedure.explorer.upload.description')}</DialogDescription>
          </DialogHeader>
          <UploadDropzone
            projectId={project.id}
            onUploaded={() => {
              toast.add({ type: 'success', title: t('procedure.explorer.uploaded') })
              setUploading(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FolderButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-current={active || undefined}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        active
          ? 'bg-accent font-medium text-accent-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {active ? <FolderOpen className="size-4 shrink-0" /> : <Folder className="size-4 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-xs tabular-nums">{count}</span>
    </button>
  )
}
