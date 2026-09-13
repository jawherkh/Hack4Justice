import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '#/lib/api-error'
import { uploadPdf, type OcrLanguages } from '#/lib/uploads'

export interface QueueItem {
  key: string
  file: File
  status: 'queued' | 'uploading' | 'done' | 'failed'
  error?: string
  uploadId?: string
}

interface UseUploadQueueOptions {
  projectId?: string
  languages: OcrLanguages
  onUploaded?: (uploadId: string, file: File) => void
}

/**
 * Sequential upload queue. Files are sent one at a time so a batch of scans
 * does not open a dozen parallel multipart requests against the OCR pipeline.
 */
export function useUploadQueue({ projectId, languages, onUploaded }: UseUploadQueueOptions) {
  const queryClient = useQueryClient()
  const [items, setItems] = React.useState<QueueItem[]>([])
  const running = React.useRef(false)
  const pending = React.useRef<QueueItem[]>([])
  const latest = React.useRef({ projectId, languages, onUploaded })
  latest.current = { projectId, languages, onUploaded }

  const update = (key: string, patch: Partial<QueueItem>) =>
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))

  const drain = React.useCallback(async () => {
    if (running.current) return
    running.current = true
    try {
      while (pending.current.length > 0) {
        const item = pending.current.shift()!
        update(item.key, { status: 'uploading' })
        try {
          const { projectId: pid, languages: langs, onUploaded: done } = latest.current
          const upload = await uploadPdf(
            pid
              ? { file: item.file, languages: langs, projectId: pid }
              : { file: item.file, languages: langs },
          )
          update(item.key, { status: 'done', uploadId: upload.id })
          done?.(upload.id, item.file)
        } catch (err) {
          update(item.key, { status: 'failed', error: err instanceof ApiError ? err.message : undefined })
        }
        void queryClient.invalidateQueries({ queryKey: ['uploads'] })
        if (latest.current.projectId) {
          void queryClient.invalidateQueries({ queryKey: ['projects', latest.current.projectId] })
        }
      }
    } finally {
      running.current = false
    }
  }, [queryClient])

  const add = React.useCallback(
    (files: File[]) => {
      const next = files.map<QueueItem>((file) => ({
        key: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        status: 'queued',
      }))
      setItems((prev) => [...prev, ...next])
      pending.current.push(...next)
      void drain()
    },
    [drain],
  )

  const clear = React.useCallback(
    () => setItems((prev) => prev.filter((item) => item.status === 'queued' || item.status === 'uploading')),
    [],
  )

  const busy = items.some((item) => item.status === 'queued' || item.status === 'uploading')
  return { items, add, clear, busy }
}
