import json
from copy import deepcopy
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator, FormatChecker
from pydantic import TypeAdapter, ValidationError

from contracts.export import artifacts, command_examples
from contracts.fixtures import COMPANY, DECISION_EXAMPLE, DETAILS, EVENTS, PROCEDURES, uid
from contracts.mock_api import app
from contracts.models import (
    Action, AgencyAcceptance, Command, DossierDetail, Event, Node, NodeType,
    ObligationStatus, PrerequisiteStatus, ProcedureVersion, ReviewDecision,
)

ROOT = Path(__file__).resolve().parents[1]
CLIENT = TestClient(app)


def test_generated_artifacts_are_current():
    for name, expected in artifacts().items():
        assert json.loads((ROOT / "contracts" / name).read_text(encoding="utf-8")) == expected, name


def test_fixture_json_schemas_and_relations():
    outputs = artifacts()
    for name in ("DossierDetail", "Event", "Command", "ReviewDecision"):
        schema = outputs[f"schemas/{name}.schema.json"]
        Draft202012Validator.check_schema(schema)
        validator = Draft202012Validator(schema, format_checker=FormatChecker())
        examples = {
            "DossierDetail": [d.model_dump(mode="json") for d in DETAILS],
            "Event": outputs["fixtures/events.json"],
            "Command": outputs["fixtures/commands.json"],
            "ReviewDecision": [outputs["fixtures/decision.json"]],
        }[name]
        for value in examples:
            validator.validate(value)
    for detail in DETAILS:
        assert len(detail.nodes) == 8
        assert {n.type for n in detail.nodes} == set(NodeType)
        DossierDetail.model_validate_json(detail.model_dump_json())


def test_ready_is_not_agency_accepted():
    dossier = DETAILS[0].dossier
    assert dossier.readiness == "ready"
    assert dossier.agency_acceptance == AgencyAcceptance.NOT_SUBMITTED


def test_unknown_and_unsatisfied_preserve_remediation():
    for detail in DETAILS[1:]:
        submission = next(n for n in detail.nodes if n.type == NodeType.SUBMISSION)
        evidence = next(n for n in detail.nodes if n.type == NodeType.DOCUMENT_EVIDENCE)
        assert Action.SUBMIT not in submission.allowed_actions
        assert submission.blockers
        assert {Action.VIEW, Action.UPLOAD_EVIDENCE, Action.CORRECT_EVIDENCE, Action.REQUEST_REVIEW} <= set(evidence.allowed_actions)
    assert DETAILS[2].obligations[0].status == PrerequisiteStatus.UNKNOWN


@pytest.mark.parametrize("status", ["satisfied", "unsatisfied", "not_applicable"])
def test_missing_evidence_never_becomes_authoritative_status(status):
    value = DETAILS[2].obligations[0].model_dump(mode="json")
    value["status"] = status
    with pytest.raises(ValidationError, match="unknown"):
        ObligationStatus.model_validate(value)


def test_synthetic_rules_cannot_be_published():
    value = PROCEDURES[0].model_dump(mode="json")
    value.update(status="approved", approved_by={"id": str(uid("maintainer")), "kind": "rule_maintainer"},
                 approved_at="2026-09-12T12:00:00Z")
    with pytest.raises(ValidationError, match="synthetic"):
        ProcedureVersion.model_validate(value)


def test_cross_agency_review_is_rejected():
    value = DECISION_EXAMPLE.model_dump(mode="json")
    value["actor"]["agency"] = "RNE"
    with pytest.raises(ValidationError, match="same agency"):
        ReviewDecision.model_validate(value)


@pytest.mark.parametrize("mutation", ["scope", "stale", "cycle", "missing_requirement"])
def test_invalid_dossier_graph_is_rejected(mutation):
    value = DETAILS[0].model_dump(mode="json")
    if mutation == "scope":
        value["evidence"][0]["company_id"] = str(uid("other-company"))
    elif mutation == "stale":
        value["dossier"]["version"] = 2
    elif mutation == "cycle":
        value["nodes"][0]["dependencies"] = [value["nodes"][-1]["node_id"]]
    else:
        value["evidence"][0]["requirement_ids"] = [str(uid("unknown"))]
    with pytest.raises(ValidationError):
        DossierDetail.model_validate(value)


def test_invalid_node_state_and_blocked_allowed_action():
    value = DETAILS[0].nodes[0].model_dump(mode="json")
    value["state"] = "blocked"
    with pytest.raises(ValidationError, match="node type"):
        Node.model_validate(value)
    value = DETAILS[1].nodes[-1].model_dump(mode="json")
    value["allowed_actions"].append("submit")
    with pytest.raises(ValidationError, match="blocked actions"):
        Node.model_validate(value)


@pytest.mark.parametrize("field", ["company_id", "dossier_id", "node_id", "idempotency_key", "expected_version"])
def test_nested_command_context_must_match(field):
    value = next(c for c in command_examples() if c["type"] == "decision_recorded")
    value[field] = 2 if field == "expected_version" else str(uid("mismatch"))
    with pytest.raises(ValidationError):
        TypeAdapter(Command).validate_python(value)


def test_event_cannot_project_another_company_or_version():
    for field, new_value in [("company_id", str(uid("other"))), ("aggregate_version", 2)]:
        value = EVENTS[0].model_dump(mode="json")
        value[field] = new_value
        with pytest.raises(ValidationError):
            Event.model_validate(value)


def test_unknown_fields_and_unconfirmed_submission_rejected():
    value = next(c for c in command_examples() if c["type"] == "submission_requested")
    value["user_confirmed"] = False
    with pytest.raises(ValidationError):
        TypeAdapter(Command).validate_python(value)
    value = command_examples()[0]
    value["override_eligibility"] = True
    with pytest.raises(ValidationError):
        TypeAdapter(Command).validate_python(value)


def test_mock_routes_match_fixtures():
    assert len(CLIENT.get("/api/v1/agencies").json()) == 3
    assert len(CLIENT.get("/api/v1/procedures").json()) == 3
    assert CLIENT.get(f"/api/v1/companies/{COMPANY.id}").status_code == 200
    assert len(CLIENT.get(f"/api/v1/companies/{COMPANY.id}/dossiers").json()) == 3
    for detail in DETAILS:
        prefix = f"/api/v1/dossiers/{detail.dossier.id}"
        response = CLIENT.get(prefix)
        assert response.status_code == 200
        DossierDetail.model_validate(response.json())
        assert CLIENT.get(f"{prefix}/nodes/{detail.nodes[0].node_id}").status_code == 200
        assert len(CLIENT.get(f"/api/v1/agencies/{detail.dossier.agency}/dossiers").json()) == 1
        assert len(CLIENT.get(f"{prefix}/events").json()) == 1
        assert CLIENT.get(f"{prefix}/events?after_version=1").json() == []


def test_mock_never_pretends_to_execute_commands():
    before = deepcopy(DETAILS[0].model_dump())
    for command in command_examples():
        response = CLIENT.post(f"/api/v1/dossiers/{command['dossier_id']}/commands", json=command)
        assert response.status_code == 501
        assert response.json()["code"] == "not_implemented"
    assert DETAILS[0].model_dump() == before


def test_mock_reports_invalid_scope_and_request():
    command = command_examples()[0]
    assert CLIENT.post(f"/api/v1/dossiers/{uid('other')}/commands", json=command).status_code == 422
    command["company_id"] = str(uid("other"))
    assert CLIENT.post(f"/api/v1/dossiers/{command['dossier_id']}/commands", json=command).status_code == 404
    assert CLIENT.get("/api/v1/dossiers/not-a-uuid").json()["code"] == "validation_error"
    assert CLIENT.get(f"/api/v1/dossiers/{uid('missing')}").status_code == 404


def test_openapi_has_typed_commands_and_errors():
    schema = CLIENT.get("/openapi.json").json()
    operation = schema["paths"]["/api/v1/dossiers/{dossier_id}/commands"]["post"]
    assert operation["requestBody"]["content"]["application/json"]["schema"]["discriminator"]["propertyName"] == "type"
    assert {"202", "403", "409", "422", "501"} <= operation["responses"].keys()
