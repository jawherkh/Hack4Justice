import * as React from 'react'
import { MAX_UPLOAD_BYTES } from '#/lib/uploads'

export type FileDropError = 'notPdf' | 'tooLarge'

interface UseFileDropOptions {
  /** Called once per accepted file. */
  onFile: (file: File) => void
  onError?: (error: FileDropError) => void
  disabled?: boolean
  /** Accept every dropped file instead of the first one. */
  multiple?: boolean
}

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

/**
 * Drag-and-drop handlers for a single PDF. `dragging` is true while a file
 * hovers the element, so callers can highlight the drop target.
 */
export function acceptFiles(
  list: ArrayLike<File>,
  multiple: boolean,
  onFile: (file: File) => void,
  onError?: (error: FileDropError) => void,
) {
  const files = multiple ? Array.from(list) : Array.from(list).slice(0, 1)
  for (const file of files) {
    if (!isPdf(file)) onError?.('notPdf')
    else if (file.size > MAX_UPLOAD_BYTES) onError?.('tooLarge')
    else onFile(file)
  }
}

export function useFileDrop({ onFile, onError, disabled = false, multiple = false }: UseFileDropOptions) {
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
          acceptFiles(event.dataTransfer.files, multiple, onFile, onError)
        },
      }

  return { dragging, handlers }
}
