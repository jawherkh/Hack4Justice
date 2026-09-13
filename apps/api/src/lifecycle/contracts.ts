import type {
  AgencyAcceptance,
  DossierLifecycle,
  PrerequisiteStatus,
  Readiness,
  LifecycleCommandInput,
} from "../dossiers/store";
import type { Principal } from "../access/policy";

export interface PrerequisiteObservation {
  obligationId: string;
  version: number;
  status: "fulfilled" | "unfulfilled" | "unknown" | "disputed";
  ruleVersionId: string;
  sourceRef: string;
  expiresAt: string;
  actions: ("submission_requested" | "resubmission_requested")[];
}

export interface LifecycleContext {
  prerequisites: Record<string, PrerequisiteObservation>;
  correctionNodeIds: string[];
  correctionVersion?: number;
}

export interface LifecycleState {
  version: number;
  lifecycle: DossierLifecycle;
  agencyAcceptance: AgencyAcceptance;
  readiness: Readiness;
  prerequisiteStatus: PrerequisiteStatus;
  context: LifecycleContext;
}

export interface CommandReference {
  dossierId: string;
  commandId: string;
}
export interface PreparedCommand {
  reference: CommandReference;
  command: LifecycleCommandInput;
  state: LifecycleState;
  now: string;
}
export type Transition = { state: LifecycleState } | { error: string };
export interface CommandResult {
  commandId: string;
  dossierId: string;
  status: "queued" | "completed" | "rejected";
  version?: number;
  error?: string;
}
export interface LifecycleEvent {
  id: string;
  type: "projection_changed";
  companyId: string;
  dossierId: string;
  aggregateVersion: number;
  occurredAt: string;
  lifecycle: DossierLifecycle;
  agencyAcceptance: AgencyAcceptance;
  readiness: Readiness;
  prerequisiteStatus: PrerequisiteStatus;
  commandId?: string;
  actorId?: string;
  correlationId?: string;
  decisionId?: string;
}
export interface LifecycleActivities {
  prepare(reference: CommandReference): Promise<PreparedCommand | null>;
  commit(prepared: PreparedCommand, transition: Transition): Promise<CommandResult>;
}

/** JSON-safe input for a durable principal-agent turn. The principal is resolved by the API
 * before a workflow is started and is never accepted from model-generated tool input. */
export interface AgentTurnWorkflowInput {
  dossierId: string;
  principal: Principal;
  message: string;
  /** Assigned before workflow start so activity retries resume the same persisted session. */
  sessionId: string;
  selectedNodeId?: string;
  confirmedAction?: "submission_requested" | "resubmission_requested" | "cancellation_requested";
}

export interface AgentTurnWorkflowResult {
  sessionId: string;
  runId: string;
  outputFormat: "markdown";
  finalOutput?: string;
  lastResponseId?: string;
  interrupted: boolean;
}

export interface AgentActivities {
  runAgentTurn(input: AgentTurnWorkflowInput): Promise<AgentTurnWorkflowResult>;
}

export const COMMAND_SIGNAL = "dossierCommand";
export const STATUS_QUERY = "processingStatus";
export const WORKFLOW_TYPE = "dossierWorkflow";
export const AGENT_WORKFLOW_TYPE = "agentTurnWorkflow";
export const DEFAULT_TASK_QUEUE = "dossier-lifecycle";
