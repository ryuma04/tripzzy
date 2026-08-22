"""Stop and itinerary-activity endpoints (spec section 27, /stops)."""

import uuid

from fastapi import APIRouter

from app.core import responses
from app.core.deps import CurrentUser, DbSession
from app.schemas.common import ReorderRequest
from app.schemas.stop import (
    ItineraryActivityCreateRequest,
    ItineraryActivityResponse,
    ItineraryActivityUpdateRequest,
    StopDetail,
    StopUpdateRequest,
)
from app.services.itinerary_service import ItineraryService

router = APIRouter(prefix="/stops", tags=["stops"])


@router.get("/{stop_id}", summary="Stop detail")
async def get_stop(stop_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    service = ItineraryService(db)
    stop = await service.get_owned_stop(stop_id, current_user)
    await db.refresh(stop, ["activities"])
    return responses.success(
        StopDetail(**service.stop_out(stop, include_activities=True)).model_dump(),
        "OK",
    )


@router.put("/{stop_id}", summary="Update a stop")
async def update_stop(
    stop_id: uuid.UUID,
    payload: StopUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    stop, warnings = await ItineraryService(db).update_stop(
        stop_id, payload, current_user
    )
    return responses.success(
        StopDetail(**stop).model_dump(), "Stop updated successfully",
        warnings=warnings,
    )


@router.delete("/{stop_id}", summary="Remove a stop")
async def delete_stop(stop_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    await ItineraryService(db).delete_stop(stop_id, current_user)
    return responses.success(None, "Stop removed successfully")


@router.get("/{stop_id}/activities", summary="Activities at a stop")
async def list_activities(
    stop_id: uuid.UUID, current_user: CurrentUser, db: DbSession
):
    service = ItineraryService(db)
    stop = await service.get_owned_stop(stop_id, current_user)
    await db.refresh(stop, ["activities"])
    activities = sorted(stop.activities, key=lambda a: (a.activity_date, a.order_index))
    return responses.success(
        {
            "items": [
                ItineraryActivityResponse.model_validate(a).model_dump()
                for a in activities
            ]
        },
        "OK",
    )


@router.post("/{stop_id}/activities", summary="Add an activity", status_code=201)
async def add_activity(
    stop_id: uuid.UUID,
    payload: ItineraryActivityCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    activity, warnings = await ItineraryService(db).add_activity(
        stop_id, payload, current_user
    )
    return responses.success(
        ItineraryActivityResponse.model_validate(activity).model_dump(),
        "Activity added successfully",
        status_code=201,
        warnings=warnings,
    )


@router.put("/{stop_id}/activities/reorder", summary="Reorder activities")
async def reorder_activities(
    stop_id: uuid.UUID,
    payload: ReorderRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    activities = await ItineraryService(db).reorder_activities(
        stop_id, payload.ordered_ids, current_user
    )
    return responses.success(
        {
            "items": [
                ItineraryActivityResponse.model_validate(a).model_dump()
                for a in activities
            ]
        },
        "Activities reordered successfully",
    )
