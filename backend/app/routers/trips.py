"""Trip endpoints (spec section 27, /trips)."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Query

from app.core import responses
from app.core.deps import CurrentUser, DbSession, Pagination
from app.models.enums import TripStatus
from app.schemas.trip import (
    ShareResponse,
    TripCreateRequest,
    TripDetail,
    TripSummary,
    TripUpdateRequest,
)
from app.services.trip_service import TripService

router = APIRouter(prefix="/trips", tags=["trips"])

SortBy = Literal["created_at", "updated_at", "start_date", "end_date", "title", "budget"]


@router.get("", summary="List your trips")
async def list_trips(
    current_user: CurrentUser,
    db: DbSession,
    page: Pagination,
    status: Annotated[
        TripStatus | None, Query(description="Filter by computed status")
    ] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    sort_by: SortBy = "start_date",
    sort_order: Literal["asc", "desc"] = "desc",
):
    """Spec section 10: Ongoing / Upcoming / Completed, plus draft.

    ``status`` is recomputed from the trip's dates and stop count on every
    read, so a stale value from the client can never influence the result.
    """
    items, total = await TripService(db).list_for_user(
        current_user,
        offset=page.offset,
        limit=page.limit,
        status=status,
        q=q,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return responses.paginated(
        [TripSummary(**i).model_dump() for i in items],
        page=page.page,
        limit=page.limit,
        total=total,
    )


@router.post("", summary="Create a trip", status_code=201)
async def create_trip(
    payload: TripCreateRequest, current_user: CurrentUser, db: DbSession
):
    trip = await TripService(db).create(payload, current_user)
    return responses.success(
        TripDetail(**trip).model_dump(), "Trip created successfully", status_code=201
    )


@router.get("/{trip_id}", summary="Trip detail")
async def get_trip(trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    trip = await TripService(db).detail(trip_id, current_user)
    return responses.success(TripDetail(**trip).model_dump(), "OK")


@router.put("/{trip_id}", summary="Update a trip")
async def update_trip(
    trip_id: uuid.UUID,
    payload: TripUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
    cascade: Annotated[
        bool,
        Query(
            description="Clamp stops and activities that the new dates would "
            "leave outside the trip, instead of rejecting the change"
        ),
    ] = False,
):
    trip = await TripService(db).update(
        trip_id, payload, current_user, cascade=cascade
    )
    return responses.success(
        TripDetail(**trip).model_dump(), "Trip updated successfully"
    )


@router.delete("/{trip_id}", summary="Delete a trip")
async def delete_trip(trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    await TripService(db).delete(trip_id, current_user)
    return responses.success(None, "Trip deleted successfully")


@router.post("/{trip_id}/share", summary="Publish a trip to the community")
async def share_trip(trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    trip = await TripService(db).enable_share(trip_id, current_user)
    return responses.success(
        ShareResponse(
            share_slug=trip.share_slug,
            share_url=f"/t/{trip.share_slug}",
            is_public=True,
        ).model_dump(),
        "Trip shared successfully",
    )


@router.delete("/{trip_id}/share", summary="Unpublish a trip")
async def unshare_trip(trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    await TripService(db).disable_share(trip_id, current_user)
    return responses.success(None, "Trip is no longer shared")
