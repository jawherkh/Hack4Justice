"""Read-only contract preview. No auth, writes, credentials or external connections."""

from uuid import UUID

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from contracts.fixtures import AGENCIES, COMPANY, DETAILS, EVENTS, PROCEDURES
from contracts.models import (
    Agency, AgencyCode, Command, CommandAcknowledgement, Company, Dossier,
    DossierDetail, ErrorResponse, Event, Node, ProcedureVersion,
)

app = FastAPI(title="Hack4Justice contract preview", version="0.1.0",
              description="Synthetic read-only fixtures. Commands return 501. Not a production backend.")


@app.exception_handler(RequestValidationError)
async def invalid_request(request, exc):
    return JSONResponse(status_code=422, content={"code": "validation_error", "message": "Request does not match the contract."})


def error(status, code, message):
    return JSONResponse(status_code=status, content=ErrorResponse(code=code, message=message).model_dump(mode="json"))


READ_ERRORS = {404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}}


@app.get("/api/v1/agencies", response_model=list[Agency], tags=["Catalog"])
def agencies():
    return AGENCIES


@app.get("/api/v1/procedures", response_model=list[ProcedureVersion], tags=["Catalog"])
def procedures():
    return PROCEDURES


@app.get("/api/v1/companies/{company_id}", response_model=Company, responses=READ_ERRORS, tags=["Companies"])
def company(company_id: UUID):
    return COMPANY if company_id == COMPANY.id else error(404, "not_found", "Company not found")


@app.get("/api/v1/companies/{company_id}/dossiers", response_model=list[Dossier], responses=READ_ERRORS, tags=["Dossiers"])
def dossiers(company_id: UUID):
    if company_id != COMPANY.id:
        return error(404, "not_found", "Company not found")
    return [d.dossier for d in DETAILS]


@app.get("/api/v1/dossiers/{dossier_id}", response_model=DossierDetail, responses=READ_ERRORS, tags=["Dossiers"])
def dossier(dossier_id: UUID):
    return next((d for d in DETAILS if d.dossier.id == dossier_id), None) or error(404, "not_found", "Dossier not found")


@app.get("/api/v1/dossiers/{dossier_id}/nodes/{node_id}", response_model=Node, responses=READ_ERRORS, tags=["Dossiers"])
def node(dossier_id: UUID, node_id: UUID):
    return next((n for d in DETAILS if d.dossier.id == dossier_id for n in d.nodes if n.node_id == node_id), None) or error(404, "not_found", "Node not found")


@app.get("/api/v1/agencies/{agency}/dossiers", response_model=list[Dossier], responses=READ_ERRORS, tags=["Agency"])
def queue(agency: AgencyCode):
    return [d.dossier for d in DETAILS if d.dossier.agency == agency]


@app.get("/api/v1/dossiers/{dossier_id}/events", response_model=list[Event], responses=READ_ERRORS, tags=["Events"])
def events(dossier_id: UUID, after_version: int = 0):
    if not any(d.dossier.id == dossier_id for d in DETAILS):
        return error(404, "not_found", "Dossier not found")
    return [e for e in EVENTS if e.dossier_id == dossier_id and e.aggregate_version > after_version]


@app.post("/api/v1/dossiers/{dossier_id}/commands", response_model=CommandAcknowledgement,
          status_code=202, tags=["Lifecycle"],
          responses={s: {"model": ErrorResponse} for s in (403, 404, 409, 422, 501)},
          description="Production contract: authorize then dispatch to Temporal. This preview validates input and returns 501 without mutation.")
def command(dossier_id: UUID, body: Command):
    if dossier_id != body.dossier_id:
        return error(422, "validation_error", "Route and command dossier IDs differ")
    if not any(d.dossier.id == dossier_id and d.dossier.company_id == body.company_id for d in DETAILS):
        return error(404, "not_found", "Dossier not found in company scope")
    return error(501, "not_implemented", "Contract preview only; lifecycle command execution is not implemented.")
