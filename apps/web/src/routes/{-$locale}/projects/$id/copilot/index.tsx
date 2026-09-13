import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@hack4justice/ui/components/ai-elements/prompt-input'
import { Suggestion, Suggestions } from '@hack4justice/ui/components/ai-elements/suggestion'
import { Alert, AlertDescription, AlertTitle } from '@hack4justice/ui/components/alert'
import { Button } from '@hack4justice/ui/components/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@hack4justice/ui/components/empty'
import { AlertCircleIcon, PlusIcon, SparklesIcon } from 'lucide-react'
import { toLocaleParam, useI18n, type MessageKey } from '#/i18n'
import { copilotKeys, createConversation, listConversations } from '#/lib/copilot'

const SUGGESTIONS: MessageKey[] = [
  'copilot.suggestion.status',
  'copilot.suggestion.missing',
  'copilot.suggestion.documents',
  'copilot.suggestion.legal',
]

export const Route = createFileRoute('/{-$locale}/projects/$id/copilot/')({ component: CopilotWelcome })

/** No thread selected: the first message creates one and opens it. */
function CopilotWelcome() {
  const { id } = Route.useParams()
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const threads = useQuery({ queryKey: copilotKeys.all(id), queryFn: () => listConversations(id) })
  const [error, setError] = React.useState<string | null>(null)

  const start = useMutation({
    mutationFn: async (prompt: string | null) => ({ conversation: await createConversation(id), prompt }),
    onSuccess: async ({ conversation, prompt }) => {
      await queryClient.invalidateQueries({ queryKey: copilotKeys.all(id), exact: true })
      await navigate({
        to: '/{-$locale}/projects/$id/copilot/$conversationId',
        params: { locale: toLocaleParam(locale), id, conversationId: conversation.id },
        search: prompt ? { prompt } : {},
      })
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : String(caught)),
  })

  if (threads.data && !threads.data.enabled) {
    return (
      <Alert>
        <AlertCircleIcon />
        <AlertTitle>{t('copilot.disabledTitle')}</AlertTitle>
        <AlertDescription>{t('copilot.disabledDescription')}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto">
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SparklesIcon />
            </EmptyMedia>
            <EmptyTitle>{t('copilot.welcomeTitle')}</EmptyTitle>
            <EmptyDescription>{t('copilot.welcomeDescription')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 pt-3">
        <Suggestions>
          {SUGGESTIONS.map((key) => (
            <Suggestion key={key} suggestion={t(key)} onClick={(text) => start.mutate(text)} />
          ))}
        </Suggestions>
        {error ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>{t('copilot.error')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <PromptInput
          onSubmit={({ text }) => {
            if (!text.trim()) return Promise.reject(new Error('empty'))
            start.mutate(text.trim())
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea placeholder={t('copilot.placeholder')} />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={start.isPending}
                onClick={() => start.mutate(null)}
              >
                <PlusIcon data-icon="inline-start" />
                {t('copilot.newChat')}
              </Button>
            </PromptInputTools>
            <PromptInputSubmit status={start.isPending ? 'submitted' : 'ready'} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}
