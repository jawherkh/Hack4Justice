import { Context } from "@temporalio/activity";

import type { AgentActivities, AgentTurnWorkflowInput, AgentTurnWorkflowResult } from "../lifecycle/contracts";
import { JobCancelled, type JobContext, type JobStore } from "./contracts";
import { RetryableJobError, runJob } from "./runner";

/**
 * Failures worth another attempt.
 *
 * A model that was briefly unreachable, rate limited or slow will likely answer next time.
 * A dossier that cannot be found, a procedure that is not pinned, or a request the caller
 * is not allowed to make will fail the same way however often it is tried, and retrying
 * those only spends money and time.
 */
const temporaryFailure = /timeout|timed out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|fetch failed|rate.?limit|429|50[0234]|overloaded|unavailable/i;

function isTemporary(error: unknown) {
  const status = (error as { status?: number } | undefined)?.status;
  if (typeof status === "number") return status === 408 || status === 429 || status >= 500;
  return error instanceof Error && temporaryFailure.test(error.message);
}

/**
 * Identifies one turn, so repeating it is recognised as the same turn.
 *
 * Under Temporal the workflow execution is the turn: its id stays the same across activity
 * retries and across a worker restart, and differs for the next turn. Outside a workflow
 * there is nothing to repeat, so the caller supplies its own key.
 */
function turnKey(input: AgentTurnWorkflowInput, fallback?: string) {
  try {
    const execution = Context.current().info.workflowExecution;
    if (execution) return `agent-turn:${execution.workflowId}:${execution.runId}`;
    throw new Error("no workflow execution");
  } catch {
    return fallback ?? `agent-turn:${input.sessionId}:${Date.now()}`;
  }
}

function activityContext(): JobContext {
  try {
    const current = Context.current();
    return { heartbeat: (details) => current.heartbeat(details), signal: current.cancellationSignal };
  } catch {
    return {};
  }
}

export interface DurableAgentOptions {
  /** Used when the turn does not run inside a workflow, such as in tests. */
  turnKey?: string;
}

/**
 * Wraps the agent activity so a turn is answered once, reports progress, and stops when
 * cancelled.
 *
 * The turn itself is unchanged: this records what a turn produced and hands that back when
 * the same turn is asked for again. Without it, a retry after a network blip calls the
 * model a second time, pays a second time, and appends a second set of tool effects to the
 * same conversation.
 */
export function withDurableTurns(
  activities: AgentActivities,
  store: JobStore,
  options: DurableAgentOptions = {},
): AgentActivities {
  return {
    async runAgentTurn(input: AgentTurnWorkflowInput): Promise<AgentTurnWorkflowResult> {
      const context = activityContext();
      const jobId = turnKey(input, options.turnKey);

      const receipt = await runJob(
        store,
        { jobId, dossierId: input.dossierId, kind: "agent_turn" },
        async ({ heartbeat, signal }) => {
          if (signal?.aborted) throw new JobCancelled("cancelled before the turn started");
          heartbeat({ jobId, phase: "thinking", sessionId: input.sessionId });

          let result: AgentTurnWorkflowResult;
          try {
            result = await activities.runAgentTurn(input);
          } catch (error) {
            if (signal?.aborted) throw new JobCancelled("cancelled during the turn");
            if (isTemporary(error)) {
              // The session already exists, so the next attempt continues it rather than
              // starting a fresh conversation.
              throw new RetryableJobError(
                error instanceof Error ? error.message : "agent_unavailable",
                { sessionId: input.sessionId },
              );
            }
            throw error;
          }

          heartbeat({ jobId, phase: "answered", sessionId: result.sessionId });
          return { output: { ...result } };
        },
        context,
      );

      if (receipt.status === "succeeded" && receipt.output) {
        return receipt.output as unknown as AgentTurnWorkflowResult;
      }
      if (receipt.status === "running") {
        // Another worker is answering this turn. Failing here lets the workflow's retry
        // come back and read that answer, rather than asking the model a second time.
        throw new Error("agent_turn_in_progress");
      }
      // A failure is raised so the workflow's own retry policy and history see it, rather
      // than a successful-looking result that carries an error inside it.
      throw new Error(receipt.error ?? "agent_turn_failed");
    },
  };
}
