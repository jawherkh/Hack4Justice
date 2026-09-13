import * as React from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CopilotChat } from '#/components/copilot/chat'
import { toLocaleParam, useI18n } from '#/i18n'

export const Route = createFileRoute('/{-$locale}/projects/$id/copilot/$conversationId')({
  // A first message typed on the welcome screen before the thread existed.
  validateSearch: (search: Record<string, unknown>): { prompt?: string } =>
    typeof search['prompt'] === 'string' && search['prompt'].trim() ? { prompt: search['prompt'] } : {},
  component: CopilotConversationPage,
})

function CopilotConversationPage() {
  const { id, conversationId } = Route.useParams()
  const { prompt } = Route.useSearch()
  const { locale } = useI18n()
  const navigate = useNavigate()

  // Drop the prompt from the URL once sent so a reload does not send it twice.
  const clearPrompt = React.useCallback(() => {
    void navigate({
      to: '/{-$locale}/projects/$id/copilot/$conversationId',
      params: { locale: toLocaleParam(locale), id, conversationId },
      search: {},
      replace: true,
    })
  }, [conversationId, id, locale, navigate])

  return (
    <CopilotChat
      key={conversationId}
      projectId={id}
      conversationId={conversationId}
      initialPrompt={prompt}
      onInitialPromptSent={clearPrompt}
    />
  )
}
