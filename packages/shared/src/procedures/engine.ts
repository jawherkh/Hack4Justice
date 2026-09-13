import {
  PROCEDURE_STEPS,
  ProcedureStatus,
  REQUIREMENTS,
  RequirementStatus,
  SERVICES,
  type ProcedureStep,
  type SubmissionStatus,
} from "./catalog";

export interface RequirementState {
  requirementId: string;
  status: RequirementStatus;
}

/** A requirement counts as satisfied for a transition when it is valid, waived or not applicable. */
export function isSatisfied(status: RequirementStatus, needValid: boolean): boolean {
  if (status === RequirementStatus.WAIVED || status === RequirementStatus.NOT_APPLICABLE) return true;
  if (status === RequirementStatus.VALID) return true;
  return !needValid && status === RequirementStatus.PROVIDED;
}

export type StepState = "done" | "current" | "upcoming";

export interface StepProgress {
  step: ProcedureStep;
  state: StepState;
  /** Requirement ids gating this step (empty for review / accepted). */
  requirementIds: string[];
  satisfied: number;
}

/**
 * Derives the whole-procedure status from the requirement states and the
 * submission status the user recorded. Preparation is computed; submission is declared.
 */
export function deriveProcedureStatus(
  serviceId: string | null,
  requirements: RequirementState[],
  submission: SubmissionStatus | null,
): ProcedureStatus {
  if (!serviceId || !SERVICES[serviceId]) return ProcedureStatus.NOT_STARTED;
  if (submission) return ProcedureStatus[submission];
  const total = requirements.length;
  if (total === 0) return ProcedureStatus.NOT_STARTED;
  const byId = new Map(requirements.map((r) => [r.requirementId, r.status]));
  const service = SERVICES[serviceId];
  const allValid = [...service.requirements, ...service.authentication].every((id) =>
    isSatisfied(byId.get(id) ?? RequirementStatus.MISSING, true),
  );
  if (allValid) return ProcedureStatus.READY_FOR_SUBMISSION;
  const touched = requirements.some(
    (r) => r.status !== RequirementStatus.MISSING && r.status !== RequirementStatus.NOT_APPLICABLE,
  );
  return touched ? ProcedureStatus.IN_PROGRESS : ProcedureStatus.NOT_STARTED;
}

/** Vertical timeline: which step the procedure is on, and what each step is waiting for. */
export function deriveSteps(
  serviceId: string | null,
  requirements: RequirementState[],
  submission: SubmissionStatus | null,
): StepProgress[] {
  const service = serviceId ? SERVICES[serviceId] : undefined;
  if (!service) return [];
  const byId = new Map(requirements.map((r) => [r.requirementId, r.status]));
  const status = (id: string) => byId.get(id) ?? RequirementStatus.MISSING;
  const count = (ids: string[], needValid: boolean) =>
    ids.filter((id) => isSatisfied(status(id), needValid)).length;

  const collectDone = count(service.requirements, false) === service.requirements.length;
  const prevalidDone = count(service.requirements, true) === service.requirements.length;
  const authDone = count(service.authentication, true) === service.authentication.length;
  const ready = prevalidDone && authDone;

  const doneUntil: Record<ProcedureStep, boolean> = {
    COLLECT_REQUIREMENTS: collectDone,
    PREVALIDATION: collectDone && prevalidDone,
    AUTHENTICATION: collectDone && prevalidDone && authDone,
    READY_FOR_SUBMISSION: ready,
    OFFICIAL_SUBMISSION: submission !== null,
    UNDER_REVIEW: submission === "ACCEPTED" || submission === "REJECTED",
    ACCEPTED: submission === "ACCEPTED",
  };
  const gating: Record<ProcedureStep, { ids: string[]; needValid: boolean }> = {
    COLLECT_REQUIREMENTS: { ids: service.requirements, needValid: false },
    PREVALIDATION: { ids: service.requirements, needValid: true },
    AUTHENTICATION: { ids: service.authentication, needValid: true },
    READY_FOR_SUBMISSION: { ids: [...service.requirements, ...service.authentication], needValid: true },
    OFFICIAL_SUBMISSION: { ids: [], needValid: true },
    UNDER_REVIEW: { ids: [], needValid: true },
    ACCEPTED: { ids: [], needValid: true },
  };

  let currentFound = false;
  return PROCEDURE_STEPS.map((step) => {
    const done = doneUntil[step];
    let state: StepState = "upcoming";
    if (done) state = "done";
    else if (!currentFound) {
      state = "current";
      currentFound = true;
    }
    const { ids, needValid } = gating[step];
    return { step, state, requirementIds: ids, satisfied: count(ids, needValid) };
  });
}

/** Requirement ids the onboarding may let the user waive: optional or conditional ones. */
export function waivableRequirementIds(serviceId: string): string[] {
  const service = SERVICES[serviceId];
  if (!service) return [];
  return [...service.requirements, ...service.authentication].filter(
    (id) => REQUIREMENTS[id]?.required === false,
  );
}
