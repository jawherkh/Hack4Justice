"""Regenerate src/procedures/catalog.ts from the source JSON files.

Run from packages/shared:  python3 scripts/generate-procedures.py
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "procedures" / "source"
OUT = ROOT / "src" / "procedures" / "catalog.ts"
DEST = {"RNE", "DGI"}
STEPS = ["COLLECT_REQUIREMENTS", "PREVALIDATION", "AUTHENTICATION", "READY_FOR_SUBMISSION", "OFFICIAL_SUBMISSION", "UNDER_REVIEW", "ACCEPTED"]

eng = json.load(open(SRC / "entity_requirements_state_engine.json"))
trees = json.load(open(SRC / "entity_decision_trees.json"))
tree_by_service = {s["service_id"]: s for e in trees["entities"] for s in e["services"]}
services = [s for s in eng["entities_and_services"] if s["entity_id"] in DEST]
used = set()
for s in services:
    used.update(s["requirements"]["document_and_data_requirements"])
    used.update(s["requirements"]["authentication_requirements"])
reqs = [r for r in eng["requirement_catalog"] if r["requirement_id"] in used]
ts = lambda v: json.dumps(v, ensure_ascii=False)

out = ['''// GENERATED from packages/shared/src/procedures/source/*.json by scripts/generate-procedures.py.
// Only RNE and DGI services are included: those are the project destinations.
// Do not edit by hand; edit the source JSON and regenerate.

import type { ProjectDestination } from "../constants/project";

export const RequirementType = {
  DATA: "data",
  DOCUMENT: "document",
  AUTHENTICATION: "authentication",
  ACTION: "action",
} as const;
export type RequirementType = (typeof RequirementType)[keyof typeof RequirementType];

/** Per-requirement status inside a project (chatbot_contract.requirement_statuses). */
export const RequirementStatus = {
  MISSING: "MISSING",
  PROVIDED: "PROVIDED",
  VALID: "VALID",
  INVALID: "INVALID",
  WAIVED: "WAIVED",
  NOT_APPLICABLE: "NOT_APPLICABLE",
} as const;
export type RequirementStatus = (typeof RequirementStatus)[keyof typeof RequirementStatus];
export const REQUIREMENT_STATUSES = Object.values(RequirementStatus) as [RequirementStatus, ...RequirementStatus[]];

/** Whole-procedure status (chatbot_contract.state_statuses). */
export const ProcedureStatus = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  READY_FOR_SUBMISSION: "READY_FOR_SUBMISSION",
  SUBMITTED: "SUBMITTED",
  UNDER_REVIEW: "UNDER_REVIEW",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  BLOCKED: "BLOCKED",
  COMPLETED: "COMPLETED",
} as const;
export type ProcedureStatus = (typeof ProcedureStatus)[keyof typeof ProcedureStatus];
export const PROCEDURE_STATUSES = Object.values(ProcedureStatus) as [ProcedureStatus, ...ProcedureStatus[]];

/**
 * Statuses the user records themselves after using the official channel.
 * The app prepares and pre-validates; it never performs the official submission
 * (global rule PREPARE_NOT_SUBMIT), so these are declarative.
 */
export const SubmissionStatus = {
  SUBMITTED: "SUBMITTED",
  UNDER_REVIEW: "UNDER_REVIEW",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
} as const;
export type SubmissionStatus = (typeof SubmissionStatus)[keyof typeof SubmissionStatus];
export const SUBMISSION_STATUSES = Object.values(SubmissionStatus) as [SubmissionStatus, ...SubmissionStatus[]];

/** Ordered state machine steps shared by every RNE / DGI service. */
export const PROCEDURE_STEPS = ''' + ts(STEPS) + ''' as const;
export type ProcedureStep = (typeof PROCEDURE_STEPS)[number];

export interface RequirementDef {
  id: string;
  type: RequirementType;
  /** False means optional / conditional: the user may waive it during onboarding. */
  required: boolean;
  requiredWhen?: string;
  providedBy?: { entity: string; service: string };
  sourceStatus: "SUPPORTED_BY_SOURCE" | "NOT_SPECIFIED_IN_SOURCE";
  notes?: string;
}

export interface ServiceDef {
  id: string;
  destination: ProjectDestination;
  /** Document, data and action requirements, in catalog order. */
  requirements: string[];
  /** Authentication requirements, collected at the AUTHENTICATION step. */
  authentication: string[];
  /** Identity / signature mechanisms the channel accepts (decision trees). */
  authenticationMethods: string[];
  submissionMode: string;
  /** Official channels from the decision trees. */
  channels: string[];
  /** Decision-tree question nodes the user should answer before moving on (self-checks). */
  checks: string[];
  outputs: string[];
  rejectionEffects: string[];
  notes: string[];
}
''']
out.append("export const REQUIREMENTS: Record<string, RequirementDef> = {")
for r in reqs:
    d = {"id": r["requirement_id"], "type": r["type"], "required": r["required"]}
    if r.get("required_when"): d["requiredWhen"] = r["required_when"]
    if r.get("provided_by"): d["providedBy"] = r["provided_by"]
    d["sourceStatus"] = r["source_status"]
    if r.get("notes"): d["notes"] = r["notes"]
    out.append(f'  {ts(r["requirement_id"])}: {ts(d)},')
out.append("};\n")
out.append("export const SERVICES: Record<string, ServiceDef> = {")
for s in services:
    t = tree_by_service.get(s["service_id"], {})
    tree = t.get("decision_tree", {})
    d = {
        "id": s["service_id"], "destination": s["entity_id"],
        "requirements": s["requirements"]["document_and_data_requirements"],
        "authentication": s["requirements"]["authentication_requirements"],
        "authenticationMethods": t.get("authentication", []),
        "submissionMode": s["states"]["READY_FOR_SUBMISSION"].get("submission_mode", ""),
        "channels": t.get("submission", []),
        "checks": [k for k, v in tree.items() if "question" in v],
        "outputs": s["states"]["ACCEPTED"].get("outputs", []),
        "rejectionEffects": s["states"]["REJECTED"].get("effects", []),
        "notes": s.get("notes", []),
    }
    out.append(f'  {ts(s["service_id"])}: {ts(d)},')
out.append("};\n")
out.append('''export const SERVICE_IDS = Object.keys(SERVICES) as [string, ...string[]];
export const REQUIREMENT_IDS = Object.keys(REQUIREMENTS) as [string, ...string[]];

export function isServiceId(value: unknown): value is string {
  return typeof value === "string" && value in SERVICES;
}

export function servicesForDestination(destination: ProjectDestination): ServiceDef[] {
  return Object.values(SERVICES).filter((service) => service.destination === destination);
}

/** All requirement ids a service needs, documents/data first then authentication. */
export function serviceRequirementIds(serviceId: string): string[] {
  const service = SERVICES[serviceId];
  return service ? [...service.requirements, ...service.authentication] : [];
}

/** Rules the assistant must respect (entity_decision_trees.global_automation_rules). */
export const AUTOMATION_RULES = ''' + ts([r["rule_id"] for r in trees["global_automation_rules"]]) + ''' as const;
''')
OUT.write_text("\n".join(out))
print("wrote", OUT.relative_to(ROOT), "services:", len(services), "requirements:", len(reqs))
