import * as React from 'react'
import { Canvas } from '@hack4justice/ui/components/ai-elements/canvas'
import { Controls } from '@hack4justice/ui/components/ai-elements/controls'
import { Edge as FlowEdge } from '@hack4justice/ui/components/ai-elements/edge'
import {
  Node as FlowNode,
  NodeContent,
  NodeDescription,
  NodeHeader,
  NodeTitle,
} from '@hack4justice/ui/components/ai-elements/node'
import { Panel } from '@hack4justice/ui/components/ai-elements/panel'
import { Badge } from '@hack4justice/ui/components/badge'
import { cn } from '@hack4justice/ui/lib/utils'
import { MarkerType, useNodesState, type Edge, type Node, type NodeProps } from '@xyflow/react'
import { BotIcon, UserIcon, WrenchIcon } from 'lucide-react'
import { humanize } from '#/components/procedure/labels'
import { useI18n, type MessageKey } from '#/i18n'
import type { ChatMessage, ChatStatus, ChatToolCall } from './use-copilot-chat'

type StepKind = 'user' | 'tool' | 'assistant'
type StepStatus = 'completed' | 'running' | 'failed'

interface StepData extends Record<string, unknown> {
  kind: StepKind
  title: string
  text: string
  status: StepStatus
  toolName?: string
  /** Turn index (one per user message), used for the row layout. */
  turn: number
}

type StepNode = Node<StepData, 'step'>

const TOOL_LABEL: Record<string, MessageKey> = {
  get_project_overview: 'copilot.tool.get_project_overview',
  get_requirement_details: 'copilot.tool.get_requirement_details',
  list_project_documents: 'copilot.tool.list_project_documents',
  read_document_text: 'copilot.tool.read_document_text',
  search_legal_sources: 'copilot.tool.search_legal_sources',
  exec_command: 'copilot.tool.exec_command',
  shell: 'copilot.tool.exec_command',
  apply_patch: 'copilot.tool.apply_patch',
  view_image: 'copilot.tool.view_image',
}

const STATUS_LABEL: Record<StepStatus, MessageKey> = {
  completed: 'copilot.flow.status.completed',
  running: 'copilot.flow.status.running',
  failed: 'copilot.flow.status.failed',
}

const KIND_ICON = { user: UserIcon, tool: WrenchIcon, assistant: BotIcon } as const

/** Column spacing between steps and row spacing between turns, in canvas pixels. */
const COLUMN = 320
const ROW = 190
const MAX_TEXT = 160

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_TEXT ? `${flat.slice(0, MAX_TEXT - 1)}…` : flat
}

function toolSummary(call: ChatToolCall): string {
  const input = call.input
  if (typeof input === 'object' && input !== null) {
    const record = input as Record<string, unknown>
    const primary = record['cmd'] ?? record['query'] ?? record['requirementId'] ?? record['uploadId']
    if (typeof primary === 'string') return primary
    const keys = Object.keys(record)
    if (keys.length > 0) return JSON.stringify(record)
  }
  if (typeof input === 'string') return input
  return ''
}

/**
 * Turns the message list into one node per step: the user's message, each tool call the
 * assistant made, and its reply. Turns stack vertically; steps of a turn run left to right.
 */
function buildGraph(
  messages: ChatMessage[],
  status: ChatStatus,
  t: (key: MessageKey) => string,
): { nodes: StepNode[]; edges: Edge[] } {
  const nodes: StepNode[] = []
  const edges: Edge[] = []
  let turn = -1
  let column = 0
  let previous: string | null = null
  const streaming = status === 'submitted' || status === 'streaming'
  const lastId = messages.at(-1)?.id

  const push = (id: string, data: StepData) => {
    nodes.push({ id, type: 'step', position: { x: column * COLUMN, y: data.turn * ROW }, data })
    if (previous) {
      edges.push({
        id: `${previous}->${id}`,
        source: previous,
        target: id,
        type: data.status === 'running' ? 'animated' : 'default',
        markerEnd: { type: MarkerType.ArrowClosed },
      })
    }
    previous = id
    column += 1
  }

  for (const message of messages) {
    if (message.role === 'user') {
      turn += 1
      column = 0
      push(`m-${message.id}`, {
        kind: 'user',
        title: t('copilot.flow.you'),
        text: excerpt(message.content),
        status: 'completed',
        turn: Math.max(turn, 0),
      })
      continue
    }
    if (turn < 0) turn = 0
    const isLive = streaming && message.id === lastId
    let replyIndex = 0
    message.parts.forEach((part, index) => {
      if (part.type === 'tool') {
        const label = TOOL_LABEL[part.name]
        push(`t-${message.id}-${part.callId}`, {
          kind: 'tool',
          title: label ? t(label) : humanize(part.name),
          text: excerpt(toolSummary(part)),
          status: part.status,
          toolName: part.name,
          turn,
        })
        return
      }
      const lastPart = index === message.parts.length - 1
      push(`m-${message.id}-${replyIndex++}`, {
        kind: 'assistant',
        title: t('copilot.flow.assistant'),
        text: excerpt(part.text),
        status: isLive && lastPart ? 'running' : 'completed',
        turn,
      })
    })
    const tail = message.parts.at(-1)
    const running = tail?.type === 'tool' && tail.status === 'running'
    if (message.status === 'failed' || (isLive && !running && tail?.type !== 'text')) {
      push(`m-${message.id}-${replyIndex}`, {
        kind: 'assistant',
        title: t('copilot.flow.assistant'),
        text: excerpt(message.error ?? ''),
        status: message.status === 'failed' ? 'failed' : 'running',
        turn,
      })
    }
  }
  return { nodes, edges }
}

function StepNodeView({ data }: NodeProps<StepNode>) {
  const { t } = useI18n()
  const Icon = KIND_ICON[data.kind]
  return (
    <FlowNode
      handles={{ target: true, source: true }}
      className={cn(
        'w-72',
        data.status === 'running' && 'ring-2 ring-primary/40',
        data.status === 'failed' && 'ring-2 ring-destructive/40',
      )}
    >
      <NodeHeader className={cn(data.kind === 'user' && 'bg-primary/10', data.kind === 'tool' && 'bg-muted')}>
        <div className="flex items-center justify-between gap-2">
          <NodeTitle className="flex items-center gap-2 text-sm">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{data.title}</span>
          </NodeTitle>
          <Badge
            variant={
              data.status === 'failed' ? 'destructive' : data.status === 'running' ? 'default' : 'secondary'
            }
            className={cn(data.status === 'running' && 'animate-pulse')}
          >
            {t(STATUS_LABEL[data.status])}
          </Badge>
        </div>
        {data.toolName ? (
          <NodeDescription className="font-mono text-xs">{data.toolName}</NodeDescription>
        ) : null}
      </NodeHeader>
      {data.text ? (
        <NodeContent>
          <p className="line-clamp-4 text-xs break-words text-muted-foreground">{data.text}</p>
        </NodeContent>
      ) : null}
    </FlowNode>
  )
}

/**
 * React Flow only moves nodes it is allowed to update. Keep the computed graph in node
 * state and, when it is recomputed, preserve positions the user has already dragged.
 */
function useDraggableGraph(graph: { nodes: Node[]; edges: Edge[] }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(graph.nodes)
  React.useEffect(() => {
    setNodes((current) => {
      const dragged = new Map(current.filter((n) => n.dragging || n.measured).map((n) => [n.id, n.position]))
      return graph.nodes.map((node) => ({ ...node, position: dragged.get(node.id) ?? node.position }))
    })
  }, [graph.nodes, setNodes])
  return { nodes, edges: graph.edges, onNodesChange }
}

const nodeTypes = { step: StepNodeView }
const edgeTypes = { animated: FlowEdge.Animated, temporary: FlowEdge.Temporary }

interface ConversationFlowProps {
  messages: ChatMessage[]
  status: ChatStatus
  className?: string
}

/** React Flow view of the conversation: every message and tool call as a connected step. */
export function ConversationFlow({ messages, status, className }: ConversationFlowProps) {
  const { t } = useI18n()
  const graph = React.useMemo(() => buildGraph(messages, status, t), [messages, status, t])
  const { nodes, edges, onNodesChange } = useDraggableGraph(graph)
  return (
    <div className={cn('relative min-h-0 flex-1 overflow-hidden rounded-lg border', className)}>
      <Canvas
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable
        nodesConnectable={false}
        panOnDrag
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={false} />
        <Panel position="top-left" className="px-3 py-1.5 text-xs text-muted-foreground">
          {nodes.length === 0 ? t('copilot.flow.empty') : t('copilot.flow.legend')}
        </Panel>
      </Canvas>
    </div>
  )
}
