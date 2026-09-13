import * as React from 'react'
import { MAX_UPLOAD_BYTES } from '#/lib/uploads'

export type FileDropError = 'notPdf' | 'tooLarge'

interface UseFileDropOptions {
  onFile: (file: File) => void
  onError?: (error: FileDropError) => void
  disabled?: boolean
}

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

/**
 * Drag-and-drop handlers for a single PDF. `dragging` is true while a file
 * hovers the element, so callers can highlight the drop target.
 */
export function useFileDrop({ onFile, onError, disabled = false }: UseFileDropOptions) {
  const [dragging, setDragging] = React.useState(false)
  // Nested children fire enter/leave pairs; count them so the highlight does not flicker.
  const depth = React.useRef(0)

  const reset = () => {
    depth.current = 0
    setDragging(false)
  }

  const handlers = disabled
    ? {}
    : {
        onDragEnter: (event: React.DragEvent) => {
          if (!event.dataTransfer.types.includes('Files')) return
          event.preventDefault()
          depth.current += 1
          setDragging(true)
        },
        onDragOver: (event: React.DragEvent) => {
          if (!event.dataTransfer.types.includes('Files')) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        },
        onDragLeave: () => {
          depth.current = Math.max(0, depth.current - 1)
          if (depth.current === 0) setDragging(false)
        },
        onDrop: (event: React.DragEvent) => {
          event.preventDefault()
          reset()
          const file = event.dataTransfer.files[0]
          if (!file) return
          if (!isPdf(file)) return onError?.('notPdf')
          if (file.size > MAX_UPLOAD_BYTES) return onError?.('tooLarge')
          onFile(file)
        },
      }

  return { dragging, handlers }
}
