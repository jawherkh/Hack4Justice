import { api } from '#/lib/api'
import { ApiError, unwrap } from '#/lib/api-error'

const baseUrl = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:3001'

export type CopilotConversation = Awaited<ReturnType<typeof listConversations>>['conversations'][number]
export type CopilotConversationDetail = Awaited<ReturnType<typeof getConversation>>
export type CopilotMessage = CopilotConversationDetail['messages'][number]
export type CopilotToolCall = CopilotMessage['toolCalls'][number]
export type CopilotFiles = Awaited<ReturnType<typeof listConversationFiles>>
export type CopilotDocument = CopilotFiles['documents'][number]
export type CopilotWorkspaceFile = CopilotFiles['workspace'][number]

export const copilotKeys = {
  all: (projectId: string) => ['projects', projectId, 'copilot'] as const,
  conversation: (projectId: string, conversationId: string) =>
    ['projects', projectId, 'copilot', conversationId] as const,
  files: (projectId: string, conversationId: string) =>
    ['projects', projectId, 'copilot', conversationId, 'files'] as const,
}

export async function listConversations(projectId: string) {
  return unwrap(await api.api.v1.projects({ id: projectId }).copilot.get(), 'Could not load conversations')
}

export async function createConversation(projectId: string, title?: string) {
  return unwrap(
    await api.api.v1.projects({ id: projectId }).copilot.post(title ? { title } : {}),
    'Could not start a conversation',
  )
}

export async function getConversation(projectId: string, conversationId: string) {
  return unwrap(
    await api.api.v1.projects({ id: projectId }).copilot({ conversationId }).get(),
    'Could not load the conversation',
  )
}

export async function renameConversation(projectId: string, conversationId: string, title: string) {
  return unwrap(
    await api.api.v1.projects({ id: projectId }).copilot({ conversationId }).patch({ title }),
    'Could not rename the conversation',
  )
}

export async function deleteConversation(projectId: string, conversationId: string) {
  unwrap(
    await api.api.v1.projects({ id: projectId }).copilot({ conversationId }).delete(),
    'Could not delete the conversation',
  )
}

/** Project documents and the files the copilot wrote in this conversation's workspace. */
export async function listConversationFiles(projectId: string, conversationId: string) {
  return unwrap(
    await api.api.v1.projects({ id: projectId }).copilot({ conversationId }).files.get(),
    'Could not load files',
  )
}

/** Downloads one workspace file; the caller decides how to show it from the content type. */
export async function fetchWorkspaceFile(
  projectId: string,
  conversationId: string,
  path: string,
): Promise<{ blob: Blob; contentType: string }> {
  const url = new URL(`${baseUrl}/api/v1/projects/${projectId}/copilot/${conversationId}/files/content`)
  url.searchParams.set('path', path)
  const response = await fetch(url, { credentials: 'include' })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { status: number; code: string; message: string }
    } | null
    throw new ApiError(
      body?.error?.status ?? response.status,
      body?.error?.code ?? 'unknown_error',
      body?.error?.message ?? `Request failed (${response.status})`,
    )
  }
  return { blob: await response.blob(), contentType: response.headers.get('content-type') ?? '' }
}

/**
 * A file the copilot pointed at in its reply. The model links uploaded documents by their
 * staged sandbox path (the private OCR Markdown, which the app resolves to the original upload)
 * and its own drafts by their workspace path (see the API instructions).
 */
export type CopilotFileRef = { kind: 'document'; uploadId: string } | { kind: 'workspace'; path: string }

const DOCUMENT_LINK = /^(?:\/work\/|\/)?input\/documents\/([0-9a-f-]{36})(?:\.(?:md|txt))?$/i
/**
 * Any other relative path inside the workspace: no scheme, and no leading slash except the
 * `/work/` mount or a bare `/output/` (what the sanitizer turns `./output/` into).
 */
const WORKSPACE_LINK = /^(?:\/work\/|\.\/|\/(?=output\/))?(?!input\/)([^\s:?#][^\s:?#]*)$/

/** Matches the target (and optional title) of a Markdown link to a bare workspace path. */
const BARE_WORKSPACE_LINK = /\]\((?:\.\/)?((?:input|output)\/[^\s)]*)(\s[^)]*)?\)/g

/**
 * The chat renderer (Streamdown) sanitizes link targets and drops any it cannot parse as a
 * URL, which includes bare relative paths such as `output/draft.md`: they show up as
 * "[blocked]". Anchoring them at the sandbox mount turns them into path-relative links the
 * sanitizer passes through unchanged, and `parseFileRef` accepts `/work/...`.
 */
export function anchorWorkspaceLinks(markdown: string): string {
  return markdown.replace(BARE_WORKSPACE_LINK, '](/work/$1$2)')
}

/** Parses a Markdown link target into a file reference, or null for ordinary links. */
export function parseFileRef(href: string | undefined): CopilotFileRef | null {
  if (!href) return null
  let target: string
  try {
    target = decodeURIComponent(href.trim())
  } catch {
    target = href.trim()
  }
  const document = DOCUMENT_LINK.exec(target)
  if (document?.[1]) return { kind: 'document', uploadId: document[1].toLowerCase() }
  const workspace = WORKSPACE_LINK.exec(target)
  if (workspace?.[1] && !workspace[1].startsWith('/') && !workspace[1].includes('..')) {
    return { kind: 'workspace', path: workspace[1] }
  }
  return null
}

export function fileRefKey(ref: CopilotFileRef): string {
  return ref.kind === 'document' ? `document:${ref.uploadId}` : `workspace:${ref.path}`
}

/** Server-sent events emitted while the copilot answers one message. */
export type CopilotStreamEvent =
  | { type: 'user_message'; message: CopilotMessage; conversation: { id: string; title: string } }
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_started'; callId: string; name: string; input: unknown }
  | { type: 'tool_completed'; callId: string; name: string; output: unknown; status: 'completed' | 'failed' }
  | { type: 'result'; message: CopilotMessage; aborted: boolean; runId: string }
  | { type: 'error'; error: { code: string; message: string }; message: CopilotMessage | null }

/**
 * Sends a message and yields the reply as it streams. Uses `fetch` directly because
 * Eden buffers responses; the cookie session travels with `credentials: 'include'`.
 */
export async function* streamMessage(
  projectId: string,
  conversationId: string,
  message: string,
  signal?: AbortSignal,
): AsyncGenerator<CopilotStreamEvent> {
  const response = await fetch(`${baseUrl}/api/v1/projects/${projectId}/copilot/${conversationId}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ message }),
    signal,
  })
  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => null)) as {
      error?: { status: number; code: string; message: string }
    } | null
    throw new ApiError(
      body?.error?.status ?? response.status,
      body?.error?.code ?? 'unknown_error',
      body?.error?.message ?? `Request failed (${response.status})`,
    )
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const event = parseFrame(frame)
        if (event) yield event
        boundary = buffer.indexOf('\n\n')
      }
    }
    const last = parseFrame(buffer)
    if (last) yield last
  } finally {
    reader.releaseLock()
  }
}

function parseFrame(frame: string): CopilotStreamEvent | null {
  const data = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
  if (!data) return null
  try {
    return JSON.parse(data) as CopilotStreamEvent
  } catch {
    return null
  }
}
