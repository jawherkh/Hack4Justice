import type { AgencyAcceptance, DossierLifecycle, PrerequisiteStatus, Readiness, LifecycleCommandInput } from "../dossiers/store";

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

export interface CommandReference { dossierId: string; commandId: string }
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

export const COMMAND_SIGNAL = "dossierCommand";
export const STATUS_QUERY = "processingStatus";
export const WORKFLOW_TYPE = "dossierWorkflow";
export const DEFAULT_TASK_QUEUE = "dossier-lifecycle";
