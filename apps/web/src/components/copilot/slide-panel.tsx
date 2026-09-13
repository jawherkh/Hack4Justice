import * as React from 'react'
import { Button } from '@hack4justice/ui/components/button'
import { cn } from '@hack4justice/ui/lib/utils'
import { Maximize2Icon, Minimize2Icon, XIcon } from 'lucide-react'

const MIN_WIDTH = 360
const DEFAULT_WIDTH = 480
/** Space the content beside the panel keeps when the panel is not maximised. */
const SIBLING_MIN_WIDTH = 320
/** Below this container width the panel always covers its sibling (phones). */
const OVERLAY_BREAKPOINT = 760

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'

export interface SlidePanelLabels {
  /** Accessible name of the panel. */
  panel: string
  resize: string
  maximize: string
  restore: string
  close: string
}

interface SlidePanelProps {
  open: boolean
  onClose: () => void
  labels: SlidePanelLabels
  /** Left part of the header: icon or back button plus the title. */
  heading: React.ReactNode
  /** Extra header buttons, placed before maximise and close. */
  actions?: React.ReactNode
  children: React.ReactNode
}

/**
 * Side panel that slides open next to its previous sibling in a flex row. It can be dragged
 * wider from its inner edge or maximised over the sibling, and covers it on narrow screens.
 * Content keeps its final width while the panel animates so nothing reflows mid-transition.
 */
export function SlidePanel({ open, onClose, labels, heading, actions, children }: SlidePanelProps) {
  const asideRef = React.useRef<HTMLElement | null>(null)
  const [width, setWidth] = React.useState(DEFAULT_WIDTH)
  const [maximized, setMaximized] = React.useState(false)
  const [containerWidth, setContainerWidth] = React.useState<number | null>(null)
  const [dragging, setDragging] = React.useState(false)

  // The panel sizes itself against the row it sits in, so the sibling never drops below its minimum.
  React.useEffect(() => {
    const parent = asideRef.current?.parentElement
    if (!parent) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setContainerWidth(entry.contentRect.width)
    })
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])

  const overlay = containerWidth !== null && containerWidth < OVERLAY_BREAKPOINT
  /** Maximised or on a narrow screen: the panel takes the whole row instead of sitting beside the sibling. */
  const covering = maximized || overlay
  const fullWidth = containerWidth ?? DEFAULT_WIDTH
  const maxWidth = Math.max(MIN_WIDTH, fullWidth - SIBLING_MIN_WIDTH)
  const targetWidth = !open ? 0 : covering ? fullWidth : Math.min(Math.max(width, MIN_WIDTH), maxWidth)

  const onDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (covering) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = targetWidth
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
    setDragging(true)
    const onMove = (move: PointerEvent) => {
      const delta = rtl ? move.clientX - startX : startX - move.clientX
      setWidth(Math.min(Math.max(startWidth + delta, MIN_WIDTH), maxWidth))
    }
    const onUp = () => {
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <aside
      ref={asideRef}
      aria-label={labels.panel}
      aria-hidden={!open}
      inert={!open}
      className={cn('relative min-h-0 shrink-0 overflow-hidden', open && !covering && 'ms-3')}
      style={{
        width: targetWidth,
        transition: dragging ? 'none' : `width 320ms ${EASE}, margin 320ms ${EASE}`,
      }}
    >
      {/* Inner column keeps its final width so content does not reflow while the panel animates. */}
      <div
        className={cn(
          'absolute inset-y-0 end-0 flex flex-col gap-2 bg-card transition-opacity duration-200',
          !covering && 'border-s ps-3',
          open ? 'opacity-100 delay-100' : 'opacity-0',
        )}
        style={{ width: Math.max(targetWidth, open ? MIN_WIDTH : 0) }}
      >
        {!covering ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={labels.resize}
            onPointerDown={onDragStart}
            className={cn(
              'absolute inset-y-0 -start-1 z-10 w-2 cursor-col-resize transition-colors hover:bg-primary/20',
              dragging && 'bg-primary/30',
            )}
          />
        ) : null}
        <header className="flex h-8 shrink-0 items-center justify-between gap-2">
          {heading}
          <div className="flex shrink-0 items-center gap-0.5">
            {actions}
            {!overlay ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-pressed={maximized}
                aria-label={maximized ? labels.restore : labels.maximize}
                onClick={() => setMaximized((v) => !v)}
              >
                {maximized ? <Minimize2Icon /> : <Maximize2Icon />}
              </Button>
            ) : null}
            <Button variant="ghost" size="icon-sm" aria-label={labels.close} onClick={onClose}>
              <XIcon />
            </Button>
          </div>
        </header>
        {children}
      </div>
    </aside>
  )
}
