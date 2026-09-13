import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ProcedureStep } from '@hack4justice/shared'
import { Button } from '@hack4justice/ui/components/button'
import { cn } from '@hack4justice/ui/lib/utils'
import { Maximize2Icon, Minimize2Icon, RouteIcon, XIcon } from 'lucide-react'
import { useI18n } from '#/i18n'
import { getProject, projectKeys } from '#/lib/projects'
import { ProcedureFlow, stepNodeId, requirementNodeId } from './procedure-flow'
import { RequirementDetail, StepDetail } from './step-details'

/** What the user opened by pressing a node in the steps graph. */
export type StepsSelection =
  { kind: 'step'; step: ProcedureStep } | { kind: 'requirement'; requirementId: string }

interface StepsPanelState {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  selection: StepsSelection | null
  select: (selection: StepsSelection | null) => void
}

const StepsPanelContext = React.createContext<StepsPanelState | null>(null)

/** Panel state lives above the conversation routes so switching threads keeps it open. */
export function StepsPanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const [selection, select] = React.useState<StepsSelection | null>(null)
  const value = React.useMemo<StepsPanelState>(
    () => ({ open, setOpen, toggle: () => setOpen((v) => !v), selection, select }),
    [open, selection],
  )
  return <StepsPanelContext.Provider value={value}>{children}</StepsPanelContext.Provider>
}

export function useStepsPanel(): StepsPanelState {
  const state = React.useContext(StepsPanelContext)
  if (!state) throw new Error('useStepsPanel must be used inside StepsPanelProvider')
  return state
}

const MIN_WIDTH = 360
const DEFAULT_WIDTH = 480
/** Space the chat keeps when the panel is not maximised. */
const CHAT_MIN_WIDTH = 320
/** Below this container width the panel always covers the chat (phones). */
const OVERLAY_BREAKPOINT = 760

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'

/**
 * Side panel with the procedure graph. Slides open next to the chat, can be dragged wider
 * from its inner edge or maximised over the chat. Pressing a node opens its details in place.
 */
export function StepsPanel({ projectId }: { projectId: string }) {
  const { t } = useI18n()
  const panel = useStepsPanel()
  const asideRef = React.useRef<HTMLElement | null>(null)
  const [width, setWidth] = React.useState(DEFAULT_WIDTH)
  const [maximized, setMaximized] = React.useState(false)
  const [containerWidth, setContainerWidth] = React.useState<number | null>(null)
  const [dragging, setDragging] = React.useState(false)

  const project = useQuery({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => getProject(projectId),
    enabled: panel.open,
  })

  // The panel sizes itself against the row it sits in, so the chat never drops below its minimum.
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
  /** Maximised or on a narrow screen: the panel takes the whole row instead of sitting beside the chat. */
  const covering = maximized || overlay
  const fullWidth = containerWidth ?? DEFAULT_WIDTH
  const maxWidth = Math.max(MIN_WIDTH, fullWidth - CHAT_MIN_WIDTH)
  const targetWidth = !panel.open ? 0 : covering ? fullWidth : Math.min(Math.max(width, MIN_WIDTH), maxWidth)

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

  const close = () => {
    panel.setOpen(false)
    panel.select(null)
  }

  const selectedNodeId = panel.selection
    ? panel.selection.kind === 'step'
      ? stepNodeId(panel.selection.step)
      : requirementNodeId(panel.selection.requirementId)
    : undefined

  return (
    <aside
      ref={asideRef}
      aria-label={t('copilot.view.steps')}
      aria-hidden={!panel.open}
      inert={!panel.open}
      className={cn('relative min-h-0 shrink-0 overflow-hidden', panel.open && !covering && 'ms-3')}
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
          panel.open ? 'opacity-100 delay-100' : 'opacity-0',
        )}
        style={{ width: Math.max(targetWidth, panel.open ? MIN_WIDTH : 0) }}
      >
        {!covering ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t('copilot.steps.resize')}
            onPointerDown={onDragStart}
            className={cn(
              'absolute inset-y-0 -start-1 z-10 w-2 cursor-col-resize transition-colors hover:bg-primary/20',
              dragging && 'bg-primary/30',
            )}
          />
        ) : null}
        <header className="flex shrink-0 items-center justify-between gap-2">
          <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <RouteIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{t('copilot.steps.title')}</span>
          </h2>
          <div className="flex items-center gap-0.5">
            {!overlay ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-pressed={maximized}
                aria-label={maximized ? t('copilot.steps.restore') : t('copilot.steps.maximize')}
                onClick={() => setMaximized((v) => !v)}
              >
                {maximized ? <Minimize2Icon /> : <Maximize2Icon />}
              </Button>
            ) : null}
            <Button variant="ghost" size="icon-sm" aria-label={t('copilot.steps.close')} onClick={close}>
              <XIcon />
            </Button>
          </div>
        </header>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <ProcedureFlow
            projectId={projectId}
            selectedNodeId={selectedNodeId}
            onSelectStep={(step) => panel.select({ kind: 'step', step })}
            onSelectRequirement={(requirementId) => panel.select({ kind: 'requirement', requirementId })}
          />
          {panel.selection && project.data ? (
            <div
              key={selectedNodeId}
              className="absolute inset-0 flex min-h-0 animate-in flex-col overflow-hidden rounded-lg border bg-card shadow-lg duration-300 fade-in-0 slide-in-from-bottom-4"
            >
              {panel.selection.kind === 'step' ? (
                <StepDetail
                  project={project.data}
                  step={panel.selection.step}
                  onBack={() => panel.select(null)}
                  onSelectRequirement={(requirementId) =>
                    panel.select({ kind: 'requirement', requirementId })
                  }
                />
              ) : (
                <RequirementDetail
                  project={project.data}
                  requirementId={panel.selection.requirementId}
                  onBack={() => panel.select(null)}
                />
              )}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  )
}
