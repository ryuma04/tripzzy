"""The traveller's side of dynamic tour management.

Assessing and submitting hang off a trip, because a change is always a change
*to* something; everything afterwards addresses the change request directly,
since it outlives any particular view of the trip.

The operator's half of this flow lives in ``routers/operator.py``, scoped to
the caller's own operator.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Path, Query

from app.core import responses
from app.core.deps import CurrentUser, DbSession, Pagination
from app.models.enums import ConflictSeverity
from app.schemas.adaptation import (
    AssessRequest,
    AssessResponse,
    ChangeRequestCreate,
    ChangeRequestResponse,
    ConflictCheckResponse,
)
from app.services.adaptation_service import AdaptationService
from app.services.ai_service import AIService
from app.services.conflict_service import ConflictService

trip_changes_router = APIRouter(prefix="/trips", tags=["adaptation"])
changes_router = APIRouter(prefix="/change-requests", tags=["adaptation"])


@trip_changes_router.post(
    "/{trip_id}/assess-change", summary="What would this change cost?"
)
async def assess_change(
    trip_id: Annotated[uuid.UUID, Path()],
    payload: AssessRequest,
    current_user: CurrentUser,
    db: DbSession,
    explain: Annotated[
        bool, Query(description="Also return a plain-language narration")
    ] = False,
):
    """Cost a proposed change without committing to it.

    Writes nothing: the proposed itinerary is simulated in memory so the
    conflict checks can run against it, then discarded. Every figure comes from
    the deterministic engine -- cancellation terms snapshotted at booking,
    published price overrides, live capacity. With ``explain=true`` the model
    narrates that report; it never produces it.
    """
    service = AdaptationService(db)
    proposal = payload.proposal.validated_for(payload.type)
    report = await service.assess(trip_id, proposal, payload.type, current_user)

    data = {"trip_id": trip_id, "impact": report.as_dict(), "ai_summary": None}
    if explain:
        trip = await service._trip(trip_id, current_user)
        data["ai_summary"] = await AIService().explain_impact(
            report.as_dict(), trip.title
        )

    return responses.success(
        AssessResponse(**data).model_dump(), "Impact assessed"
    )


@trip_changes_router.post(
    "/{trip_id}/change-requests", summary="Raise a change request", status_code=201
)
async def create_change_request(
    trip_id: Annotated[uuid.UUID, Path()],
    payload: ChangeRequestCreate,
    current_user: CurrentUser,
    db: DbSession,
):
    """Submit a change for the operator to decide on.

    The impact report is frozen onto the request at this moment. Prices and
    availability move between submitting and reviewing, and the operator must
    be approving the same numbers the traveller was shown.
    """
    request = await AdaptationService(db).submit(
        trip_id,
        change_type=payload.type,
        proposal=payload.proposal.validated_for(payload.type),
        reason=payload.reason,
        user=current_user,
    )
    return responses.success(
        ChangeRequestResponse(**AdaptationService.serialise(request)).model_dump(),
        "Change request submitted",
        status_code=201,
    )


@trip_changes_router.get(
    "/{trip_id}/conflicts", summary="Does this itinerary still hold together?"
)
async def trip_conflicts(
    trip_id: Annotated[uuid.UUID, Path()],
    current_user: CurrentUser,
    db: DbSession,
):
    """Every scheduling, dependency and commitment problem on one trip.

    Advisory in every case. A traveller who genuinely wants ninety minutes
    between landing and a walking tour is allowed to have it.
    """
    # Ownership first: the conflict service reports on any trip it is given.
    await AdaptationService(db)._trip(trip_id, current_user)
    conflicts = await ConflictService(db).check_trip(trip_id)
    return responses.success(
        ConflictCheckResponse(
            trip_id=trip_id,
            conflicts=[c.as_dict() for c in conflicts],
            blockers=sum(
                1 for c in conflicts if c.severity is ConflictSeverity.BLOCKER
            ),
            warnings=sum(
                1 for c in conflicts if c.severity is ConflictSeverity.WARNING
            ),
            notes=sum(1 for c in conflicts if c.severity is ConflictSeverity.INFO),
        ).model_dump(),
        "Itinerary checked",
    )


@changes_router.get("", summary="Your change requests")
async def list_change_requests(
    current_user: CurrentUser,
    db: DbSession,
    pagination: Pagination,
    trip_id: Annotated[uuid.UUID | None, Query()] = None,
):
    items, total = await AdaptationService(db).list_for_user(
        current_user,
        offset=pagination.offset,
        limit=pagination.limit,
        trip_id=trip_id,
    )
    return responses.paginated(
        [
            ChangeRequestResponse(**AdaptationService.serialise(r)).model_dump()
            for r in items
        ],
        page=pagination.page,
        limit=pagination.limit,
        total=total,
    )


@changes_router.get("/{request_id}", summary="One change request")
async def get_change_request(
    request_id: Annotated[uuid.UUID, Path()],
    current_user: CurrentUser,
    db: DbSession,
):
    request = await AdaptationService(db).get_owned(request_id, current_user)
    return responses.success(
        ChangeRequestResponse(**AdaptationService.serialise(request)).model_dump(),
        "OK",
    )


@changes_router.delete("/{request_id}", summary="Withdraw a change request")
async def withdraw_change_request(
    request_id: Annotated[uuid.UUID, Path()],
    current_user: CurrentUser,
    db: DbSession,
):
    """Take back a request the operator has not decided on yet."""
    request = await AdaptationService(db).withdraw(request_id, current_user)
    return responses.success(
        ChangeRequestResponse(**AdaptationService.serialise(request)).model_dump(),
        "Change request withdrawn",
    )
