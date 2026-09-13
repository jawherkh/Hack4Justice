import {
  REQUIREMENTS,
  SERVICES,
  type ProcedureStatus,
  type RequirementStatus,
  type ServiceDef,
} from "@hack4justice/shared";
import type { SubmissionSnapshot } from "@hack4justice/db";

/** A file attached to a requirement, as it stands when the package is assembled. */
export interface PackageDocument {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

export interface PackageItem {
  requirementId: string;
  type: string;
  required: boolean;
  status: RequirementStatus;
  /**
   * Where this requirement comes from in the published procedure catalogue: which body
   * issues it, and whether an official source states it at all. A reviewer reads this to
   * check the requirement against the rule rather than trusting the checklist.
   */
  source: {
    entity: string | null;
    service: string | null;
    status: string;
    requiredWhen: string | null;
    notes: string | null;
  };
  document: PackageDocument | null;
  /** What the user confirmed for a data requirement. */
  values: Record<string, string> | null;
  note: string | null;
}

/**
 * Everything a reviewer needs to judge one procedure, in one object: the files, the
 * confirmed values, what is still missing, and the catalogue entry each requirement comes
 * from. Assembling it is a read: it never changes the project.
 */
export interface ProcedurePackage {
  project: { id: string; name: string; destination: string; serviceId: string };
  service: Pick<
    ServiceDef,
    "id" | "destination" | "submissionMode" | "channels" | "checks" | "outputs" | "authentication" | "rejectionEffects"
  >;
  /** Derived elsewhere and carried here, so the package and the project never disagree. */
  status: ProcedureStatus;
  assembledAt: string;
  items: PackageItem[];
  /** Required requirements that are not satisfied. Empty means nothing blocks submission. */
  missing: string[];
  submissions: { reference: string; status: string; receipt: string | null; submittedAt: string }[];
}

export interface PackageRequirement {
  requirementId: string;
  status: RequirementStatus;
  value: Record<string, string> | null;
  note: string | null;
  document: PackageDocument | null;
}

export interface PackageInput {
  project: { id: string; name: string; destination: string; serviceId: string };
  status: ProcedureStatus;
  requirements: PackageRequirement[];
  submissions: { reference: string; status: string; receipt: string | null; submittedAt: Date | string }[];
  assembledAt?: Date;
}

/** Statuses that leave a required item unsatisfied, so a reviewer sees it as outstanding. */
const unsatisfied = new Set<RequirementStatus>(["MISSING", "INVALID", "PROVIDED"]);

export function assemblePackage(input: PackageInput): ProcedurePackage {
  const service = SERVICES[input.project.serviceId];
  if (!service) throw new Error(`unknown service ${input.project.serviceId}`);

  const order = Object.keys(REQUIREMENTS);
  const items = input.requirements
    .map((requirement): PackageItem => {
      const definition = REQUIREMENTS[requirement.requirementId];
      return {
        requirementId: requirement.requirementId,
        type: definition?.type ?? "unknown",
        required: definition?.required ?? false,
        status: requirement.status,
        source: {
          entity: definition?.providedBy?.entity ?? null,
          service: definition?.providedBy?.service ?? null,
          // An item the published source does not state is flagged rather than presented
          // as settled, so a reviewer knows the checklist is ahead of the rule.
          status: definition?.sourceStatus ?? "NOT_SPECIFIED_IN_SOURCE",
          requiredWhen: definition?.requiredWhen ?? null,
          notes: definition?.notes ?? null,
        },
        document: requirement.document,
        values: requirement.value,
        note: requirement.note,
      };
    })
    .sort((a, b) => order.indexOf(a.requirementId) - order.indexOf(b.requirementId));

  return {
    project: input.project,
    service: {
      id: service.id,
      destination: service.destination,
      submissionMode: service.submissionMode,
      channels: service.channels,
      checks: service.checks,
      outputs: service.outputs,
      authentication: service.authentication,
      rejectionEffects: service.rejectionEffects,
    },
    status: input.status,
    assembledAt: (input.assembledAt ?? new Date()).toISOString(),
    items,
    missing: items.filter((item) => item.required && unsatisfied.has(item.status)).map((item) => item.requirementId),
    submissions: input.submissions.map((entry) => ({
      reference: entry.reference,
      status: entry.status,
      receipt: entry.receipt,
      submittedAt: typeof entry.submittedAt === "string" ? entry.submittedAt : entry.submittedAt.toISOString(),
    })),
  };
}

export interface ChangedItem {
  requirementId: string;
  previousStatus: string | null;
  status: string | null;
  /** A different file, or one attached or removed since the previous submission. */
  documentChanged: boolean;
  previousDocument: string | null;
  document: string | null;
}

/**
 * What differs between one submission and the one before it.
 *
 * After a refusal the user fixes part of the file and submits again. An officer needs to
 * see what actually changed rather than re-reading the whole package, and the user needs a
 * record that the correction was made.
 */
export function changedSince(previous: SubmissionSnapshot, current: SubmissionSnapshot): ChangedItem[] {
  const before = new Map(previous.requirements.map((requirement) => [requirement.requirementId, requirement]));
  const after = new Map(current.requirements.map((requirement) => [requirement.requirementId, requirement]));
  const changes: ChangedItem[] = [];

  for (const requirementId of new Set([...before.keys(), ...after.keys()])) {
    const was = before.get(requirementId);
    const now = after.get(requirementId);
    const previousDocument = was?.upload?.id ?? null;
    const document = now?.upload?.id ?? null;
    const documentChanged = previousDocument !== document;
    const statusChanged = (was?.status ?? null) !== (now?.status ?? null);
    // A value the user corrected counts, even when the status and the file are unchanged.
    const valueChanged = JSON.stringify(was?.value ?? null) !== JSON.stringify(now?.value ?? null);
    if (!documentChanged && !statusChanged && !valueChanged) continue;
    changes.push({
      requirementId,
      previousStatus: was?.status ?? null,
      status: now?.status ?? null,
      documentChanged,
      previousDocument,
      document,
    });
  }

  const order = Object.keys(REQUIREMENTS);
  return changes.sort((a, b) => order.indexOf(a.requirementId) - order.indexOf(b.requirementId));
}
