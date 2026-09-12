"""Deterministic synthetic data; never loaded into a legal rules store."""

from datetime import datetime, timezone
from hashlib import sha256
from uuid import NAMESPACE_URL, uuid5

from contracts.models import (
    Action, Actor, Agency, AgencyAcceptance, AgencyCode, Blocker, Company, Dossier,
    DossierDetail, Evidence, Event, Finding, Node, NodeState, NodeType,
    ObligationStatus, PrerequisiteStatus, ProcedureVersion, ProjectionChanged,
    Readiness, Requirement, ReviewDecision, Source,
)


def uid(name):
    return uuid5(NAMESPACE_URL, "https://example.invalid/hack4justice/" + name)


NOW = datetime(2026, 9, 12, 12, tzinfo=timezone.utc)
BUSINESS_ACTOR = Actor(id=uid("member"), kind="business_member")
SERVICE_ACTOR = Actor(id=uid("temporal"), kind="service")
COMPANY = Company(id=uid("company"), version=1, name="Synthetic Demo Company",
                  member_ids=[BUSINESS_ACTOR.id])
AGENCIES = [Agency(code=code, name=f"{code} synthetic demo") for code in AgencyCode]


def source(agency):
    return Source(id=uid(f"source/{agency}"), kind="synthetic",
                  uri=f"https://example.invalid/synthetic/{agency}",
                  passage="Synthetic test condition only; not a legal requirement.",
                  sha256=sha256(f"synthetic/{agency}".encode()).hexdigest(), retrieved_at=NOW)


PROCEDURES = [ProcedureVersion(
    id=uid(f"procedure/{a}"), code=f"synthetic_{a.lower()}_journey", version="demo-1",
    agency=a, title=f"{a} synthetic journey — not an official procedure",
    status="synthetic", sources=[source(a)],
) for a in AgencyCode]


def make_detail(procedure):
    agency = procedure.agency
    dossier_id = uid(f"dossier/{agency}")
    scope = {"company_id": COMPANY.id, "dossier_id": dossier_id}
    status = {AgencyCode.DGI: PrerequisiteStatus.SATISFIED,
              AgencyCode.RNE: PrerequisiteStatus.UNSATISFIED,
              AgencyCode.APII: PrerequisiteStatus.UNKNOWN}[agency]
    officer = Actor(id=uid(f"officer/{agency}"), kind="officer", agency=agency)
    obligation = ObligationStatus(
        id=uid(f"obligation/{agency}"), company_id=COMPANY.id, responsible_agency=agency,
        code="synthetic_prerequisite", status=status,
        basis="missing_evidence" if status == PrerequisiteStatus.UNKNOWN else "simulated",
        source=source(agency), observed_at=NOW,
    )
    requirement = Requirement(id=uid(f"requirement/{agency}"), procedure_version_id=procedure.id,
                              code="SYNTHETIC-01", description="Synthetic supporting document",
                              evidence_type="synthetic_document", applicability="applicable",
                              sources=[source(agency)])
    nodes = []
    for node_type in NodeType:
        node_id = uid(f"node/{agency}/{node_type}")
        actions = [Action.VIEW]
        blockers = []
        state = NodeState.NOT_STARTED
        if node_type == NodeType.INFORMATION_INPUT:
            actions += [Action.EDIT_FACTS]
        elif node_type == NodeType.DOCUMENT_EVIDENCE:
            actions += [Action.UPLOAD_EVIDENCE, Action.CORRECT_EVIDENCE, Action.REQUEST_REVIEW]
        elif node_type == NodeType.DOCUMENT_PREPARATION:
            actions += [Action.PREPARE_DOCUMENT]
        elif node_type == NodeType.VALIDATION:
            actions += [Action.RUN_VALIDATION]
        elif node_type == NodeType.SUBMISSION:
            if status == PrerequisiteStatus.SATISFIED:
                actions += [Action.SUBMIT]
            else:
                state = NodeState.BLOCKED
                blockers = [Blocker(obligation_id=obligation.id, action="submit", status=status,
                                    dependency_verification="synthetic", source=source(agency),
                                    reason="Demo prerequisite is unknown or unsatisfied; upload and correction remain available.")]
        nodes.append(Node(
            **scope, node_id=node_id, version=1, procedure_version_id=procedure.id,
            agency=agency, type=node_type, state=state, title=node_type.replace("_", " "),
            responsible_actor=officer if node_type in {NodeType.DECISION, NodeType.HUMAN_REVIEW} else BUSINESS_ACTOR,
            dependencies=[nodes[-1].node_id] if nodes else [],
            requirement_ids=[requirement.id] if node_type == NodeType.DOCUMENT_EVIDENCE else [],
            sources=[source(agency)], allowed_actions=actions, blockers=blockers,
            prerequisite_status=status,
        ))
    evidence_node = next(n for n in nodes if n.type == NodeType.DOCUMENT_EVIDENCE)
    evidence = Evidence(**scope, node_id=evidence_node.node_id, id=uid(f"evidence/{agency}"),
                        version=1, requirement_ids=[requirement.id], storage_ref=f"synthetic/{agency}/document.txt",
                        sha256=sha256(f"synthetic evidence {agency}".encode()).hexdigest(), mime_type="text/plain",
                        uploaded_by=BUSINESS_ACTOR, uploaded_at=NOW, extraction_method="native",
                        raw_text_ref=f"synthetic/{agency}/text.txt", review_status="unreviewed")
    finding = Finding(**scope, node_id=evidence_node.node_id, id=uid(f"finding/{agency}"),
                      procedure_version_id=procedure.id, requirement_id=requirement.id,
                      evidence_ids=[evidence.id], evaluated_dossier_version=1, outcome="needs_review",
                      message="Synthetic document awaits confirmation.", sources=[source(agency)], validity="current")
    # The DGI scenario illustrates ready != accepted; its evidence has been confirmed.
    if agency == AgencyCode.DGI:
        evidence = evidence.model_copy(update={"review_status": "confirmed"})
        finding = finding.model_copy(update={"outcome": "pass", "message": "Synthetic evidence confirmed."})
        for index, node in enumerate(nodes):
            if node.type != NodeType.SUBMISSION:
                nodes[index] = node.model_copy(update={"state": NodeState.COMPLETED, "readiness": Readiness.READY})
    nodes = [n.model_copy(update={"finding_ids": [finding.id]}) if n.node_id == evidence_node.node_id else n for n in nodes]
    dossier = Dossier(id=dossier_id, company_id=COMPANY.id, agency=agency,
                      procedure_version_id=procedure.id, version=1, lifecycle="active",
                      readiness=Readiness.READY if agency == AgencyCode.DGI else Readiness.NEEDS_REVIEW,
                      agency_acceptance=AgencyAcceptance.NOT_SUBMITTED, prerequisite_status=status,
                      node_ids=[n.node_id for n in nodes], simulated=True, updated_at=NOW)
    return DossierDetail(dossier=dossier, nodes=nodes, requirements=[requirement], evidence=[evidence],
                         findings=[finding], decisions=[], obligations=[obligation])


DETAILS = [make_detail(p) for p in PROCEDURES]
EVENTS = [Event(
    id=uid(f"event/{d.dossier.agency}"), company_id=COMPANY.id, dossier_id=d.dossier.id,
    actor=SERVICE_ACTOR, correlation_id=uid(f"correlation/{d.dossier.agency}"),
    idempotency_key=f"fixture-{d.dossier.agency}-v1", aggregate_version=1, occurred_at=NOW,
    payload=ProjectionChanged(type="projection_changed", dossier=d.dossier, changed_nodes=d.nodes,
                              invalidated_finding_ids=[]),
) for d in DETAILS]

# Separate example: it is intentionally not attached to the pre-submission dossiers.
DECISION_EXAMPLE = ReviewDecision(
    company_id=COMPANY.id, dossier_id=DETAILS[0].dossier.id,
    node_id=next(n.node_id for n in DETAILS[0].nodes if n.type == NodeType.HUMAN_REVIEW),
    id=uid("decision-example"), agency=AgencyCode.DGI,
    actor=Actor(id=uid("officer/DGI"), kind="officer", agency=AgencyCode.DGI),
    action="request_modification", reason="Synthetic example: replace the illegible page.",
    dossier_version=1, procedure_version_id=PROCEDURES[0].id,
    evidence_ids=[DETAILS[0].evidence[0].id], created_at=NOW, idempotency_key="example-review-1",
)
