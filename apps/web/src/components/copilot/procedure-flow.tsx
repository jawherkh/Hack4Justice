import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  REQUIREMENTS,
  RequirementStatus,
  SERVICES,
  deriveSteps,
  isSatisfied,
  type ProcedureStep,
  type RequirementStatus as RequirementStatusValue,
  type StepState,
} from '@hack4justice/shared'
import { Canvas } from '@hack4justice/ui/components/ai-elements/canvas'
import { Controls } from '@hack4justice/ui/components/ai-elements/controls'
import { Edge as FlowEdge } from '@hack4justice/ui/components/ai-elements/edge'
import {
  Node as FlowNode,
  NodeContent,
  NodeDescription,
  NodeFooter,
  NodeHeader,
  NodeTitle,
} from '@hack4justice/ui/components/ai-elements/node'
import { Panel } from '@hack4justice/ui/components/ai-elements/panel'
import { Badge } from '@hack4justice/ui/components/badge'
import { Button } from '@hack4justice/ui/components/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@hack4justice/ui/components/empty'
import { Progress } from '@hack4justice/ui/components/progress'
import { Skeleton } from '@hack4justice/ui/components/skeleton'
import { cn } from '@hack4justice/ui/lib/utils'
import {
  Handle,
  MarkerType,
  Position,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import { CheckCircle2Icon, CircleDotIcon, CircleIcon, RouteIcon } from 'lucide-react'
import {
  REQUIREMENT_TYPE_ICON,
  requirementLabel,
  serviceName,
  stepDescription,
  stepTitle,
} from '#/components/procedure/labels'
import { RequirementStatusBadge } from '#/components/procedure/status-badges'
import { toLocaleParam, useI18n, type MessageKey } from '#/i18n'
import { getProject, projectKeys, type ProjectDetail } from '#/lib/projects'

interface StepData extends Record<string, unknown> {
  step: ProcedureStep
  index: number
  state: StepState
  satisfied: number
  total: number
  hasRequirements: boolean
}

interface RequirementData extends Record<string, unknown> {
  requirementId: string
  status: RequirementStatusValue
  satisfied: boolean
  filename: string | null
}

type StepNode = Node<StepData, 'step'>
type RequirementNode = Node<RequirementData, 'requirement'>

const STEP_ICON = { done: CheckCircle2Icon, current: CircleDotIcon, upcoming: CircleIcon } as const

const STATE_LABEL: Record<StepState, MessageKey> = {
  done: 'copilot.steps.state.done',
  current: 'copilot.steps.state.current',
  upcoming: 'copilot.steps.state.upcoming',
}

/** Canvas spacing: steps stack top to bottom; requirements sit in a column to their right. */
const STEP_HEIGHT = 170
const STEP_GAP = 60
const REQUIREMENT_COLUMN = 340
const REQUIREMENT_ROW = 76

/** Which step each requirement hangs under; the other steps only aggregate. */
function requirementsByStep(serviceId: string): Partial<Record<ProcedureStep, string[]>> {
  const service = SERVICES[serviceId]
  if (!service) return {}
  return { COLLECT_REQUIREMENTS: service.requirements, AUTHENTICATION: service.authentication }
}

/**
 * The service's steps left to right, requirements attached under the step that collects
 * them. Status comes from the live project so the graph is the checklist, not a picture.
 */
function buildGraph(project: ProjectDetail): { nodes: (StepNode | RequirementNode)[]; edges: Edge[] } {
  if (!project.serviceId) return { nodes: [], edges: [] }
  const states = project.requirements.map((r) => ({ requirementId: r.requirementId, status: r.status }))
  const steps = deriveSteps(project.serviceId, states, project.submissionStatus)
  const byId = new Map(project.requirements.map((r) => [r.requirementId, r]))
  const attached = requirementsByStep(project.serviceId)
  const nodes: (StepNode | RequirementNode)[] = []
  const edges: Edge[] = []

  let y = 0
  steps.forEach((progress, index) => {
    const id = `step-${progress.step}`
    const requirementIds = attached[progress.step] ?? []
    nodes.push({
      id,
      type: 'step',
      position: { x: 0, y },
      data: {
        step: progress.step,
        index,
        state: progress.state,
        satisfied: progress.satisfied,
        total: progress.requirementIds.length,
        hasRequirements: requirementIds.length > 0,
      },
    })
    if (index > 0) {
      const previous = steps[index - 1]!
      edges.push({
        id: `step-${previous.step}->${id}`,
        source: `step-${previous.step}`,
        target: id,
        type: 'smoothstep',
        animated: progress.state === 'current',
        markerEnd: { type: MarkerType.ArrowClosed },
        style: progress.state === 'upcoming' ? { opacity: 0.4 } : undefined,
      })
    }
    requirementIds.forEach((requirementId, row) => {
      const requirement = byId.get(requirementId)
      const status = requirement?.status ?? RequirementStatus.MISSING
      const requirementNodeId = `req-${requirementId}`
      nodes.push({
        id: requirementNodeId,
        type: 'requirement',
        position: { x: REQUIREMENT_COLUMN, y: y + row * REQUIREMENT_ROW },
        data: {
          requirementId,
          status,
          satisfied: isSatisfied(status, progress.step !== 'COLLECT_REQUIREMENTS'),
          filename: requirement?.upload?.filename ?? null,
        },
      })
      edges.push({
        id: `${id}->${requirementNodeId}`,
        source: id,
        sourceHandle: 'side',
        target: requirementNodeId,
        type: 'temporary',
      })
    })
    y += Math.max(STEP_HEIGHT, requirementIds.length * REQUIREMENT_ROW) + STEP_GAP
  })
  return { nodes, edges }
}

function StepNodeView({ data }: NodeProps<StepNode>) {
  const { t } = useI18n()
  const Icon = STEP_ICON[data.state]
  const percent =
    data.total > 0 ? Math.round((data.satisfied / data.total) * 100) : data.state === 'done' ? 100 : 0
  return (
    <FlowNode
      handles={{ target: false, source: false }}
      className={cn(
        'w-72',
        data.state === 'current' && 'ring-2 ring-primary/50',
        data.state === 'upcoming' && 'opacity-70',
      )}
    >
      {data.index > 0 ? <Handle type="target" position={Position.Top} /> : null}
      <Handle type="source" position={Position.Bottom} />
      {data.hasRequirements ? <Handle id="side" type="source" position={Position.Right} /> : null}
      <NodeHeader
        className={cn(data.state === 'done' && 'bg-primary/10', data.state === 'current' && 'bg-primary/5')}
      >
        <div className="flex items-center justify-between gap-2">
          <NodeTitle className="flex items-center gap-2 text-sm">
            <Icon
              className={cn(
                'size-4 shrink-0',
                data.state === 'done' && 'text-primary',
                data.state === 'current' && 'text-primary',
                data.state === 'upcoming' && 'text-muted-foreground',
              )}
            />
            <span className="truncate">
              {data.index + 1}. {t(stepTitle(data.step))}
            </span>
          </NodeTitle>
          <Badge
            variant={data.state === 'current' ? 'default' : data.state === 'done' ? 'secondary' : 'outline'}
          >
            {t(STATE_LABEL[data.state])}
          </Badge>
        </div>
        <NodeDescription className="line-clamp-2 text-xs">{t(stepDescription(data.step))}</NodeDescription>
      </NodeHeader>
      {data.total > 0 ? (
        <NodeFooter className="flex-col items-stretch gap-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('copilot.steps.progress', { done: data.satisfied, total: data.total })}</span>
            <span>{percent}%</span>
          </div>
          <Progress value={percent} className="h-1.5" />
        </NodeFooter>
      ) : null}
    </FlowNode>
  )
}

function RequirementNodeView({ data }: NodeProps<RequirementNode>) {
  const { t } = useI18n()
  const definition = REQUIREMENTS[data.requirementId]
  const Icon = definition ? REQUIREMENT_TYPE_ICON[definition.type] : CircleIcon
  return (
    <FlowNode
      handles={{ target: true, source: false }}
      className={cn('w-64', data.satisfied ? 'border-primary/40' : 'border-destructive/40')}
    >
      <NodeContent className="flex items-center gap-2 p-2.5">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs font-medium">{t(requirementLabel(data.requirementId))}</span>
          {data.filename ? (
            <span className="truncate text-[11px] text-muted-foreground">{data.filename}</span>
          ) : null}
        </div>
        <RequirementStatusBadge status={data.status} className="shrink-0" />
      </NodeContent>
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

const nodeTypes = { step: StepNodeView, requirement: RequirementNodeView }
const edgeTypes = { temporary: FlowEdge.Temporary }

/** React Flow map of the procedure the project is preparing: steps, gates and requirements. */
export function ProcedureFlow({ projectId, className }: { projectId: string; className?: string }) {
  const { t, locale } = useI18n()
  const project = useQuery({ queryKey: projectKeys.detail(projectId), queryFn: () => getProject(projectId) })
  const graph = React.useMemo(
    () => (project.data ? buildGraph(project.data) : { nodes: [], edges: [] }),
    [project.data],
  )

  const flow = useDraggableGraph(graph)

  if (project.isPending) return <Skeleton className="min-h-0 flex-1 rounded-lg" />
  if (!project.data?.serviceId) {
    return (
      <Empty className="min-h-0 flex-1 border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <RouteIcon />
          </EmptyMedia>
          <EmptyTitle>{t('copilot.steps.notOnboardedTitle')}</EmptyTitle>
          <EmptyDescription>{t('copilot.steps.notOnboardedDescription')}</EmptyDescription>
        </EmptyHeader>
        <Button
          variant="outline"
          render={
            <Link to="/{-$locale}/projects/$id" params={{ locale: toLocaleParam(locale), id: projectId }} />
          }
        >
          {t('copilot.steps.goToOverview')}
        </Button>
      </Empty>
    )
  }

  return (
    <div className={cn('relative min-h-0 flex-1 overflow-hidden rounded-lg border', className)}>
      <Canvas
        nodes={flow.nodes}
        edges={flow.edges}
        onNodesChange={flow.onNodesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable
        nodesConnectable={false}
        panOnDrag
        fitViewOptions={{ padding: 0.1, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={false} />
        <Panel position="top-left" className="flex flex-col gap-0.5 px-3 py-1.5">
          <span className="text-xs font-medium">{t(serviceName(project.data.serviceId))}</span>
          <span className="text-xs text-muted-foreground">{t('copilot.steps.legend')}</span>
        </Panel>
      </Canvas>
    </div>
  )
}
