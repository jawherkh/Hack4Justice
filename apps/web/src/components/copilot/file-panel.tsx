import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { UploadStatus } from '@hack4justice/shared'
import { MessageResponse } from '@hack4justice/ui/components/ai-elements/message'
import { Button } from '@hack4justice/ui/components/button'
import { ScrollArea } from '@hack4justice/ui/components/scroll-area'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import { Spinner } from '@hack4justice/ui/components/spinner'
import { cn } from '@hack4justice/ui/lib/utils'
import {
  ArrowLeftIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileIcon,
  FileTextIcon,
  FolderIcon,
  RefreshCwIcon,
  XIcon,
} from 'lucide-react'
import { UploadStatusBadge } from '#/components/uploads/upload-status-badge'
import { useI18n } from '#/i18n'
import { ApiError } from '#/lib/api-error'
import {
  copilotKeys,
  fetchWorkspaceFile,
  fileRefKey,
  listConversationFiles,
  parseFileRef,
  type CopilotDocument,
  type CopilotFileRef,
  type CopilotWorkspaceFile,
} from '#/lib/copilot'
import { formatBytes } from '#/lib/format'
import { downloadUpload, getUpload } from '#/lib/uploads'

interface FilePanelContextValue {
  isOpen: boolean
  selected: CopilotFileRef | null
  /** Opens the panel on a file (from a link in a reply or a row in the list). */
  open: (ref: CopilotFileRef) => void
  /** Shows the file list, opening the panel if needed. */
  showList: () => void
  toggle: () => void
  close: () => void
}

const FilePanelContext = React.createContext<FilePanelContextValue | null>(null)

/** Holds which file the side panel shows; one provider per conversation. */
export function FilePanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<CopilotFileRef | null>(null)
  const value = React.useMemo<FilePanelContextValue>(
    () => ({
      isOpen,
      selected,
      open: (ref) => {
        setSelected(ref)
        setOpen(true)
      },
      showList: () => {
        setSelected(null)
        setOpen(true)
      },
      toggle: () => setOpen((current) => !current),
      close: () => setOpen(false),
    }),
    [isOpen, selected],
  )
  return <FilePanelContext.Provider value={value}>{children}</FilePanelContext.Provider>
}

export function useFilePanel(): FilePanelContextValue | null {
  return React.useContext(FilePanelContext)
}

/** Inline chip that opens a file the copilot referenced, used for both reply links and widgets. */
export function FileChip({
  fileRef,
  children,
  className,
}: {
  fileRef: CopilotFileRef
  children: React.ReactNode
  className?: string
}) {
  const panel = useFilePanel()
  const active = panel?.isOpen && panel.selected && fileRefKey(panel.selected) === fileRefKey(fileRef)
  return (
    <button
      type="button"
      onClick={() => panel?.open(fileRef)}
      className={cn(
        'inline-flex max-w-full cursor-pointer items-center gap-1 rounded-md border bg-muted/60 px-1.5 py-0.5 align-baseline text-[0.85em] font-medium text-foreground no-underline transition-colors hover:bg-accent hover:text-accent-foreground',
        active && 'border-primary/50 bg-primary/10',
        className,
      )}
    >
      <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{children}</span>
    </button>
  )
}

type AnchorProps = React.ComponentPropsWithoutRef<'a'> & { node?: unknown }

/** Markdown `a` renderer: file references become chips, everything else opens in a new tab. */
function MarkdownLink({ href, children, node: _node, className, ...props }: AnchorProps) {
  const fileRef = parseFileRef(href)
  if (fileRef) return <FileChip fileRef={fileRef}>{children}</FileChip>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('font-medium text-primary underline underline-offset-4', className)}
      {...props}
    >
      {children}
    </a>
  )
}

/**
 * Stable component map for `MessageResponse` (its memo ignores prop identity, so this must
 * never be recreated per render).
 */
export const copilotMarkdownComponents = { a: MarkdownLink } as const

interface CopilotFilesPanelProps {
  projectId: string
  conversationId: string
  className?: string
}

/** Right-hand panel: the file list, or the viewer of the selected file. */
export function CopilotFilesPanel({ projectId, conversationId, className }: CopilotFilesPanelProps) {
  const { t } = useI18n()
  const panel = useFilePanel()
  const queryClient = useQueryClient()
  const files = useQuery({
    queryKey: copilotKeys.files(projectId, conversationId),
    queryFn: () => listConversationFiles(projectId, conversationId),
  })
  const selected = panel?.selected ?? null
  const documents = files.data?.documents ?? []
  const workspace = files.data?.workspace ?? []
  const selectedDocument =
    selected?.kind === 'document' ? documents.find((d) => d.id === selected.uploadId) : undefined
  const selectedTitle =
    selected?.kind === 'document'
      ? (selectedDocument?.filename ?? t('copilot.files.document'))
      : selected?.kind === 'workspace'
        ? selected.path
        : null

  return (
    <aside className={cn('flex h-full min-h-0 flex-col', className)} aria-label={t('copilot.files.title')}>
      <header className="flex h-9 shrink-0 items-center gap-1 pb-2">
        {selected ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('copilot.files.back')}
            onClick={() => panel?.showList()}
          >
            <ArrowLeftIcon className="rtl:rotate-180" />
          </Button>
        ) : (
          <FolderIcon className="ms-1 size-4 text-muted-foreground" aria-hidden />
        )}
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold" title={selectedTitle ?? undefined}>
          {selectedTitle ?? t('copilot.files.title')}
        </h2>
        {!selected ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('copilot.files.refresh')}
            disabled={files.isFetching}
            onClick={() =>
              void queryClient.invalidateQueries({ queryKey: copilotKeys.files(projectId, conversationId) })
            }
          >
            <RefreshCwIcon className={cn(files.isFetching && 'animate-spin')} />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('copilot.files.close')}
          onClick={() => panel?.close()}
        >
          <XIcon />
        </Button>
      </header>

      <div className="min-h-0 flex-1">
        {selected?.kind === 'document' ? (
          <DocumentViewer uploadId={selected.uploadId} />
        ) : selected?.kind === 'workspace' ? (
          <WorkspaceFileViewer projectId={projectId} conversationId={conversationId} path={selected.path} />
        ) : files.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </div>
        ) : files.isError ? (
          <p className="text-sm text-destructive">
            {files.error instanceof ApiError ? files.error.message : t('copilot.files.loadError')}
          </p>
        ) : (
          <FileList documents={documents} workspace={workspace} />
        )}
      </div>
    </aside>
  )
}

function FileList({
  documents,
  workspace,
}: {
  documents: CopilotDocument[]
  workspace: CopilotWorkspaceFile[]
}) {
  const { t, locale } = useI18n()
  const panel = useFilePanel()
  const selectedKey = panel?.selected ? fileRefKey(panel.selected) : null
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 pe-2">
        <section className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium text-muted-foreground uppercase">
            {t('copilot.files.documents')}
          </h3>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('copilot.files.noDocuments')}</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border">
              {documents.map((document) => {
                const fileRef: CopilotFileRef = { kind: 'document', uploadId: document.id }
                return (
                  <li key={document.id}>
                    <FileRow
                      active={selectedKey === fileRefKey(fileRef)}
                      icon={FileTextIcon}
                      title={document.filename}
                      subtitle={[
                        formatBytes(document.size, locale),
                        document.pageCount ? t('copilot.widget.pages', { count: document.pageCount }) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      trailing={<UploadStatusBadge status={document.status as UploadStatus} />}
                      onClick={() => panel?.open(fileRef)}
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </section>
        <section className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium text-muted-foreground uppercase">
            {t('copilot.files.workspace')}
          </h3>
          {workspace.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('copilot.files.noWorkspace')}</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border">
              {workspace.map((file) => {
                const fileRef: CopilotFileRef = { kind: 'workspace', path: file.path }
                return (
                  <li key={file.path}>
                    <FileRow
                      active={selectedKey === fileRefKey(fileRef)}
                      icon={FileIcon}
                      title={file.name}
                      subtitle={file.path}
                      onClick={() => panel?.open(fileRef)}
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </ScrollArea>
  )
}

function FileRow({
  active,
  icon: Icon,
  title,
  subtitle,
  trailing,
  onClick,
}: {
  active: boolean
  icon: typeof FileIcon
  title: string
  subtitle?: string
  trailing?: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-start text-sm transition-colors hover:bg-accent',
        active && 'bg-accent',
      )}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{title}</span>
        {subtitle ? <span className="truncate text-xs text-muted-foreground">{subtitle}</span> : null}
      </span>
      {trailing}
    </button>
  )
}

/** Uploaded PDF rendered by the browser from its presigned URL, like the documents page preview. */
function DocumentViewer({ uploadId }: { uploadId: string }) {
  const { t, locale } = useI18n()
  const upload = useQuery({
    queryKey: ['uploads', uploadId, 'preview'],
    queryFn: () => getUpload(uploadId),
    // Presigned URLs expire; do not keep serving a stale one.
    staleTime: 5 * 60 * 1000,
  })
  if (upload.isPending) return <ViewerLoading />
  if (upload.isError) {
    return (
      <p className="p-2 text-sm text-destructive">
        {upload.error instanceof ApiError ? upload.error.message : t('uploads.preview.loadError')}
      </p>
    )
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <UploadStatusBadge status={upload.data.status} />
        <span>{formatBytes(upload.data.size, locale)}</span>
        {upload.data.pageCount ? (
          <span>{t('uploads.detail.pages', { count: upload.data.pageCount })}</span>
        ) : null}
        <span className="ms-auto flex items-center gap-1">
          <Button variant="ghost" size="xs" onClick={() => void downloadUpload(upload.data.id)}>
            <DownloadIcon data-icon="inline-start" />
            {t('uploads.detail.download')}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            render={<a href={upload.data.downloadUrl} target="_blank" rel="noopener noreferrer" />}
          >
            <ExternalLinkIcon data-icon="inline-start" />
            {t('uploads.preview.openTab')}
          </Button>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted">
        <iframe
          key={upload.data.downloadUrl}
          src={upload.data.downloadUrl}
          title={upload.data.filename}
          className="size-full"
        />
      </div>
    </div>
  )
}

/** A file the copilot wrote: Markdown and text inline, PDFs and images through a blob URL. */
function WorkspaceFileViewer({
  projectId,
  conversationId,
  path,
}: {
  projectId: string
  conversationId: string
  path: string
}) {
  const { t } = useI18n()
  const file = useQuery({
    queryKey: [...copilotKeys.files(projectId, conversationId), path],
    queryFn: () => loadWorkspaceFile(projectId, conversationId, path),
    staleTime: 30 * 1000,
  })
  const blobUrl = useBlobUrl(file.data?.kind === 'binary' ? file.data.blob : undefined)
  if (file.isPending) return <ViewerLoading />
  if (file.isError) {
    return (
      <p className="p-2 text-sm text-destructive">
        {file.error instanceof ApiError ? file.error.message : t('copilot.files.loadError')}
      </p>
    )
  }
  const data = file.data
  const name = path.slice(path.lastIndexOf('/') + 1)
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="truncate">{data.contentType.split(';')[0]}</span>
        <span className="ms-auto">
          <Button
            variant="ghost"
            size="xs"
            disabled={!blobUrl && data.kind === 'binary'}
            render={<a href={blobUrl ?? textUrl(data)} download={name} />}
          >
            <DownloadIcon data-icon="inline-start" />
            {t('uploads.detail.download')}
          </Button>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted">
        {data.kind === 'binary' ? (
          blobUrl ? (
            data.contentType.startsWith('image/') ? (
              <ScrollArea className="h-full">
                <img src={blobUrl} alt={name} className="max-w-full" />
              </ScrollArea>
            ) : (
              <iframe key={blobUrl} src={blobUrl} title={name} className="size-full" />
            )
          ) : (
            <ViewerLoading />
          )
        ) : data.kind === 'markdown' ? (
          <ScrollArea className="h-full bg-card">
            <div className="p-4 text-sm">
              <MessageResponse mode="static" components={copilotMarkdownComponents}>
                {data.text}
              </MessageResponse>
            </div>
          </ScrollArea>
        ) : (
          <ScrollArea className="h-full bg-card">
            <pre className="p-4 font-mono text-xs whitespace-pre-wrap">{data.text}</pre>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}

type LoadedWorkspaceFile =
  | { kind: 'markdown' | 'text'; text: string; contentType: string }
  | { kind: 'binary'; blob: Blob; contentType: string }

async function loadWorkspaceFile(
  projectId: string,
  conversationId: string,
  path: string,
): Promise<LoadedWorkspaceFile> {
  const { blob, contentType } = await fetchWorkspaceFile(projectId, conversationId, path)
  const type = contentType.split(';')[0]?.trim() ?? ''
  if (type === 'text/markdown') return { kind: 'markdown', text: await blob.text(), contentType }
  if (type.startsWith('text/') || type === 'application/json') {
    return { kind: 'text', text: await blob.text(), contentType }
  }
  return { kind: 'binary', blob, contentType }
}

function textUrl(data: LoadedWorkspaceFile): string {
  return data.kind === 'binary' ? '#' : `data:${data.contentType},${encodeURIComponent(data.text)}`
}

/** Object URL for a blob, revoked when the blob changes or the viewer unmounts. */
function useBlobUrl(blob: Blob | undefined): string | null {
  const [url, setUrl] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

function ViewerLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner />
    </div>
  )
}
