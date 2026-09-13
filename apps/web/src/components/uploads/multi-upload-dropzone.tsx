import * as React from 'react'
import { AlertCircle, CheckCircle2, FileText, UploadCloud } from 'lucide-react'
import { Button } from '@hack4justice/ui/components/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hack4justice/ui/components/select'
import { Spinner } from '@hack4justice/ui/components/spinner'
import { toast } from '@hack4justice/ui/components/toast'
import { cn } from '@hack4justice/ui/lib/utils'
import { useI18n, type MessageKey } from '#/i18n'
import { formatBytes } from '#/lib/format'
import { OCR_LANGUAGES, type OcrLanguages } from '#/lib/uploads'
import { acceptFiles, useFileDrop, type FileDropError } from './use-file-drop'
import type { QueueItem } from './use-upload-queue'

const LANGUAGE_LABEL: Record<OcrLanguages, MessageKey> = {
  'fra+eng': 'uploads.lang.fra_eng',
  fra: 'uploads.lang.fra',
  eng: 'uploads.lang.eng',
  'ara+fra': 'uploads.lang.ara_fra',
}

interface MultiUploadDropzoneProps {
  /** Queue state from `useUploadQueue`, shared so outer drop targets feed the same list. */
  items: QueueItem[]
  onFiles: (files: File[]) => void
  onClear: () => void
  languages: OcrLanguages
  onLanguagesChange: (value: OcrLanguages) => void
  className?: string
}

/** Always-open drop area for several PDFs; uploads start as soon as files are picked. */
export function MultiUploadDropzone({
  items,
  onFiles,
  onClear,
  languages,
  onLanguagesChange,
  className,
}: MultiUploadDropzoneProps) {
  const { t, locale } = useI18n()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const dropError = (error: FileDropError) =>
    toast.add({
      type: 'error',
      title: t(error === 'notPdf' ? 'uploads.drop.notPdf' : 'uploads.drop.tooLarge'),
    })
  const collected: File[] = []
  const { dragging, handlers } = useFileDrop({
    multiple: true,
    onFile: (file) => collected.push(file),
    onError: dropError,
  })
  const languageItems = OCR_LANGUAGES.map((value) => ({ value, label: t(LANGUAGE_LABEL[value]) }))
  const finished = items.filter((item) => item.status === 'done' || item.status === 'failed').length

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div
        {...handlers}
        onDrop={(event) => {
          collected.length = 0
          handlers.onDrop?.(event)
          if (collected.length) onFiles([...collected])
        }}
        className="flex flex-col gap-3 rounded-xl border bg-card p-3"
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            dragging ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
          )}
        >
          <UploadCloud className={cn('size-7', dragging ? 'text-primary' : 'text-muted-foreground')} />
          <p className="text-sm font-medium">{t('uploads.drop.titleMulti')}</p>
          <p className="text-xs text-muted-foreground">{t('uploads.drop.hintMulti')}</p>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(event) => {
            const files: File[] = []
            acceptFiles(event.target.files ?? [], true, (file) => files.push(file), dropError)
            if (files.length) onFiles(files)
            event.target.value = ''
          }}
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('uploads.drop.languages')}</span>
          <Select
            items={languageItems}
            value={languages}
            onValueChange={(value) => onLanguagesChange(value as OcrLanguages)}
          >
            <SelectTrigger size="sm" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languageItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {items.length > 0 ? (
        <ul className="divide-y rounded-xl border bg-card text-sm">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-3 px-3 py-2">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
              <span className="text-xs text-muted-foreground">{formatBytes(item.file.size, locale)}</span>
              {item.status === 'uploading' || item.status === 'queued' ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Spinner className="size-3.5" />
                  {t('uploads.queue.uploading')}
                </span>
              ) : item.status === 'done' ? (
                <span className="flex items-center gap-1 text-xs text-primary">
                  <CheckCircle2 className="size-3.5" />
                  {t('uploads.queue.done')}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-destructive" title={item.error}>
                  <AlertCircle className="size-3.5" />
                  {item.error ?? t('uploads.queue.failed')}
                </span>
              )}
            </li>
          ))}
          {finished > 0 ? (
            <li className="flex justify-end px-2 py-1">
              <Button variant="ghost" size="xs" onClick={onClear}>
                {t('uploads.queue.clear')}
              </Button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
