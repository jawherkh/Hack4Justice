import type { PreparedCommand, Transition } from "./contracts";
import { combinePrerequisiteStatuses, observationStatus } from "./prerequisites";
import { gateError } from "../requirements/evaluator";

function aggregatePrerequisiteStatus(
  observations: PreparedCommand["state"]["context"]["prerequisites"],
  now: string,
) {
  const statuses = Object.values(observations).map((observation) =>
    observationStatus(observation, Date.parse(now)),
  );
  return combinePrerequisiteStatuses(statuses, "not_applicable");
}

// Pure transition logic is shared with replay tests. No I/O belongs here.
export function transition({ command, state, now, gate, validationError }: PreparedCommand): Transition {
  if (command.expectedVersion !== state.version) return { error: "version_conflict" };
  if (state.lifecycle === "closed" || state.lifecycle === "cancelled") return { error: "dossier_closed" };
  if (validationError) return { error: validationError };
  const next = {
    ...state,
    version: state.version + 1,
    context: {
      ...state.context,
      prerequisites: { ...state.context.prerequisites },
      correctionNodeIds: [...state.context.correctionNodeIds],
    },
  };
  switch (command.type) {
    case "evidence_changed":
      if (state.lifecycle === "draft") next.lifecycle = "active";
      next.readiness = "needs_review";
      break;
    case "review_requested":
      next.readiness = "needs_review";
      if (state.lifecycle === "draft") next.lifecycle = "active";
      break;
    case "submission_requested":
    case "resubmission_requested": {
      const required = command.type === "submission_requested" ? "not_submitted" : "modification_requested";
      if (state.agencyAcceptance !== required) return { error: "invalid_transition" };
      if (!command.confirmed) return { error: "explicit_confirmation_required" };
      const error = gate && gateError(gate);
      if (error) return { error };
      // Older workflow histories have no evaluated gate and retain their original observation checks.
      for (const observation of gate ? [] : Object.values(state.context.prerequisites)) {
        if (!observation.actions.includes(command.type)) continue;
        const status = observationStatus(observation, Date.parse(now));
        if (status !== "satisfied") {
          return {
            error: status === "unsatisfied" ? "prerequisite_blocked" : "prerequisite_needs_review",
          };
        }
      }
      next.prerequisiteStatus = aggregatePrerequisiteStatus(state.context.prerequisites, now);
      next.lifecycle = "awaiting_review";
      next.agencyAcceptance = "pending";
      next.context.correctionNodeIds = [];
      break;
    }
    case "decision_recorded": {
      if (state.agencyAcceptance !== "pending" || !command.decision) return { error: "invalid_transition" };
      const decision = command.decision;
      if (!decision.reason.trim()) return { error: "decision_reason_required" };
      if (decision.action === "request_modification") {
        if (!decision.targetNodeIds.length) return { error: "correction_targets_required" };
        next.lifecycle = "correction_requested";
        next.agencyAcceptance = "modification_requested";
        next.context.correctionNodeIds = decision.targetNodeIds;
        next.context.correctionVersion = next.version;
      } else {
        next.lifecycle = "closed";
        next.agencyAcceptance = decision.action === "accept" ? "accepted" : "refused";
      }
      break;
    }
    case "prerequisite_changed": {
      const observation = command.prerequisite;
      if (!observation) return { error: "prerequisite_observation_required" };
      const previous = state.context.prerequisites[observation.obligationId];
      if (previous && previous.version >= observation.version) return { error: "stale_observation" };
      next.context.prerequisites[observation.obligationId] = observation;
      next.prerequisiteStatus = aggregatePrerequisiteStatus(next.context.prerequisites, now);
      break;
    }
    case "cancellation_requested":
      next.lifecycle = "cancelled";
      break;
  }
  return { state: next };
}
