"""Shared domain contracts. Synthetic examples are not approved legal procedures."""

from datetime import date
from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

CONTRACT_VERSION = "0.1.0"
Text = Annotated[str, Field(min_length=1)]
Revision = Annotated[int, Field(ge=1, strict=True)]
Checksum = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class AgencyCode(StrEnum):
    DGI = "DGI"
    RNE = "RNE"
    APII = "APII"


class Actor(Model):
    id: UUID
    kind: Literal["business_member", "officer", "rule_maintainer", "service"]
    agency: AgencyCode | None = None

    @model_validator(mode="after")
    def officer_scope(self):
        if self.kind == "officer" and self.agency is None:
            raise ValueError("officer requires agency scope")
        return self


class Source(Model):
    id: UUID
    kind: Literal["official", "synthetic"]
    uri: Text
    passage: Text
    page: Annotated[int, Field(ge=1)] | None = None
    section: str | None = None
    sha256: Checksum
    retrieved_at: AwareDatetime
    effective_from: date | None = None
    effective_to: date | None = None

    @model_validator(mode="after")
    def dates(self):
        if self.effective_from and self.effective_to and self.effective_to <= self.effective_from:
            raise ValueError("effective_to must follow effective_from")
        return self


class Agency(Model):
    code: AgencyCode
    name: Text
    integration: Literal["simulated", "connected"] = "simulated"


class Company(Model):
    id: UUID
    version: Revision
    name: Text
    member_ids: list[UUID] = Field(min_length=1)
    legal_form: str | None = None
    tax_regime: str | None = None
    matricule_fiscal: str | None = None
    headcount: Annotated[int, Field(ge=0)] | None = None
    governorate: str | None = None
    preferred_language: Literal["ar-TN", "fr", "en"] = "fr"


class ProcedureVersion(Model):
    id: UUID
    code: Text
    version: Text
    agency: AgencyCode
    title: Text
    status: Literal["candidate", "approved", "superseded", "synthetic"]
    sources: list[Source] = Field(min_length=1)
    approved_by: Actor | None = None
    approved_at: AwareDatetime | None = None
    effective_from: date | None = None
    effective_to: date | None = None

    @model_validator(mode="after")
    def approval(self):
        if self.status in {"approved", "superseded"}:
            if not self.approved_by or self.approved_by.kind != "rule_maintainer" or not self.approved_at:
                raise ValueError("published rules require a maintainer approval and timestamp")
            if any(s.kind != "official" for s in self.sources):
                raise ValueError("synthetic sources cannot become approved legal rules")
        if self.status == "synthetic" and any(s.kind != "synthetic" for s in self.sources):
            raise ValueError("synthetic procedure must use synthetic sources")
        if self.effective_from and self.effective_to and self.effective_to <= self.effective_from:
            raise ValueError("invalid effective period")
        return self


class Readiness(StrEnum):
    UNKNOWN = "unknown"
    INCOMPLETE = "incomplete"
    NEEDS_REVIEW = "needs_review"
    READY = "ready"


class AgencyAcceptance(StrEnum):
    NOT_SUBMITTED = "not_submitted"
    PENDING = "pending"
    MODIFICATION_REQUESTED = "modification_requested"
    ACCEPTED = "accepted"
    REFUSED = "refused"


class PrerequisiteStatus(StrEnum):
    UNKNOWN = "unknown"
    SATISFIED = "satisfied"
    UNSATISFIED = "unsatisfied"
    NOT_APPLICABLE = "not_applicable"


class NodeType(StrEnum):
    INFORMATION_INPUT = "information_input"
    DOCUMENT_EVIDENCE = "document_evidence"
    DOCUMENT_PREPARATION = "document_preparation"
    VALIDATION = "validation"
    DECISION = "decision"
    EXTERNAL_ACTION = "external_action"
    HUMAN_REVIEW = "human_review"
    SUBMISSION = "submission"


class NodeState(StrEnum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    WAITING = "waiting"
    NEEDS_CORRECTION = "needs_correction"
    COMPLETED = "completed"
    BLOCKED = "blocked"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Action(StrEnum):
    VIEW = "view"
    EDIT_FACTS = "edit_facts"
    UPLOAD_EVIDENCE = "upload_evidence"
    CORRECT_EVIDENCE = "correct_evidence"
    REQUEST_REVIEW = "request_review"
    PREPARE_DOCUMENT = "prepare_document"
    RUN_VALIDATION = "run_validation"
    RECORD_DECISION = "record_decision"
    EXECUTE_EXTERNAL = "execute_external"
    SUBMIT = "submit"
    RESUBMIT = "resubmit"
    CANCEL = "cancel"


NODE_STATES = {
    NodeType.INFORMATION_INPUT: {NodeState.NOT_STARTED, NodeState.IN_PROGRESS, NodeState.NEEDS_CORRECTION, NodeState.COMPLETED, NodeState.CANCELLED},
    NodeType.DOCUMENT_EVIDENCE: {NodeState.NOT_STARTED, NodeState.IN_PROGRESS, NodeState.WAITING, NodeState.NEEDS_CORRECTION, NodeState.COMPLETED, NodeState.FAILED, NodeState.CANCELLED},
    NodeType.DOCUMENT_PREPARATION: set(NodeState),
    NodeType.VALIDATION: set(NodeState),
    NodeType.DECISION: {NodeState.NOT_STARTED, NodeState.WAITING, NodeState.IN_PROGRESS, NodeState.COMPLETED, NodeState.CANCELLED},
    NodeType.EXTERNAL_ACTION: set(NodeState),
    NodeType.HUMAN_REVIEW: {NodeState.NOT_STARTED, NodeState.WAITING, NodeState.IN_PROGRESS, NodeState.NEEDS_CORRECTION, NodeState.COMPLETED, NodeState.CANCELLED},
    NodeType.SUBMISSION: set(NodeState),
}


class Scope(Model):
    company_id: UUID
    dossier_id: UUID
    node_id: UUID | None = None


class Blocker(Model):
    obligation_id: UUID
    action: Literal["submit", "resubmit", "execute_external"]
    status: PrerequisiteStatus
    dependency_verification: Literal["verified", "synthetic"]
    reason: Text
    source: Source

    @model_validator(mode="after")
    def enforce_supported_gate(self):
        if self.status not in {PrerequisiteStatus.UNKNOWN, PrerequisiteStatus.UNSATISFIED}:
            raise ValueError("satisfied or inapplicable prerequisites cannot block")
        if self.dependency_verification == "verified" and self.source.kind != "official":
            raise ValueError("verified dependency needs official source")
        return self


class Node(Scope):
    node_id: UUID
    version: Revision
    procedure_version_id: UUID
    agency: AgencyCode
    type: NodeType
    state: NodeState
    title: Text
    content: str = ""
    responsible_actor: Actor
    dependencies: list[UUID] = Field(default_factory=list)
    requirement_ids: list[UUID] = Field(default_factory=list)
    finding_ids: list[UUID] = Field(default_factory=list)
    sources: list[Source] = Field(default_factory=list)
    allowed_actions: list[Action] = Field(default_factory=lambda: [Action.VIEW])
    blockers: list[Blocker] = Field(default_factory=list)
    readiness: Readiness = Readiness.UNKNOWN
    agency_acceptance: AgencyAcceptance = AgencyAcceptance.NOT_SUBMITTED
    prerequisite_status: PrerequisiteStatus = PrerequisiteStatus.UNKNOWN

    @model_validator(mode="after")
    def gates(self):
        if self.state not in NODE_STATES[self.type]:
            raise ValueError("state is not supported for this node type")
        if self.node_id in self.dependencies:
            raise ValueError("node cannot depend on itself")
        if any(b.action in self.allowed_actions for b in self.blockers):
            raise ValueError("blocked actions cannot be allowed")
        return self


class Requirement(Model):
    id: UUID
    procedure_version_id: UUID
    code: Text
    description: Text
    evidence_type: Text
    minimum_count: Annotated[int, Field(ge=1)] = 1
    applicability: Literal["applicable", "not_applicable", "unknown"]
    sources: list[Source] = Field(min_length=1)


class Evidence(Scope):
    id: UUID
    version: Revision
    replaces_id: UUID | None = None
    requirement_ids: list[UUID] = Field(min_length=1)
    storage_ref: Text
    sha256: Checksum
    mime_type: Text
    uploaded_by: Actor
    uploaded_at: AwareDatetime
    extraction_method: Literal["native", "ocr", "mixed", "not_processed"]
    raw_text_ref: str | None = None
    confirmed_fields_ref: str | None = None
    review_status: Literal["unreviewed", "confirmed", "needs_correction"]


class Finding(Scope):
    id: UUID
    node_id: UUID
    procedure_version_id: UUID
    requirement_id: UUID
    evidence_ids: list[UUID]
    evaluated_dossier_version: Revision
    outcome: Literal["pass", "fail", "unknown", "needs_review"]
    message: Text
    sources: list[Source] = Field(min_length=1)
    validity: Literal["current", "stale"]


class ObligationStatus(Model):
    id: UUID
    company_id: UUID
    responsible_agency: AgencyCode
    code: Text
    status: PrerequisiteStatus
    basis: Literal["missing_evidence", "user_claim", "authoritative", "simulated"]
    source: Source | None = None
    observed_at: AwareDatetime
    authoritative_reference: str | None = None

    @model_validator(mode="after")
    def uncertainty(self):
        if self.basis in {"missing_evidence", "user_claim"} and self.status != PrerequisiteStatus.UNKNOWN:
            raise ValueError("missing evidence or a user claim is unknown, not non-filing")
        if self.basis == "authoritative" and (
            not self.authoritative_reference or not self.source or self.source.kind != "official"
        ):
            raise ValueError("authoritative status requires official provenance")
        return self


class ReviewDecision(Scope):
    id: UUID
    node_id: UUID
    agency: AgencyCode
    actor: Actor
    action: Literal["accept", "refuse", "request_modification"]
    reason: Text
    dossier_version: Revision
    procedure_version_id: UUID
    evidence_ids: list[UUID]
    created_at: AwareDatetime
    idempotency_key: Text

    @model_validator(mode="after")
    def reviewer(self):
        if self.actor.kind != "officer" or self.actor.agency != self.agency:
            raise ValueError("review decision requires an officer of the same agency")
        return self


class Dossier(Model):
    id: UUID
    company_id: UUID
    agency: AgencyCode
    procedure_version_id: UUID
    version: Revision
    lifecycle: Literal["draft", "active", "awaiting_review", "correction_requested", "closed", "cancelled"]
    readiness: Readiness
    agency_acceptance: AgencyAcceptance
    prerequisite_status: PrerequisiteStatus
    node_ids: list[UUID]
    simulated: bool
    updated_at: AwareDatetime


class Envelope(Scope):
    schema_version: Literal["0.1.0"] = CONTRACT_VERSION
    actor: Actor
    correlation_id: UUID
    idempotency_key: Text


class CommandBase(Envelope):
    expected_version: Revision


class EvidenceChanged(CommandBase):
    type: Literal["evidence_changed"]
    node_id: UUID
    evidence_id: UUID
    replaced_evidence_id: UUID | None = None


class ReviewRequested(CommandBase):
    type: Literal["review_requested"]
    node_id: UUID


class DecisionRecorded(CommandBase):
    type: Literal["decision_recorded"]
    node_id: UUID
    decision: ReviewDecision

    @model_validator(mode="after")
    def matching_context(self):
        for name in ("company_id", "dossier_id", "node_id", "actor", "idempotency_key"):
            if getattr(self, name) != getattr(self.decision, name):
                raise ValueError(f"decision {name} differs from command")
        if self.expected_version != self.decision.dossier_version:
            raise ValueError("decision version differs from command")
        return self


class PrerequisiteChanged(CommandBase):
    type: Literal["prerequisite_changed"]
    obligation: ObligationStatus

    @model_validator(mode="after")
    def matching_company(self):
        if self.obligation.company_id != self.company_id:
            raise ValueError("obligation belongs to another company")
        return self


class SubmissionRequested(CommandBase):
    type: Literal["submission_requested", "resubmission_requested"]
    node_id: UUID
    package_snapshot_id: UUID
    user_confirmed: Literal[True]
    mode: Literal["platform_review", "simulated_agency", "connected_agency"]


class CancellationRequested(CommandBase):
    type: Literal["cancellation_requested"]
    reason: Text


Command = Annotated[
    EvidenceChanged | ReviewRequested | DecisionRecorded | PrerequisiteChanged
    | SubmissionRequested | CancellationRequested,
    Field(discriminator="type"),
]


class ProjectionChanged(Model):
    type: Literal["projection_changed"]
    dossier: Dossier
    changed_nodes: list[Node]
    invalidated_finding_ids: list[UUID]


class DecisionAppended(Model):
    type: Literal["decision_appended"]
    decision: ReviewDecision


class SubmissionReceipt(Model):
    type: Literal["submission_receipt"]
    receipt_id: UUID
    package_snapshot_id: UUID
    mode: Literal["platform_review", "simulated_agency", "connected_agency"]
    status: Literal["queued", "delivered", "failed"]
    external_reference: str | None = None


EventPayload = Annotated[ProjectionChanged | DecisionAppended | SubmissionReceipt, Field(discriminator="type")]


class Event(Envelope):
    id: UUID
    occurred_at: AwareDatetime
    aggregate_version: Revision
    payload: EventPayload

    @model_validator(mode="after")
    def matching_context(self):
        if isinstance(self.payload, ProjectionChanged):
            d = self.payload.dossier
            if (d.id, d.company_id, d.version) != (self.dossier_id, self.company_id, self.aggregate_version):
                raise ValueError("projection does not match event scope/version")
            if any(n.dossier_id != d.id or n.company_id != d.company_id for n in self.payload.changed_nodes):
                raise ValueError("changed node is outside event scope")
        if isinstance(self.payload, DecisionAppended):
            decision = self.payload.decision
            if (decision.dossier_id, decision.company_id, decision.node_id) != (self.dossier_id, self.company_id, self.node_id):
                raise ValueError("decision does not match event scope")
        return self


class CommandAcknowledgement(Model):
    command_id: UUID
    correlation_id: UUID
    dossier_id: UUID
    status: Literal["accepted_for_processing"]
    projection_version: Revision


class ErrorResponse(Model):
    code: Literal["validation_error", "forbidden", "not_found", "version_conflict", "idempotency_conflict", "action_blocked", "not_implemented"]
    message: Text
    correlation_id: UUID | None = None
    current_version: Revision | None = None
    blockers: list[Blocker] = Field(default_factory=list)


class DossierDetail(Model):
    dossier: Dossier
    nodes: list[Node]
    requirements: list[Requirement]
    evidence: list[Evidence]
    findings: list[Finding]
    decisions: list[ReviewDecision]
    obligations: list[ObligationStatus]

    @model_validator(mode="after")
    def references(self):
        d = self.dossier
        nodes = {n.node_id: n for n in self.nodes}
        requirements = {r.id for r in self.requirements}
        evidence = {e.id for e in self.evidence}
        findings = {f.id for f in self.findings}
        if len(nodes) != len(self.nodes) or set(d.node_ids) != set(nodes) or len(d.node_ids) != len(nodes):
            raise ValueError("dossier node IDs must match unique nodes")
        for item in [*self.nodes, *self.evidence, *self.findings, *self.decisions]:
            if item.company_id != d.company_id or item.dossier_id != d.id:
                raise ValueError("cross-dossier or cross-company reference")
            if item.node_id is not None and item.node_id not in nodes:
                raise ValueError("unknown node reference")
        for n in self.nodes:
            if n.agency != d.agency or n.procedure_version_id != d.procedure_version_id:
                raise ValueError("node agency/procedure differs from dossier")
            if not set(n.dependencies) <= set(nodes) or not set(n.requirement_ids) <= requirements or not set(n.finding_ids) <= findings:
                raise ValueError("unknown node dependency, requirement or finding")
        for r in self.requirements:
            if r.procedure_version_id != d.procedure_version_id:
                raise ValueError("requirement belongs to another procedure version")
        for e in self.evidence:
            if not set(e.requirement_ids) <= requirements:
                raise ValueError("evidence links an unknown requirement")
        for f in self.findings:
            if f.requirement_id not in requirements or not set(f.evidence_ids) <= evidence:
                raise ValueError("finding links unknown evidence/requirement")
            if f.procedure_version_id != d.procedure_version_id:
                raise ValueError("finding belongs to another procedure version")
            if f.validity == "current" and f.evaluated_dossier_version != d.version:
                raise ValueError("current finding must match dossier version")
        if any(o.company_id != d.company_id for o in self.obligations):
            raise ValueError("cross-company obligation")
        visited, visiting = set(), set()

        def visit(node_id):
            if node_id in visiting:
                raise ValueError("cyclic node dependencies")
            if node_id in visited:
                return
            visiting.add(node_id)
            for parent in nodes[node_id].dependencies:
                visit(parent)
            visiting.remove(node_id)
            visited.add(node_id)

        for node_id in nodes:
            visit(node_id)
        return self
