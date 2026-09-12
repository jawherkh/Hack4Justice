"""Generate portable artifacts from the Python contracts: python -m contracts.export."""

import json
from pathlib import Path

from pydantic import TypeAdapter

from contracts import models as m
from contracts.fixtures import (
    AGENCIES, BUSINESS_ACTOR, COMPANY, DECISION_EXAMPLE, DETAILS, EVENTS, NOW,
    PROCEDURES, SERVICE_ACTOR, uid,
)
from contracts.mock_api import app

ROOT = Path(__file__).resolve().parent
MODELS = [m.Company, m.Agency, m.ProcedureVersion, m.Dossier, m.Node, m.Requirement,
          m.Evidence, m.Finding, m.ObligationStatus, m.ReviewDecision, m.Event,
          m.DossierDetail, m.CommandAcknowledgement, m.ErrorResponse]


def command_examples():
    detail = DETAILS[0]
    base = dict(company_id=COMPANY.id, dossier_id=detail.dossier.id,
                actor=BUSINESS_ACTOR.model_dump(mode="json"), expected_version=1,
                correlation_id=uid("example-command"), idempotency_key="example-command-1")
    node_id = detail.evidence[0].node_id
    examples = [
        {**base, "type": "evidence_changed", "node_id": node_id, "evidence_id": detail.evidence[0].id},
        {**base, "type": "review_requested", "node_id": node_id},
        {**base, "type": "decision_recorded", "node_id": DECISION_EXAMPLE.node_id,
         "actor": DECISION_EXAMPLE.actor.model_dump(mode="json"),
         "idempotency_key": DECISION_EXAMPLE.idempotency_key,
         "decision": DECISION_EXAMPLE.model_dump(mode="json")},
        {**base, "type": "prerequisite_changed", "actor": SERVICE_ACTOR.model_dump(mode="json"),
         "obligation": detail.obligations[0].model_dump(mode="json")},
        {**base, "type": "cancellation_requested", "reason": "Synthetic cancellation example"},
    ]
    for kind in ("submission_requested", "resubmission_requested"):
        examples.append({**base, "type": kind, "node_id": detail.nodes[-1].node_id,
                         "package_snapshot_id": uid("package"), "user_confirmed": True,
                         "mode": "simulated_agency"})
    return [TypeAdapter(m.Command).validate_python(e).model_dump(mode="json") for e in examples]


def artifacts():
    result = {f"schemas/{model.__name__}.schema.json": model.model_json_schema() for model in MODELS}
    result["schemas/Command.schema.json"] = TypeAdapter(m.Command).json_schema()
    result["openapi.json"] = app.openapi()
    result["fixtures/companies.json"] = [COMPANY.model_dump(mode="json")]
    result["fixtures/agencies.json"] = [a.model_dump(mode="json") for a in AGENCIES]
    result["fixtures/procedures.json"] = [p.model_dump(mode="json") for p in PROCEDURES]
    result["fixtures/commands.json"] = command_examples()
    result["fixtures/decision.json"] = DECISION_EXAMPLE.model_dump(mode="json")
    event_examples = list(EVENTS)
    event_examples.append(m.Event(
        id=uid("decision-event"), company_id=COMPANY.id, dossier_id=DECISION_EXAMPLE.dossier_id,
        node_id=DECISION_EXAMPLE.node_id, actor=DECISION_EXAMPLE.actor,
        correlation_id=uid("decision-correlation"), idempotency_key=DECISION_EXAMPLE.idempotency_key,
        aggregate_version=2, occurred_at=NOW,
        payload=m.DecisionAppended(type="decision_appended", decision=DECISION_EXAMPLE)))
    event_examples.append(m.Event(
        id=uid("receipt-event"), company_id=COMPANY.id, dossier_id=DETAILS[0].dossier.id,
        node_id=DETAILS[0].nodes[-1].node_id, actor=SERVICE_ACTOR,
        correlation_id=uid("receipt-correlation"), idempotency_key="receipt-example",
        aggregate_version=3, occurred_at=NOW,
        payload=m.SubmissionReceipt(type="submission_receipt", receipt_id=uid("receipt"),
                                    package_snapshot_id=uid("package"), mode="simulated_agency", status="delivered")))
    result["fixtures/events.json"] = [e.model_dump(mode="json") for e in event_examples]
    for detail in DETAILS:
        # Validate references even if fixture construction used model_copy.
        payload = detail.model_dump(mode="json")
        m.DossierDetail.model_validate(payload)
        result[f"fixtures/{detail.dossier.agency.lower()}-dossier.json"] = payload
    result["node-catalog.json"] = {
        "schema_version": m.CONTRACT_VERSION,
        "states_by_type": {kind: sorted(states) for kind, states in m.NODE_STATES.items()},
        "axes": {"readiness": list(m.Readiness), "agency_acceptance": list(m.AgencyAcceptance),
                 "prerequisite_status": list(m.PrerequisiteStatus)},
        "semantics": {
            "completed": "Node work finished; does not imply agency acceptance or prerequisite satisfaction.",
            "unknown": "Insufficient authoritative evidence; never infer non-filing.",
            "blockers": "Block only the specified action for a verified applicable dependency; synthetic gates are demo-only.",
            "remediation": "A prerequisite wait must preserve permitted view, upload, correction and review actions.",
        },
    }
    result["event-catalog.json"] = {
        "schema_version": m.CONTRACT_VERSION,
        "status": "proposed_for_team_review",
        "transport": {"commands": "Temporal Workflow Update proposed; workflow service owns implementation",
                      "events": "Transactional outbox to API projections; delivery is at least once",
                      "workflow_id": "dossier/{dossier_id}",
                      "history": "References and validated structured fields only; no raw documents or credentials"},
        "commands": {
            "evidence_changed": "Reference immutable evidence version; invalidate dependent findings",
            "review_requested": "Request review without granting agency acceptance",
            "decision_recorded": "Append officer decision; serialize resulting transition",
            "prerequisite_changed": "Reassess affected actions using source-backed obligation status",
            "submission_requested": "Require explicit confirmation, current version and fresh gate evaluation",
            "resubmission_requested": "New immutable package snapshot after requested corrections",
            "cancellation_requested": "Cancel eligible active workflow; preserve history",
        },
        "events": {
            "projection_changed": "Versioned dossier projection plus changed nodes and invalidated findings",
            "decision_appended": "Immutable agency-scoped decision",
            "submission_receipt": "Delivery receipt is separate from agency acceptance; simulated mode explicit",
        },
        "ordering": "All events share one monotonically increasing per-dossier aggregate_version. Apply v=N+1; ignore known event IDs; buffer gaps and rebuild from authorized snapshot/replay. Never silently skip a gap.",
        "idempotency": "Scope: company_id + dossier_id + actor.id + idempotency_key. Same payload returns original acknowledgement; different payload is 409 idempotency_conflict. Deduplicate before stale-version rejection. Transport retries reuse IDs/keys.",
        "concurrency": "Temporal serializes every accepted command per dossier. expected_version mismatch is 409 version_conflict. API projections never originate lifecycle changes.",
        "acknowledgement": "202 means accepted for processing, not completed. Read projection/events until resulting version arrives.",
        "authority": "API resolves authenticated actor; client actor is not authorization. Workflow service-only events cannot be submitted by business clients. Agent cannot record officer decisions or confirm submission on behalf of the user.",
        "review_transitions": [
            {"command": "submission_requested", "from": "not_submitted", "to": "pending"},
            {"command": "decision_recorded:request_modification", "from": "pending", "to": "modification_requested"},
            {"command": "resubmission_requested", "from": "modification_requested", "to": "pending"},
            {"command": "decision_recorded:accept", "from": "pending", "to": "accepted"},
            {"command": "decision_recorded:refuse", "from": "pending", "to": "refused"},
        ],
        "transition_errors": "Other review transitions are 409; cancellation preserves acceptance/decisions and closes lifecycle as cancelled. Worker recovery is not a new user transition.",
    }
    result["ownership.json"] = {
        "status": "proposed_not_yet_agreed",
        "contracts_owner": "Arbi",
        "required_reviewers": ["Jawher", "Mouayed"],
        "boundaries": {
            "Arbi": "API authorization, company/evidence storage, read projections, readiness and action-specific dependency policy",
            "Mouayed": "Temporal transition serialization, durable activities, event delivery, sandbox and infrastructure",
            "Jawher": "Graphiti source-backed context and explicitly approved procedure/rule versions; agent proposals cannot mutate authoritative lifecycle",
            "Aziz": "Frontend consumes API projections and allowed_actions; no client inference of legal gates or agency acceptance",
        },
        "versioning": "Pin procedure_version_id on every dossier. A new rule version requests explicit reassessment; never silently mutate prior decisions. Breaking wire changes require a new schema_version and coordinated consumer migration.",
    }
    return result


def main():
    outputs = artifacts()
    for name, payload in outputs.items():
        path = ROOT / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Exported {len(outputs)} deterministic contract artifacts.")


if __name__ == "__main__":
    main()
