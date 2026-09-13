import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ProcedureStep } from '@hack4justice/shared'
import { RouteIcon } from 'lucide-react'
import { useI18n } from '#/i18n'
import { getProject, projectKeys } from '#/lib/projects'
import { ProcedureFlow, stepNodeId, requirementNodeId } from './procedure-flow'
import { SlidePanel } from './slide-panel'
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

/**
 * Side panel with the procedure graph. Slides open next to the chat, can be dragged wider
 * from its inner edge or maximised over the chat. Pressing a node opens its details in place.
 */
export function StepsPanel({ projectId }: { projectId: string }) {
  const { t } = useI18n()
  const panel = useStepsPanel()

  const project = useQuery({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => getProject(projectId),
    enabled: panel.open,
  })

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
    <SlidePanel
      open={panel.open}
      onClose={close}
      labels={{
        panel: t('copilot.view.steps'),
        resize: t('copilot.steps.resize'),
        maximize: t('copilot.steps.maximize'),
        restore: t('copilot.steps.restore'),
        close: t('copilot.steps.close'),
      }}
      heading={
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <RouteIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{t('copilot.steps.title')}</span>
        </h2>
      }
    >
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
                onSelectRequirement={(requirementId) => panel.select({ kind: 'requirement', requirementId })}
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
    </SlidePanel>
  )
}
