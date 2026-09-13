import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, UploadCloud } from 'lucide-react'
import { Button } from '@hack4justice/ui/components/button'
import { Card, CardContent } from '@hack4justice/ui/components/card'
import { Field, FieldError, FieldLabel } from '@hack4justice/ui/components/field'
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
import { ApiError } from '#/lib/api-error'
import { formatBytes } from '#/lib/format'
import { MAX_UPLOAD_BYTES, OCR_LANGUAGES, uploadPdf, type OcrLanguages } from '#/lib/uploads'

const LANGUAGE_LABEL: Record<OcrLanguages, MessageKey> = {
  'fra+eng': 'uploads.lang.fra_eng',
  fra: 'uploads.lang.fra',
  eng: 'uploads.lang.eng',
  'ara+fra': 'uploads.lang.ara_fra',
}

export function UploadDropzone() {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [file, setFile] = React.useState<File | null>(null)
  const [languages, setLanguages] = React.useState<OcrLanguages>('fra+eng')
  const [dragging, setDragging] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const upload = useMutation({
    mutationFn: uploadPdf,
    onSuccess: (result) => {
      toast.add({ type: 'success', title: t('uploads.toast.uploaded', { filename: result.filename }) })
      setFile(null)
      void queryClient.invalidateQueries({ queryKey: ['uploads'] })
    },
    onError: (err) => {
      toast.add({
        type: 'error',
        title: t('uploads.toast.error'),
        description: err instanceof ApiError ? err.message : t('auth.error.generic'),
      })
      void queryClient.invalidateQueries({ queryKey: ['uploads'] })
    },
  })

  function pick(candidate: File | undefined) {
    setError(null)
    if (!candidate) return
    if (candidate.type !== 'application/pdf' && !candidate.name.toLowerCase().endsWith('.pdf')) {
      return setError(t('uploads.drop.notPdf'))
    }
    if (candidate.size > MAX_UPLOAD_BYTES) return setError(t('uploads.drop.tooLarge'))
    setFile(candidate)
  }

  const languageItems = OCR_LANGUAGES.map((value) => ({ value, label: t(LANGUAGE_LABEL[value]) }))

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            pick(e.dataTransfer.files[0])
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors',
            dragging ? 'border-primary bg-accent' : 'border-border hover:bg-muted/50',
          )}
        >
          {file ? (
            <FileText className="size-8 text-primary" />
          ) : (
            <UploadCloud className="size-8 text-muted-foreground" />
          )}
          {file ? (
            <>
              <p className="text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(file.size, locale)}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">{t('uploads.drop.title')}</p>
              <p className="text-xs text-muted-foreground">{t('uploads.drop.hint')}</p>
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0])}
        />

        <div className="flex flex-wrap items-end gap-4">
          <Field className="w-56" data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="ocr-languages">{t('uploads.drop.languages')}</FieldLabel>
            <Select
              items={languageItems}
              value={languages}
              onValueChange={(value) => setLanguages(value as OcrLanguages)}
            >
              <SelectTrigger id="ocr-languages" className="w-full">
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
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
          <Button
            disabled={!file || upload.isPending}
            onClick={() => file && upload.mutate({ file, languages })}
          >
            {upload.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <UploadCloud data-icon="inline-start" />
            )}
            {t('uploads.drop.submit')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
