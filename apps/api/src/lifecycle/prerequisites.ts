import type { PrerequisiteObservation } from "./contracts";
import type { PrerequisiteStatus } from "../dossiers/store";

export function observationStatus(
  observation: Pick<PrerequisiteObservation, "status" | "effectiveAt" | "expiresAt" | "verificationState">,
  now: number,
): "unknown" | "satisfied" | "unsatisfied" {
  const trusted =
    !observation.verificationState ||
    observation.verificationState === "verified" ||
    observation.verificationState === "synthetic";
  const effective = !observation.effectiveAt || Date.parse(observation.effectiveAt) <= now;
  if (!trusted || !effective || !(Date.parse(observation.expiresAt) > now)) return "unknown";
  if (observation.status === "fulfilled") return "satisfied";
  if (observation.status === "unfulfilled") return "unsatisfied";
  return "unknown";
}

export function combinePrerequisiteStatuses(
  statuses: readonly PrerequisiteStatus[],
  fallback: PrerequisiteStatus,
): PrerequisiteStatus {
  if (statuses.includes("unknown")) return "unknown";
  if (statuses.includes("unsatisfied")) return "unsatisfied";
  return statuses.includes("satisfied") ? "satisfied" : fallback;
}
