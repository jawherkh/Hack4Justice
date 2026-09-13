import { JobCancelled, type JobContext, type JobReceipt, type JobStore } from "./contracts";
import { RetryableJobError, runJob } from "./runner";

/**
 * What the agent is told about the dossier for one turn.
 *
 * References only. The turn is assembled from stored state by the caller, so a workflow
 * history carries identifiers rather than document contents or conversation text.
 */
export interface TurnContext {
  companyId: string;
  procedureVersionId: string;
  /** The node the user currently has open, when there is one. */
  selectedNodeId?: string;
  dependencyIds?: string[];
  findingIds?: string[];
  /** What the server currently permits. The agent may propose only from this set. */
  allowedActions: string[];
}

export interface AgentTurnInput {
  jobId: string;
  dossierId: string;
  /** Identifies the conversation, so a resumed turn continues it rather than starting over. */
  conversationId: string;
  /** The user's message for this turn, or absent when the agent is continuing its own work. */
  message?: string;
  context: TurnContext;
}

/** A single thing the agent proposes. Nothing here takes effect on its own. */
export interface ProposedAction {
  action: string;
  nodeId?: string;
  /** Why, with the source it rests on. An explanation without a source is not usable. */
  reason: string;
  sourceRefs: string[];
}

export interface AgentTurnResult {
  /** Passed back on the next turn so the conversation continues after a restart. */
  conversationRef: string;
  /** What the user is shown. */
  reply: string;
  proposals?: ProposedAction[];
  /** Set when the agent needs a fact it must not guess. */
  question?: string;
}

/**
 * Runs one agent turn. Supplied by the agent implementation.
 *
 * `onActivity` carries user-facing progress while the turn is in flight, and `signal` is
 * how a cancelled turn stops rather than running on unnoticed.
 */
export interface AgentRunner {
  runTurn(input: {
    conversationRef?: string;
    dossierId: string;
    message?: string;
    context: TurnContext;
    onActivity?: (activity: { type: string; text?: string }) => void;
    signal?: AbortSignal;
  }): Promise<AgentTurnResult>;
}

/** Raised when the agent cannot be reached. The turn is worth attempting again. */
export class AgentUnavailable extends Error {
  /**
   * The conversation the failed turn had already opened, when there was one, so the next
   * attempt continues it instead of paying for a fresh one.
   */
  constructor(message: string, readonly conversationRef?: string) {
    super(message);
  }
}

/**
 * Runs one agent turn as a durable job.
 *
 * The conversation reference is kept on the receipt, so a turn retried after a worker
 * restart continues the same conversation instead of beginning a new one. A completed
 * turn returns its stored result rather than running again, because running it again would
 * charge for a second turn and could take a second set of actions.
 *
 * What the agent returns is a proposal, never a decision. Proposals are filtered to the
 * actions the server already permits, so a turn cannot widen its own authority by naming
 * an action it was not offered, whatever a document it read may have instructed.
 */
export async function runAgentTurn(
  store: JobStore,
  agent: AgentRunner,
  input: AgentTurnInput,
  context: JobContext = {},
): Promise<{ receipt: JobReceipt; result?: AgentTurnResult }> {
  let result: AgentTurnResult | undefined;

  const previous = await store.findReceipt(input.jobId);
  const conversationRef = (previous?.output?.conversationRef as string | undefined) ?? undefined;

  const receipt = await runJob(
    store,
    { jobId: input.jobId, dossierId: input.dossierId, kind: "agent_turn" },
    async ({ heartbeat, signal }) => {
      if (signal?.aborted) throw new JobCancelled("cancelled before the turn started");
      heartbeat({ jobId: input.jobId, phase: "thinking", dossierId: input.dossierId });

      let turn: AgentTurnResult;
      try {
        turn = await agent.runTurn({
          conversationRef,
          dossierId: input.dossierId,
          message: input.message,
          context: input.context,
          onActivity: (activity) => heartbeat({ jobId: input.jobId, phase: "activity", ...activity }),
          signal,
        });
      } catch (error) {
        if (error instanceof AgentUnavailable) {
          throw new RetryableJobError(error.message, error.conversationRef ? { conversationRef: error.conversationRef } : undefined);
        }
        throw error;
      }

      const permitted = new Set(input.context.allowedActions);
      const proposals = (turn.proposals ?? []).filter((proposal) => permitted.has(proposal.action));
      const refused = (turn.proposals ?? []).length - proposals.length;

      result = { ...turn, proposals };
      return {
        output: {
          conversationRef: turn.conversationRef,
          proposals,
          // Recorded so an agent repeatedly reaching past its permissions is visible.
          refusedProposals: refused,
          // The reply and question are stored because a repeated call returns the receipt
          // without running the turn again, and the user still has to be shown an answer.
          reply: turn.reply,
          question: turn.question,
        },
      };
    },
    context,
  );

  return { receipt, result: result ?? storedTurn(receipt) };
}

/** Rebuilds a turn's answer from its receipt, for a call that did not run the turn again. */
function storedTurn(receipt: JobReceipt): AgentTurnResult | undefined {
  if (receipt.status !== "succeeded") return undefined;
  const output = receipt.output;
  if (!output || typeof output.conversationRef !== "string" || typeof output.reply !== "string") return undefined;
  return {
    conversationRef: output.conversationRef,
    reply: output.reply,
    proposals: (output.proposals as ProposedAction[] | undefined) ?? [],
    question: typeof output.question === "string" ? output.question : undefined,
  };
}

export interface LegalContextInput {
  jobId: string;
  dossierId: string;
  agency: string;
  procedureVersionId: string;
  /** What the turn needs sources for. */
  question: string;
}

export interface LegalSource {
  ruleVersionId: string;
  sourceRef: string;
  passage: string;
}

/** Supplies reviewed legal sources. Implemented by the knowledge service. */
export interface LegalKnowledge {
  retrieve(input: { agency: string; procedureVersionId: string; question: string; signal?: AbortSignal }): Promise<LegalSource[]>;
}

/**
 * Retrieves legal sources as a durable job.
 *
 * The passages are handed to the caller and only their references are recorded, so the
 * workflow history stays a list of what was consulted rather than a copy of the corpus.
 */
export async function retrieveLegalContext(
  store: JobStore,
  knowledge: LegalKnowledge,
  input: LegalContextInput,
  context: JobContext = {},
): Promise<{ receipt: JobReceipt; sources?: LegalSource[] }> {
  let sources: LegalSource[] | undefined;

  const receipt = await runJob(
    store,
    { jobId: input.jobId, dossierId: input.dossierId, kind: "legal_retrieval" },
    async ({ heartbeat, signal }) => {
      heartbeat({ jobId: input.jobId, phase: "retrieving", agency: input.agency });
      if (signal?.aborted) throw new JobCancelled("cancelled before retrieval");

      let found: LegalSource[];
      try {
        found = await knowledge.retrieve({
          agency: input.agency,
          procedureVersionId: input.procedureVersionId,
          question: input.question,
          signal,
        });
      } catch (error) {
        // The knowledge service being unreachable is temporary; a question it cannot answer
        // is not, and comes back as an empty result rather than a failure.
        throw new RetryableJobError(error instanceof Error ? error.message : "knowledge_unavailable");
      }

      sources = found;
      return {
        // Stored whole: a repeated call returns the receipt without retrieving again, and
        // the turn that asked still needs the passages it was going to cite.
        output: { sources: found, count: found.length },
      };
    },
    context,
  );

  return { receipt, sources: sources ?? storedSources(receipt) };
}

/** Rebuilds retrieved sources from a receipt, for a call that did not retrieve again. */
function storedSources(receipt: JobReceipt): LegalSource[] | undefined {
  if (receipt.status !== "succeeded") return undefined;
  const stored = receipt.output?.sources;
  return Array.isArray(stored) ? stored as LegalSource[] : undefined;
}
