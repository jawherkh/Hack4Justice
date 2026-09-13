import { Outlet, createFileRoute } from '@tanstack/react-router'
import { StepsPanel, StepsPanelProvider } from '#/components/copilot/steps-panel'
import { useI18n } from '#/i18n'

/**
 * Copilot section. Threads live in the project sidebar; this shell pins the chat to the
 * viewport (header + page padding subtracted) so the conversation scrolls inside itself.
 * The steps panel sits beside whichever thread is open and keeps its state across threads.
 */
export const Route = createFileRoute('/{-$locale}/projects/$id/copilot')({ component: CopilotLayout })

function CopilotLayout() {
  const { t } = useI18n()
  const { id } = Route.useParams()
  return (
    <div className="flex h-[calc(100svh-5rem)] min-h-0 flex-col gap-3 md:h-[calc(100svh-5.5rem)]">
      <header className="flex shrink-0 flex-col gap-0.5">
        <h1 className="text-2xl font-bold tracking-tight">{t('copilot.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('copilot.description')}</p>
      </header>
      <StepsPanelProvider>
        <div className="flex min-h-0 flex-1 rounded-xl border bg-card p-3 md:p-4">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <Outlet />
          </div>
          <StepsPanel projectId={id} />
        </div>
      </StepsPanelProvider>
    </div>
  )
}
