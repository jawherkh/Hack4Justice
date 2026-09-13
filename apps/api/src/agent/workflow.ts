import { proxyActivities } from "@temporalio/workflow";

import type { AgentActivities, AgentTurnWorkflowInput, AgentTurnWorkflowResult } from "../lifecycle/contracts";

const activities = proxyActivities<AgentActivities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "2 seconds",
    maximumInterval: "30 seconds",
    maximumAttempts: 3,
  },
});

/**
 * Durable agent execution boundary. Conversation history, progress events, sandbox workspace
 * and artifacts are persisted by the activity's repository, so a retry resumes from sessionId
 * rather than creating an unrelated conversation.
 */
export async function agentTurnWorkflow(input: AgentTurnWorkflowInput): Promise<AgentTurnWorkflowResult> {
  return await activities.runAgentTurn(input);
}
