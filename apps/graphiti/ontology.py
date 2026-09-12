"""The first legal ontology used when extracting Tunisian regulatory sources."""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field


class LegalRule(BaseModel):
    code: Annotated[str | None, Field(description="Article, decree, tax code, or rule identifier")] = None
    jurisdiction: Annotated[str | None, Field(description="Jurisdiction or territorial scope")] = None
    effective_from: Annotated[str | None, Field(description="ISO date when the rule becomes effective")] = None
    effective_to: Annotated[str | None, Field(description="ISO date when the rule stops being effective")] = None


class Procedure(BaseModel):
    code: Annotated[str | None, Field(description="Procedure or form code")] = None
    agency_code: Annotated[str | None, Field(description="Responsible Tunisian agency code")] = None
    status: Annotated[str | None, Field(description="Candidate, approved, superseded, or synthetic")] = None


class Requirement(BaseModel):
    code: Annotated[str | None, Field(description="Requirement identifier")] = None
    description: Annotated[str | None, Field(description="What the business must provide or do")] = None
    evidence_type: Annotated[str | None, Field(description="Document or information needed as evidence")] = None
    minimum_count: Annotated[int | None, Field(ge=1, description="Minimum number of evidence items")] = None


class EvidenceDocument(BaseModel):
    document_type: Annotated[str | None, Field(description="Patente, quittance fiscale, extrait RNE, ID, or other evidence type")] = None
    issuing_agency: Annotated[str | None, Field(description="Agency that issued the evidence")] = None
    validity_period: Annotated[str | None, Field(description="Human-readable validity period")] = None


class Agency(BaseModel):
    code: Annotated[str | None, Field(description="DGI, RNE, or APII")] = None
    mandate: Annotated[str | None, Field(description="Agency responsibility in the procedure")] = None


class TaxObligation(BaseModel):
    tax_type: Annotated[str | None, Field(description="Tax or fiscal obligation type")] = None
    period: Annotated[str | None, Field(description="Monthly, quarterly, annual, or other period")] = None
    calculation_basis: Annotated[str | None, Field(description="Basis used to calculate the obligation")] = None


class Deadline(BaseModel):
    due_date: Annotated[str | None, Field(description="Calendar date or rule for determining the due date")] = None
    frequency: Annotated[str | None, Field(description="Filing frequency")] = None
    trigger: Annotated[str | None, Field(description="Event that starts the deadline clock")] = None


class BusinessEntity(BaseModel):
    legal_name: Annotated[str | None, Field(description="Registered business name")] = None
    legal_form: Annotated[str | None, Field(description="SARL, SUARL, SA, or other legal form")] = None
    registration_identifier: Annotated[str | None, Field(description="Registry or tax identifier")] = None


class LegalReference(BaseModel):
    citation: Annotated[str | None, Field(description="Citation to an article, decree, form, or official source")] = None
    source_uri: Annotated[str | None, Field(description="Official source URI when present")] = None


class AppliesTo(BaseModel):
    condition: Annotated[str | None, Field(description="Applicability condition")] = None


class Requires(BaseModel):
    condition: Annotated[str | None, Field(description="Condition under which the requirement applies")] = None


class SubmittedTo(BaseModel):
    channel: Annotated[str | None, Field(description="Desk, portal, API, or other submission channel")] = None


class HasDeadline(BaseModel):
    consequence: Annotated[str | None, Field(description="Consequence of missing the deadline")] = None


class Supersedes(BaseModel):
    reason: Annotated[str | None, Field(description="Why the older rule or procedure was replaced")] = None


class EvidencedBy(BaseModel):
    confidence: Annotated[str | None, Field(description="Explicit, inferred, or unknown provenance confidence")] = None


class PartOf(BaseModel):
    section: Annotated[str | None, Field(description="Containing section or procedure")] = None


class Imposes(BaseModel):
    basis: Annotated[str | None, Field(description="Legal basis for the obligation")] = None


class Exempts(BaseModel):
    condition: Annotated[str | None, Field(description="Exemption condition")] = None


ENTITY_TYPES = {
    "LegalRule": LegalRule,
    "Procedure": Procedure,
    "Requirement": Requirement,
    "EvidenceDocument": EvidenceDocument,
    "Agency": Agency,
    "TaxObligation": TaxObligation,
    "Deadline": Deadline,
    "BusinessEntity": BusinessEntity,
    "LegalReference": LegalReference,
}

EDGE_TYPES = {
    "APPLIES_TO": AppliesTo,
    "REQUIRES": Requires,
    "SUBMITTED_TO": SubmittedTo,
    "HAS_DEADLINE": HasDeadline,
    "SUPERSEDES": Supersedes,
    "EVIDENCED_BY": EvidencedBy,
    "PART_OF": PartOf,
    "IMPOSES": Imposes,
    "EXEMPTS": Exempts,
}

EDGE_TYPE_MAP = {("Entity", "Entity"): list(EDGE_TYPES)}

ONTOLOGY_VERSION = "0.1.0"
EXTRACTION_INSTRUCTIONS = """You are extracting a Tunisian regulatory knowledge graph.

Use the supplied legal source as the only authority. Extract only entities and
relations that are explicitly stated or directly supported by the passage. Do
not invent filing obligations, deadlines, penalties, agency responsibilities,
or applicability conditions. Preserve article and form identifiers exactly when
present. Mark uncertain information in the extracted attributes instead of
turning it into a definitive legal rule. Prefer these ontology types:
LegalRule, Procedure, Requirement, EvidenceDocument, Agency, TaxObligation,
Deadline, BusinessEntity, and LegalReference. Prefer these relations:
APPLIES_TO, REQUIRES, SUBMITTED_TO, HAS_DEADLINE, SUPERSEDES, EVIDENCED_BY,
PART_OF, IMPOSES, and EXEMPTS.
"""


def ontology_definition() -> dict[str, object]:
    """Return a frontend-safe ontology catalog for the future side panel."""

    return {
        "version": ONTOLOGY_VERSION,
        "purpose": "Source-backed ontology for Tunisian tax, registry, and licensing workflows.",
        "agencies": {
            "DGI": {"group_id": "dgi", "domain": "tax and fiscal compliance"},
            "RNE": {"group_id": "rne", "domain": "corporate registry and status updates"},
            "APII": {"group_id": "apii", "domain": "licensing and administrative approvals"},
        },
        "entity_types": [
            {"name": name, "schema": model.model_json_schema()}
            for name, model in ENTITY_TYPES.items()
        ],
        "edge_types": [
            {"name": name, "schema": model.model_json_schema()}
            for name, model in EDGE_TYPES.items()
        ],
        "provenance": {
            "required": ["document_id", "source_uri", "source_kind", "retrieved_at"],
            "promotion_rule": "Only official sources can support approved legal procedures.",
        },
    }
