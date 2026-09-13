import type { AgentActivities, AgentTurnWorkflowInput } from "../lifecycle/contracts";
import type { AgentRepository } from "../dossiers/store";
import { PrincipalAgentService, type PrincipalAgentServiceOptions } from "./service";

export type AgentTurnActivityOptions = Omit<PrincipalAgentServiceOptions, "repository" | "runner">;

/** Creates the Temporal activity implementation without making the workflow bundle import the
 * OpenAI SDK, Docker or database clients. */
export function createAgentActivities(
  repository: AgentRepository,
  options: AgentTurnActivityOptions = {},
): AgentActivities {
  const service = new PrincipalAgentService({ repository, ...options });
  return {
    async runAgentTurn(input: AgentTurnWorkflowInput) {
      return await service.runTurn(input);
    },
  };
}
