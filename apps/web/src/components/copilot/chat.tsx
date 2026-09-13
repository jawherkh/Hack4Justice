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
import { Toggle } from '@hack4justice/ui/components/toggle'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircleIcon, CheckIcon, CopyIcon, FolderIcon, RouteIcon, SparklesIcon } from 'lucide-react'
import { useI18n, type MessageKey } from '#/i18n'
import { ApiError } from '#/lib/api-error'
import { anchorWorkspaceLinks, copilotKeys } from '#/lib/copilot'
import { CopilotFilesPanel, FilePanelProvider, copilotMarkdownComponents, useFilePanel } from './file-panel'
import { useStepsPanel } from './steps-panel'
import { ToolCallWidget } from './tool-widgets'
import { useCopilotChat, type ChatMessage, type ChatPart, type ChatStatus } from './use-copilot-chat'

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

/** One conversation: streamed replies, tool widgets, the prompt box and the files side panel. */
export function CopilotChat(props: CopilotChatProps) {
  return (
    <FilePanelProvider>
      <CopilotChatLayout {...props} />
    </FilePanelProvider>
  )
}

/** Chat on the left, the files panel sliding open on the right (covering the chat on small screens). */
function CopilotChatLayout({ projectId, conversationId, ...props }: CopilotChatProps) {
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <CopilotConversation projectId={projectId} conversationId={conversationId} {...props} />
      </div>
      <CopilotFilesPanel projectId={projectId} conversationId={conversationId} />
    </div>
  )
}

function CopilotConversation({
  projectId,
  conversationId,
  initialPrompt,
  onInitialPromptSent,
}: CopilotChatProps) {
  const { t } = useI18n()
  const chat = useCopilotChat(projectId, conversationId)
  const sentInitial = React.useRef<string | null>(null)
  const steps = useStepsPanel()
  const panel = useFilePanel()
  const queryClient = useQueryClient()

  React.useEffect(() => {
    if (!initialPrompt || chat.isLoading || sentInitial.current === conversationId) return
    sentInitial.current = conversationId
    void chat.send(initialPrompt)
    onInitialPromptSent?.()
  }, [chat, conversationId, initialPrompt, onInitialPromptSent])

  // A finished turn may have written new drafts into the workspace.
  const wasBusy = React.useRef(false)
  React.useEffect(() => {
    const busyNow = chat.status === 'submitted' || chat.status === 'streaming'
    if (wasBusy.current && !busyNow) {
      void queryClient.invalidateQueries({ queryKey: copilotKeys.files(projectId, conversationId) })
    }
    wasBusy.current = busyNow
  }, [chat.status, conversationId, projectId, queryClient])

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
      <div className="flex items-center justify-end gap-2 pb-2">
        <Toggle
          variant="outline"
          size="sm"
          pressed={steps.open}
          onPressedChange={steps.setOpen}
          aria-label={t('copilot.view.steps')}
        >
          <RouteIcon data-icon="inline-start" />
          <span className="hidden sm:inline">{t('copilot.view.steps')}</span>
        </Toggle>
        <Toggle
          variant="outline"
          size="sm"
          pressed={panel?.isOpen ?? false}
          onPressedChange={(pressed) => (pressed ? panel?.showList() : panel?.close())}
          aria-label={t('copilot.files.title')}
        >
          <FolderIcon data-icon="inline-start" />
          <span className="hidden sm:inline">{t('copilot.files.title')}</span>
        </Toggle>
      </div>
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
  const groups = groupParts(message.parts)
  return (
    <Message from="assistant">
      {groups.map((group, index) =>
        group.type === 'tools' ? (
          // Consecutive tool calls stack as one quiet activity block, like a Codex transcript.
          <div key={group.calls[0]!.callId} className="-mx-1.5 flex w-full flex-col">
            {group.calls.map((call) => (
              <ToolCallWidget key={call.callId} call={call} />
            ))}
          </div>
        ) : (
          <MessageContent key={index}>
            <MessageResponse
              isAnimating={streaming && index === groups.length - 1}
              components={copilotMarkdownComponents}
            >
              {anchorWorkspaceLinks(group.text)}
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

type PartGroup =
  { type: 'text'; text: string } | { type: 'tools'; calls: Extract<ChatPart, { type: 'tool' }>[] }

/** Runs of tool calls collapse into one group so they render as a tight list between prose. */
function groupParts(parts: ChatPart[]): PartGroup[] {
  const groups: PartGroup[] = []
  for (const part of parts) {
    const last = groups.at(-1)
    if (part.type === 'tool') {
      if (last?.type === 'tools') last.calls.push(part)
      else groups.push({ type: 'tools', calls: [part] })
    } else {
      groups.push({ type: 'text', text: part.text })
    }
  }
  return groups
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
