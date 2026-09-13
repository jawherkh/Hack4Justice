import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '#/lib/api-error'
import {
  copilotKeys,
  getConversation,
  streamMessage,
  type CopilotMessage,
  type CopilotToolCall,
} from '#/lib/copilot'

export interface ChatToolCall {
  callId: string
  name: string
  input?: unknown
  output?: unknown
  status: 'running' | 'completed' | 'failed'
}

/** Assistant output in the order it was produced: prose interleaved with tool calls. */
export type ChatPart = { type: 'text'; text: string } | ({ type: 'tool' } & ChatToolCall)

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  /** Full reply text (user text for user turns). */
  content: string
  parts: ChatPart[]
  status: 'streaming' | 'completed' | 'failed'
  error: string | null
  createdAt: string
}

/** Mirrors the AI SDK chat status so `PromptInputSubmit` can show the right icon. */
export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error'

export function toolCallsOf(message: ChatMessage): ChatToolCall[] {
  return message.parts.flatMap((part) => (part.type === 'tool' ? [part] : []))
}

function fromServerToolCall(call: CopilotToolCall): ChatToolCall {
  return { callId: call.callId, name: call.name, input: call.input, output: call.output, status: call.status }
}

function fromServer(message: CopilotMessage): ChatMessage {
  const stored = (message.parts ?? []) as ChatPart[]
  const parts: ChatPart[] =
    stored.length > 0
      ? stored
      : // Rows written before ordered parts existed: tools first, then the reply.
        [
          ...(message.toolCalls ?? []).map((call) => ({
            type: 'tool' as const,
            ...fromServerToolCall(call),
          })),
          ...(message.content ? [{ type: 'text' as const, text: message.content }] : []),
        ]
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    parts: message.role === 'user' ? [{ type: 'text', text: message.content }] : parts,
    status: message.status,
    error: message.error ?? null,
    createdAt:
      typeof message.createdAt === 'string' ? message.createdAt : new Date(message.createdAt).toISOString(),
  }
}

function appendText(parts: ChatPart[], delta: string): ChatPart[] {
  const last = parts.at(-1)
  if (last?.type === 'text') return [...parts.slice(0, -1), { type: 'text', text: last.text + delta }]
  return [...parts, { type: 'text', text: delta }]
}

/**
 * Chat state for one conversation. Persisted messages come from the API; while a reply
 * streams, the optimistic user message and the growing assistant message live here and are
 * swapped for their stored versions when the stream ends.
 */
export function useCopilotChat(projectId: string, conversationId: string) {
  const queryClient = useQueryClient()
  const detail = useQuery({
    queryKey: copilotKeys.conversation(projectId, conversationId),
    queryFn: () => getConversation(projectId, conversationId),
    refetchOnWindowFocus: false,
  })
  const [pending, setPending] = React.useState<ChatMessage[]>([])
  const [status, setStatus] = React.useState<ChatStatus>('ready')
  const [error, setError] = React.useState<string | null>(null)
  const abortRef = React.useRef<AbortController | null>(null)
  const streamingId = React.useRef<string | null>(null)

  // A new conversation starts clean; an in-flight request for the previous one is dropped.
  React.useEffect(() => {
    abortRef.current?.abort()
    abortRef.current = null
    streamingId.current = null
    setPending([])
    setStatus('ready')
    setError(null)
  }, [conversationId])

  const stored = React.useMemo(() => (detail.data?.messages ?? []).map(fromServer), [detail.data])
  const messages = React.useMemo(() => {
    if (pending.length === 0) return stored
    const known = new Set(stored.map((m) => m.id))
    return [...stored, ...pending.filter((m) => !known.has(m.id))]
  }, [stored, pending])

  const patchPending = React.useCallback((id: string, update: (message: ChatMessage) => ChatMessage) => {
    setPending((prev) => prev.map((m) => (m.id === id ? update(m) : m)))
  }, [])

  const send = React.useCallback(
    async (text: string) => {
      const content = text.trim()
      if (!content || status === 'submitted' || status === 'streaming') return
      const stamp = new Date().toISOString()
      const userId = `pending-user-${Date.now()}`
      const assistantId = `pending-assistant-${Date.now()}`
      streamingId.current = assistantId
      setError(null)
      setStatus('submitted')
      setPending((prev) => [
        ...prev,
        {
          id: userId,
          role: 'user',
          content,
          parts: [{ type: 'text', text: content }],
          status: 'completed',
          error: null,
          createdAt: stamp,
        },
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          parts: [],
          status: 'streaming',
          error: null,
          createdAt: stamp,
        },
      ])
      const controller = new AbortController()
      abortRef.current = controller
      let currentUserId = userId
      try {
        for await (const event of streamMessage(projectId, conversationId, content, controller.signal)) {
          if (streamingId.current !== assistantId) return
          switch (event.type) {
            case 'user_message': {
              const message = fromServer(event.message)
              setPending((prev) => prev.map((m) => (m.id === currentUserId ? message : m)))
              currentUserId = message.id
              break
            }
            case 'text_delta':
              setStatus('streaming')
              patchPending(assistantId, (m) => ({
                ...m,
                content: m.content + event.delta,
                parts: appendText(m.parts, event.delta),
              }))
              break
            case 'tool_started':
              setStatus('streaming')
              patchPending(assistantId, (m) => ({
                ...m,
                parts: [
                  ...m.parts,
                  {
                    type: 'tool',
                    callId: event.callId,
                    name: event.name,
                    input: event.input,
                    status: 'running',
                  },
                ],
              }))
              break
            case 'tool_completed':
              patchPending(assistantId, (m) => {
                const known = m.parts.some((p) => p.type === 'tool' && p.callId === event.callId)
                return {
                  ...m,
                  parts: known
                    ? m.parts.map((p) =>
                        p.type === 'tool' && p.callId === event.callId
                          ? { ...p, output: event.output, status: event.status }
                          : p,
                      )
                    : [
                        ...m.parts,
                        {
                          type: 'tool',
                          callId: event.callId,
                          name: event.name,
                          output: event.output,
                          status: event.status,
                        },
                      ],
                }
              })
              break
            case 'result': {
              const message = fromServer(event.message)
              setPending((prev) => prev.map((m) => (m.id === assistantId ? message : m)))
              break
            }
            case 'error':
              setError(event.error.message)
              setStatus('error')
              patchPending(assistantId, (m) => ({
                ...m,
                status: 'failed',
                error: event.error.message,
                ...(event.message ? { id: event.message.id } : {}),
              }))
              break
          }
        }
        setStatus((current) => (current === 'error' ? current : 'ready'))
      } catch (caught) {
        if (controller.signal.aborted) {
          // The server keeps whatever was produced before the stop; show it as finished.
          patchPending(assistantId, (m) => ({ ...m, status: 'completed' }))
          setStatus('ready')
        } else {
          const message = caught instanceof ApiError ? caught.message : 'The copilot is unavailable.'
          setError(message)
          setStatus('error')
          patchPending(assistantId, (m) => ({ ...m, status: 'failed', error: message }))
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        if (streamingId.current === assistantId) streamingId.current = null
        // Stored rows replace the optimistic ones; the thread title may have been derived.
        await queryClient.invalidateQueries({ queryKey: copilotKeys.conversation(projectId, conversationId) })
        await queryClient.invalidateQueries({ queryKey: copilotKeys.all(projectId), exact: true })
      }
    },
    [conversationId, patchPending, projectId, queryClient, status],
  )

  const stop = React.useCallback(() => {
    abortRef.current?.abort()
  }, [])

  // Once the stored copy of a message arrives, the optimistic one is redundant.
  React.useEffect(() => {
    if (status !== 'ready' || pending.length === 0) return
    const known = new Set(stored.map((m) => m.id))
    if (pending.every((m) => known.has(m.id))) setPending([])
  }, [pending, status, stored])

  return {
    conversation: detail.data?.conversation ?? null,
    messages,
    status,
    error,
    isLoading: detail.isPending,
    loadError: detail.error,
    send,
    stop,
  }
}
