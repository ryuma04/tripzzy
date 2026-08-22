"""Itinerary-activity mutations.

Deviation from spec section 27, deliberately: the spec lists both
``GET /activities/{id}`` (a catalog entry) and ``PUT/DELETE /activities/{id}``
(a scheduled activity inside somebody's trip) on the same path. Those are two
different entities with different owners and permissions, so sharing a URL
would be ambiguous and easy to get wrong. Catalog reads stay on
``/activities``; the user's own scheduled activities live here.
"""

import uuid

from fastapi import APIRouter

from app.core import responses
from app.core.deps import CurrentUser, DbSession
from app.schemas.stop import (
    ItineraryActivityResponse,
    ItineraryActivityUpdateRequest,
)
from app.services.itinerary_service import ItineraryService

router = APIRouter(prefix="/itinerary-activities", tags=["itinerary"])


@router.get("/{activity_id}", summary="Scheduled activity detail")
async def get_activity(
    activity_id: uuid.UUID, current_user: CurrentUser, db: DbSession
):
    activity = await ItineraryService(db).get_owned_activity(
        activity_id, current_user
    )
    return responses.success(
        ItineraryActivityResponse.model_validate(activity).model_dump(), "OK"
    )


@router.put("/{activity_id}", summary="Update a scheduled activity")
async def update_activity(
    activity_id: uuid.UUID,
    payload: ItineraryActivityUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    activity, warnings = await ItineraryService(db).update_activity(
        activity_id, payload, current_user
    )
    return responses.success(
        ItineraryActivityResponse.model_validate(activity).model_dump(),
        "Activity updated successfully",
        warnings=warnings,
    )


@router.delete("/{activity_id}", summary="Remove a scheduled activity")
async def delete_activity(
    activity_id: uuid.UUID, current_user: CurrentUser, db: DbSession
):
    await ItineraryService(db).delete_activity(activity_id, current_user)
    return responses.success(None, "Activity removed successfully")
