import * as React from 'react'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@hack4justice/ui/components/ai-elements/conversation'
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '@hack4justice/ui/components/ai-elements/message'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@hack4justice/ui/components/ai-elements/prompt-input'
import { Shimmer } from '@hack4justice/ui/components/ai-elements/shimmer'
import { Suggestion, Suggestions } from '@hack4justice/ui/components/ai-elements/suggestion'
import { Alert, AlertDescription, AlertTitle } from '@hack4justice/ui/components/alert'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@hack4justice/ui/components/toggle-group'
import {
  AlertCircleIcon,
  CheckIcon,
  CopyIcon,
  MessageSquareIcon,
  RouteIcon,
  SparklesIcon,
  WorkflowIcon,
} from 'lucide-react'
import { useI18n, type MessageKey } from '#/i18n'
import { ApiError } from '#/lib/api-error'
import { ConversationFlow } from './conversation-flow'
import { ProcedureFlow } from './procedure-flow'
import { ToolCallWidget } from './tool-widgets'
import { useCopilotChat, type ChatMessage, type ChatStatus } from './use-copilot-chat'

const SUGGESTIONS: MessageKey[] = [
  'copilot.suggestion.status',
  'copilot.suggestion.missing',
  'copilot.suggestion.documents',
  'copilot.suggestion.legal',
]

interface CopilotChatProps {
  projectId: string
  conversationId: string
  /** Sent as soon as the thread loads (a first message typed before the thread existed). */
  initialPrompt?: string
  onInitialPromptSent?: () => void
}

/** One conversation: streamed replies, tool widgets and the prompt box. */
export function CopilotChat({
  projectId,
  conversationId,
  initialPrompt,
  onInitialPromptSent,
}: CopilotChatProps) {
  const { t } = useI18n()
  const chat = useCopilotChat(projectId, conversationId)
  const sentInitial = React.useRef<string | null>(null)
  const [view, setView] = React.useState<'chat' | 'steps' | 'flow'>('chat')

  React.useEffect(() => {
    if (!initialPrompt || chat.isLoading || sentInitial.current === conversationId) return
    sentInitial.current = conversationId
    void chat.send(initialPrompt)
    onInitialPromptSent?.()
  }, [chat, conversationId, initialPrompt, onInitialPromptSent])

  if (chat.loadError) {
    return (
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>{t('copilot.loadError')}</AlertTitle>
        <AlertDescription>
          {chat.loadError instanceof ApiError ? chat.loadError.message : String(chat.loadError)}
        </AlertDescription>
      </Alert>
    )
  }

  const busy = chat.status === 'submitted' || chat.status === 'streaming'
  const last = chat.messages.at(-1)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-end pb-2">
        <ToggleGroup
          value={[view]}
          onValueChange={(value) => {
            const next = value[0]
            if (next === 'chat' || next === 'steps' || next === 'flow') setView(next)
          }}
          variant="outline"
          size="sm"
          aria-label={t('copilot.view.chat')}
        >
          <ToggleGroupItem value="chat" aria-label={t('copilot.view.chat')}>
            <MessageSquareIcon />
            <span className="hidden sm:inline">{t('copilot.view.chat')}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="steps" aria-label={t('copilot.view.steps')}>
            <RouteIcon />
            <span className="hidden sm:inline">{t('copilot.view.steps')}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="flow" aria-label={t('copilot.view.flow')}>
            <WorkflowIcon />
            <span className="hidden sm:inline">{t('copilot.view.flow')}</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {view === 'steps' ? (
        <ProcedureFlow projectId={projectId} />
      ) : view === 'flow' ? (
        <ConversationFlow messages={chat.messages} status={chat.status} />
      ) : (
        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="mx-auto w-full max-w-3xl gap-6">
            {chat.isLoading ? (
              <ChatSkeleton />
            ) : chat.messages.length === 0 ? (
              <ConversationEmptyState
                icon={<SparklesIcon className="size-8" />}
                title={t('copilot.emptyTitle')}
                description={t('copilot.emptyDescription')}
              />
            ) : (
              chat.messages.map((message) => (
                <ChatMessageView
                  key={message.id}
                  message={message}
                  streaming={busy && message.id === last?.id}
                  status={chat.status}
                />
              ))
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      {view === 'chat' ? (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 pt-3">
          {chat.messages.length === 0 && !chat.isLoading ? (
            <Suggestions>
              {SUGGESTIONS.map((key) => (
                <Suggestion key={key} suggestion={t(key)} onClick={(text) => void chat.send(text)} />
              ))}
            </Suggestions>
          ) : null}
          {chat.error && chat.status === 'error' ? (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>{t('copilot.error')}</AlertTitle>
              <AlertDescription>{chat.error}</AlertDescription>
            </Alert>
          ) : null}
          <PromptInput
            onSubmit={({ text }) => {
              // Rejecting keeps the draft in the box while a reply is still streaming.
              if (busy) return Promise.reject(new Error('busy'))
              return chat.send(text)
            }}
          >
            <PromptInputBody>
              <PromptInputTextarea placeholder={t('copilot.placeholder')} />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <span className="ps-1 text-xs text-muted-foreground">{t('copilot.hint')}</span>
              </PromptInputTools>
              <PromptInputSubmit status={chat.status} onStop={chat.stop} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      ) : null}
    </div>
  )
}

function ChatMessageView({
  message,
  streaming,
  status,
}: {
  message: ChatMessage
  streaming: boolean
  status: ChatStatus
}) {
  const { t } = useI18n()
  if (message.role === 'user') {
    return (
      <Message from="user">
        <MessageContent>
          <p className="whitespace-pre-wrap">{message.content}</p>
        </MessageContent>
      </Message>
    )
  }
  const last = message.parts.at(-1)
  const running = last?.type === 'tool' && last.status === 'running'
  const thinking = streaming && !running && last?.type !== 'text'
  return (
    <Message from="assistant">
      {message.parts.map((part, index) =>
        part.type === 'tool' ? (
          <ToolCallWidget key={part.callId} call={part} />
        ) : (
          <MessageContent key={index}>
            <MessageResponse isAnimating={streaming && index === message.parts.length - 1}>
              {part.text}
            </MessageResponse>
          </MessageContent>
        ),
      )}
      {thinking ? (
        <Shimmer className="text-sm">
          {status === 'submitted' ? t('copilot.thinking') : t('copilot.working')}
        </Shimmer>
      ) : null}
      {message.status === 'failed' ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>{t('copilot.error')}</AlertTitle>
          <AlertDescription>{message.error ?? t('copilot.errorGeneric')}</AlertDescription>
        </Alert>
      ) : null}
      {message.content && !streaming ? <CopyAction text={message.content} /> : null}
    </Message>
  )
}

function CopyAction({ text }: { text: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = React.useState(false)
  return (
    <MessageActions>
      <MessageAction
        tooltip={copied ? t('copilot.copied') : t('copilot.copy')}
        label={t('copilot.copy')}
        onClick={async () => {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </MessageAction>
    </MessageActions>
  )
}

function ChatSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="ms-auto h-10 w-2/5 rounded-lg" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  )
}
