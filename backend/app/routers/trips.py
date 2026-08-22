"""Trip endpoints (spec section 27, /trips)."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Query

from app.core import responses
from app.core.deps import CurrentUser, DbSession, Pagination
from app.core.exceptions import ValidationError
from app.models.enums import ExpenseCategory, TripStatus
from app.schemas.common import ReorderRequest
from app.schemas.logistics import (
    ExpenseCreateRequest,
    ExpenseResponse,
    TransportCreateRequest,
    TransportResponse,
)
from app.schemas.stop import (
    ItineraryDay,
    StopCreateRequest,
    StopDetail,
    StopResponse,
)
from app.schemas.trip import (
    ShareResponse,
    TripCreateRequest,
    TripDetail,
    TripSummary,
    TripUpdateRequest,
)
from app.services.budget_service import BudgetService
from app.services.itinerary_service import ItineraryService
from app.services.logistics_service import LogisticsService
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


@router.get("/{trip_id}/stops", summary="List the trip's stops")
async def list_stops(trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    stops = await ItineraryService(db).list_stops(trip_id, current_user)
    return responses.success(
        {"items": [StopDetail(**s).model_dump() for s in stops]}, "OK"
    )


@router.post("/{trip_id}/stops", summary="Add a stop", status_code=201)
async def add_stop(
    trip_id: uuid.UUID,
    payload: StopCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    stop, warnings = await ItineraryService(db).add_stop(
        trip_id, payload, current_user
    )
    return responses.success(
        StopDetail(**stop).model_dump(),
        "Stop added successfully",
        status_code=201,
        warnings=warnings,
    )


@router.put("/{trip_id}/stops/reorder", summary="Reorder the trip's stops")
async def reorder_stops(
    trip_id: uuid.UUID,
    payload: ReorderRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Takes the complete ordering and applies it in one transaction."""
    stops = await ItineraryService(db).reorder_stops(
        trip_id, payload.ordered_ids, current_user
    )
    return responses.success(
        {"items": [StopDetail(**s).model_dump() for s in stops]},
        "Stops reordered successfully",
    )


@router.get("/{trip_id}/itinerary", summary="Day-by-day itinerary")
async def get_itinerary(
    trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession
):
    """Spec section 13: activities grouped by day across every stop."""
    data = await ItineraryService(db).itinerary(trip_id, current_user)
    data["days"] = [ItineraryDay(**d).model_dump() for d in data["days"]]
    data["stops"] = [StopResponse(**s).model_dump() for s in data["stops"]]
    return responses.success(data, "OK")


@router.get("/{trip_id}/budget", summary="Budget summary")
async def get_budget(trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    """Spec section 14: planned estimate vs actual spend, by category."""
    return responses.success(
        await BudgetService(db).budget(trip_id, current_user), "OK"
    )


@router.get("/{trip_id}/calendar", summary="Calendar events for the trip")
async def get_calendar(
    trip_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
    month: Annotated[int | None, Query(ge=1, le=12)] = None,
    year: Annotated[int | None, Query(ge=1970, le=2200)] = None,
):
    """Spec section 17. ``month`` and ``year`` must be supplied together."""
    if (month is None) != (year is None):
        raise ValidationError(
            "month and year must be provided together",
            details={"fields": {"month": "Provide both month and year, or neither"}},
        )
    return responses.success(
        await BudgetService(db).calendar(
            trip_id, current_user, month=month, year=year
        ),
        "OK",
    )


@router.get("/{trip_id}/expenses", summary="List expenses")
async def list_expenses(
    trip_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
    page: Pagination,
    category: ExpenseCategory | None = None,
):
    rows, total, total_amount = await LogisticsService(db).list_expenses(
        trip_id,
        current_user,
        offset=page.offset,
        limit=page.limit,
        category=category,
    )
    return responses.success(
        {
            "items": [
                ExpenseResponse.model_validate(e).model_dump() for e in rows
            ],
            "pagination": {
                "page": page.page,
                "limit": page.limit,
                "total": total,
                "total_pages": (total + page.limit - 1) // page.limit,
            },
            "total_amount": total_amount,
        },
        "OK",
    )


@router.post("/{trip_id}/expenses", summary="Record an expense", status_code=201)
async def add_expense(
    trip_id: uuid.UUID,
    payload: ExpenseCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    expense = await LogisticsService(db).add_expense(
        trip_id, payload, current_user
    )
    return responses.success(
        ExpenseResponse.model_validate(expense).model_dump(),
        "Expense recorded successfully",
        status_code=201,
    )


@router.get("/{trip_id}/transport", summary="List transport legs")
async def list_transport(
    trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession
):
    rows = await LogisticsService(db).list_transport(trip_id, current_user)
    return responses.success(
        {"items": [TransportResponse(**t).model_dump() for t in rows]}, "OK"
    )


@router.post("/{trip_id}/transport", summary="Add a transport leg", status_code=201)
async def add_transport(
    trip_id: uuid.UUID,
    payload: TransportCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    row = await LogisticsService(db).add_transport(trip_id, payload, current_user)
    return responses.success(
        TransportResponse(**row).model_dump(),
        "Transport added successfully",
        status_code=201,
    )


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
