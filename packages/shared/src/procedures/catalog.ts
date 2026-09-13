// GENERATED from packages/shared/src/procedures/source/*.json by scripts/generate-procedures.py.
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
export const REQUIREMENT_STATUSES = Object.values(RequirementStatus) as [
  RequirementStatus,
  ...RequirementStatus[],
];

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
export const SUBMISSION_STATUSES = Object.values(SubmissionStatus) as [
  SubmissionStatus,
  ...SubmissionStatus[],
];

/** Ordered state machine steps shared by every RNE / DGI service. */
export const PROCEDURE_STEPS = [
  "COLLECT_REQUIREMENTS",
  "PREVALIDATION",
  "AUTHENTICATION",
  "READY_FOR_SUBMISSION",
  "OFFICIAL_SUBMISSION",
  "UNDER_REVIEW",
  "ACCEPTED",
] as const;
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

export const REQUIREMENTS: Record<string, RequirementDef> = {
  VALIDATED_STATUTES: {
    id: "VALIDATED_STATUTES",
    type: "document",
    required: true,
    providedBy: { entity: "APII", service: "APII_COMPANY_CONSTITUTION" },
    sourceStatus: "SUPPORTED_BY_SOURCE",
  },
  REGISTERED_STATUTES: {
    id: "REGISTERED_STATUTES",
    type: "document",
    required: true,
    providedBy: { entity: "GREFFE", service: "GREFFE_COMPANY_ACTS" },
    sourceStatus: "SUPPORTED_BY_SOURCE",
  },
  MANAGER_BENEFICIARY_DATA: {
    id: "MANAGER_BENEFICIARY_DATA",
    type: "data",
    required: true,
    sourceStatus: "SUPPORTED_BY_SOURCE",
  },
  FISCAL_IDENTIFIER: {
    id: "FISCAL_IDENTIFIER",
    type: "data",
    required: true,
    providedBy: { entity: "DGI", service: "DGI_EXISTENCE_FISCAL_CARD" },
    sourceStatus: "SUPPORTED_BY_SOURCE",
  },
  RNE_OR_RC_INFORMATION: {
    id: "RNE_OR_RC_INFORMATION",
    type: "data",
    required: true,
    sourceStatus: "SUPPORTED_BY_SOURCE",
  },
  MANAGER_CIN: { id: "MANAGER_CIN", type: "document", required: true, sourceStatus: "SUPPORTED_BY_SOURCE" },
  MONTHLY_TAX_DECLARATION_DATA: {
    id: "MONTHLY_TAX_DECLARATION_DATA",
    type: "data",
    required: true,
    sourceStatus: "SUPPORTED_BY_SOURCE",
  },
  TAXPAYER_ENROLLMENT: {
    id: "TAXPAYER_ENROLLMENT",
    type: "action",
    required: true,
    sourceStatus: "SUPPORTED_BY_SOURCE",
  },
  TAXPAYER_IDENTIFIER: {
    id: "TAXPAYER_IDENTIFIER",
    type: "data",
    required: true,
    sourceStatus: "SUPPORTED_BY_SOURCE",
  },
  DIGIGO_CERTIFICATE: {
    id: "DIGIGO_CERTIFICATE",
    type: "authentication",
    required: true,
    providedBy: { entity: "TunTrust", service: "TUNTRUST_E_SIGNATURE" },
    sourceStatus: "SUPPORTED_BY_SOURCE",
  },
  ANNUAL_RESULTS_TAX_PACKAGE: {
    id: "ANNUAL_RESULTS_TAX_PACKAGE",
    type: "document",
    required: true,
    sourceStatus: "SUPPORTED_BY_SOURCE",
  },
  QUALIFIED_TUNTRUST_SIGNATURE: {
    id: "QUALIFIED_TUNTRUST_SIGNATURE",
    type: "authentication",
    required: true,
    providedBy: { entity: "TunTrust", service: "TUNTRUST_E_SIGNATURE" },
    sourceStatus: "SUPPORTED_BY_SOURCE",
  },
  TEJ_ENROLLMENT: {
    id: "TEJ_ENROLLMENT",
    type: "action",
    required: true,
    sourceStatus: "SUPPORTED_BY_SOURCE",
  },
  TEJ_LOGIN_CERTIFICATE: {
    id: "TEJ_LOGIN_CERTIFICATE",
    type: "authentication",
    required: true,
    sourceStatus: "SUPPORTED_BY_SOURCE",
  },
  RNE_UPDATE_SUPPORTING_ATTACHMENTS: {
    id: "RNE_UPDATE_SUPPORTING_ATTACHMENTS",
    type: "document",
    required: false,
    sourceStatus: "SUPPORTED_BY_SOURCE",
    notes: "The source does not enumerate exact attachments.",
  },
  RNE_DEREGISTRATION_ATTACHMENTS: {
    id: "RNE_DEREGISTRATION_ATTACHMENTS",
    type: "document",
    required: true,
    sourceStatus: "SUPPORTED_BY_SOURCE",
    notes: "The source says scanned attachments signed electronically; exact documents are not specified.",
  },
  RNE_ELECTRONIC_ACTS: {
    id: "RNE_ELECTRONIC_ACTS",
    type: "document",
    required: false,
    sourceStatus: "SUPPORTED_BY_SOURCE",
  },
  RNE_E_SAFE_ACTIVATION: {
    id: "RNE_E_SAFE_ACTIVATION",
    type: "action",
    required: true,
    sourceStatus: "SUPPORTED_BY_SOURCE",
  },
  OTP: { id: "OTP", type: "authentication", required: true, sourceStatus: "SUPPORTED_BY_SOURCE" },
};

export const SERVICES: Record<string, ServiceDef> = {
  RNE_REGISTRATION: {
    id: "RNE_REGISTRATION",
    destination: "RNE",
    requirements: ["VALIDATED_STATUTES", "MANAGER_BENEFICIARY_DATA", "FISCAL_IDENTIFIER"],
    authentication: ["DIGIGO_CERTIFICATE"],
    authenticationMethods: ["MobileID_for_physical_persons", "DigiGo_for_legal_persons"],
    submissionMode: "100%_ONLINE",
    channels: ["100_percent_online"],
    checks: ["start", "authenticate", "RNE_validation"],
    outputs: ["RNE_EXTRACT", "RNE_IDENTIFIER"],
    rejectionEffects: ["Rejection can prevent the unique identifier and affect/delay CNSS/DGI processes."],
    notes: [],
  },
  RNE_UPDATE: {
    id: "RNE_UPDATE",
    destination: "RNE",
    requirements: ["RNE_UPDATE_SUPPORTING_ATTACHMENTS", "MANAGER_BENEFICIARY_DATA"],
    authentication: ["DIGIGO_CERTIFICATE"],
    authenticationMethods: ["MobileID", "DigiGo"],
    submissionMode: "100%_ONLINE_AFTER_INITIAL_ACTIVATION",
    channels: ["online"],
    checks: ["start", "RNE_validation"],
    outputs: ["UPDATED_RNE_EXTRACT", "DIGITAL_NOTIFICATION"],
    rejectionEffects: [
      "Rejection leaves the previous situation in place and can create inconsistencies affecting CNSS/DGI.",
    ],
    notes: ["The source explicitly mentions updates such as address, management and activity."],
  },
  RNE_DEREGISTRATION: {
    id: "RNE_DEREGISTRATION",
    destination: "RNE",
    requirements: ["RNE_DEREGISTRATION_ATTACHMENTS"],
    authentication: ["DIGIGO_CERTIFICATE"],
    authenticationMethods: [],
    submissionMode: "100%_ONLINE",
    channels: ["online"],
    checks: ["start", "RNE_validation"],
    outputs: ["RNE_DEREGISTRATION_CERTIFICATE"],
    rejectionEffects: ["Closure without alignment with CNSS/DGI can create fiscal/social inconsistencies."],
    notes: ["Some underlying acts may still require authentic/notarial form."],
  },
  RNE_ELECTRONIC_SAFE: {
    id: "RNE_ELECTRONIC_SAFE",
    destination: "RNE",
    requirements: ["RNE_E_SAFE_ACTIVATION", "OTP", "RNE_ELECTRONIC_ACTS"],
    authentication: ["DIGIGO_CERTIFICATE"],
    authenticationMethods: [],
    submissionMode: "ACTIVATION_MAY_BE_PHYSICAL_THEN_ONLINE",
    channels: ["initial_activation_often_physical", "then_online"],
    checks: ["start"],
    outputs: ["CERTIFIED_ELECTRONIC_ACTS"],
    rejectionEffects: [],
    notes: [
      "The source says activation is once, often physical, then use is online; certified electronic acts/PVs/statutes can be stored.",
    ],
  },
  DGI_EXISTENCE_FISCAL_CARD: {
    id: "DGI_EXISTENCE_FISCAL_CARD",
    destination: "DGI",
    requirements: ["REGISTERED_STATUTES", "RNE_OR_RC_INFORMATION", "MANAGER_CIN"],
    authentication: ["DIGIGO_CERTIFICATE"],
    authenticationMethods: [],
    submissionMode: "ONLINE_OR_GUICHET_DEPENDING_ON_PROCESS",
    channels: [],
    checks: [],
    outputs: ["FISCAL_IDENTIFIER"],
    rejectionEffects: [
      "Rejection for missing documents can prevent the fiscal identifier and e-Jibaya; CNSS may also reject without the fiscal identifier.",
    ],
    notes: [],
  },
  DGI_MONTHLY_DECLARATION: {
    id: "DGI_MONTHLY_DECLARATION",
    destination: "DGI",
    requirements: ["MONTHLY_TAX_DECLARATION_DATA", "TAXPAYER_ENROLLMENT", "TAXPAYER_IDENTIFIER"],
    authentication: ["DIGIGO_CERTIFICATE"],
    authenticationMethods: ["telesubscriber_identifier", "DIGIGO_certificate"],
    submissionMode: "100%_ONLINE",
    channels: ["online_e_Jibaya"],
    checks: ["start", "prepare_declaration", "DGI_validation"],
    outputs: ["ELECTRONIC_RECEIPT", "AMOUNT_DUE", "DECLARATION_PROOF"],
    rejectionEffects: [
      "Technical rejection or declarative errors can block validation and cause penalties; anomalies can affect TEJ and require regularization.",
    ],
    notes: [],
  },
  DGI_ANNUAL_RETURN: {
    id: "DGI_ANNUAL_RETURN",
    destination: "DGI",
    requirements: ["ANNUAL_RESULTS_TAX_PACKAGE"],
    authentication: ["QUALIFIED_TUNTRUST_SIGNATURE"],
    authenticationMethods: [],
    submissionMode: "ONLINE",
    channels: ["online_e_Liasse"],
    checks: ["start", "DGI_validation"],
    outputs: ["TIMESTAMPED_E_LIASSE_PROOF"],
    rejectionEffects: [
      "Technical/declarative rejection can affect the fiscal situation visible through TEJ.",
    ],
    notes: [],
  },
  DGI_TEJ: {
    id: "DGI_TEJ",
    destination: "DGI",
    requirements: ["TEJ_ENROLLMENT"],
    authentication: ["TEJ_LOGIN_CERTIFICATE"],
    authenticationMethods: ["login", "certificate"],
    submissionMode: "ONLINE",
    channels: ["online"],
    checks: ["start", "consult"],
    outputs: ["FISCAL_SITUATION", "WITHHOLDING_CERTIFICATES"],
    rejectionEffects: [
      "Missing/rejected e-Jibaya declarations can appear as irregularities in TEJ and affect supplier eligibility.",
    ],
    notes: [],
  },
};

export const SERVICE_IDS = Object.keys(SERVICES) as [string, ...string[]];
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
export const AUTOMATION_RULES = [
  "PREPARE_NOT_SUBMIT",
  "NO_UNSUPPORTED_API",
  "VALIDATE_BEFORE_PUSH",
  "EXPLICIT_STATUS",
  "PHYSICAL_EXCEPTION",
] as const;
