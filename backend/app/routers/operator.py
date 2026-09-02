"""The tour operator console.

Every endpoint is scoped to the caller's own operator, resolved from their
membership. No route accepts an ``operator_id`` -- that is the point: there is
no parameter a caller could change to see another operator's customers,
vendors or money.
"""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Path, Query

from app.core import responses
from app.core.deps import DbSession, OperatorContext, OperatorManager, Pagination
from app.models.enums import BookingStatus, TourGroupStatus
from app.schemas.operator import (
    AddToGroupRequest,
    AssignCoordinatorRequest,
    CoordinatorRow,
    CustomerRow,
    OperatorBookingRow,
    OperatorDashboard,
    OperatorProfile,
    PaymentRow,
    ScheduleResponse,
    TourGroupCreateRequest,
    TourGroupRow,
    TourGroupStatusRequest,
    VendorRow,
    VendorServiceRow,
)
from app.services.operator_service import OperatorService

router = APIRouter(prefix="/operator", tags=["operator"])


@router.get("/me", summary="Your operator and your role in it")
async def operator_profile(membership: OperatorContext, db: DbSession):
    profile = await OperatorService(db, membership).profile()
    return responses.success(OperatorProfile(**profile).model_dump(), "OK")


@router.get("/dashboard", summary="Operations overview")
async def dashboard(membership: OperatorContext, db: DbSession):
    """Operational rather than vanity metrics.

    ``unstaffed_departures`` is the one to act on: a departure with nobody
    assigned to run it.
    """
    data = await OperatorService(db, membership).dashboard()
    return responses.success(OperatorDashboard(**data).model_dump(), "OK")


@router.get("/customers", summary="Everyone who has booked with you")
async def customers(
    membership: OperatorContext,
    db: DbSession,
    pagination: Pagination,
    q: Annotated[str | None, Query(max_length=100)] = None,
):
    items, total = await OperatorService(db, membership).customers(
        offset=pagination.offset, limit=pagination.limit, q=q
    )
    return responses.paginated(
        [CustomerRow(**c).model_dump() for c in items],
        page=pagination.page,
        limit=pagination.limit,
        total=total,
    )


@router.get("/bookings", summary="Bookings placed with you")
async def bookings(
    membership: OperatorContext,
    db: DbSession,
    pagination: Pagination,
    status: Annotated[BookingStatus | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
):
    items, total = await OperatorService(db, membership).bookings(
        offset=pagination.offset, limit=pagination.limit, status=status, q=q
    )
    return responses.paginated(
        [OperatorBookingRow(**b).model_dump() for b in items],
        page=pagination.page,
        limit=pagination.limit,
        total=total,
    )


@router.get("/schedule", summary="What has to happen, day by day")
async def schedule(
    membership: OperatorContext,
    db: DbSession,
    start: Annotated[date | None, Query()] = None,
    days: Annotated[int, Query(ge=1, le=90)] = 14,
):
    data = await OperatorService(db, membership).schedule(
        start=start or date.today(), days=days
    )
    return responses.success(ScheduleResponse(**data).model_dump(), "OK")


@router.get("/vendors", summary="Your vendor book")
async def vendors(
    membership: OperatorContext,
    db: DbSession,
    pagination: Pagination,
    q: Annotated[str | None, Query(max_length=100)] = None,
):
    items, total = await OperatorService(db, membership).vendors(
        offset=pagination.offset, limit=pagination.limit, q=q
    )
    return responses.paginated(
        [VendorRow(**v).model_dump() for v in items],
        page=pagination.page,
        limit=pagination.limit,
        total=total,
    )


@router.get("/vendors/{vendor_id}/services", summary="What a vendor sells")
async def vendor_services(
    vendor_id: Annotated[uuid.UUID, Path()],
    membership: OperatorContext,
    db: DbSession,
    pagination: Pagination,
):
    items, total = await OperatorService(db, membership).vendor_services(
        vendor_id, offset=pagination.offset, limit=pagination.limit
    )
    return responses.paginated(
        [VendorServiceRow(**s).model_dump() for s in items],
        page=pagination.page,
        limit=pagination.limit,
        total=total,
    )


@router.get("/coordinators", summary="Your roster and their current load")
async def coordinators(membership: OperatorContext, db: DbSession):
    rows = await OperatorService(db, membership).coordinators()
    return responses.success(
        [CoordinatorRow(**c).model_dump() for c in rows], "OK"
    )


# --------------------------------------------------------------------------
# Departures
# --------------------------------------------------------------------------

@router.get("/tour-groups", summary="Departures")
async def tour_groups(
    membership: OperatorContext,
    db: DbSession,
    pagination: Pagination,
    status: Annotated[TourGroupStatus | None, Query()] = None,
):
    items, total = await OperatorService(db, membership).tour_groups(
        offset=pagination.offset, limit=pagination.limit, status=status
    )
    return responses.paginated(
        [TourGroupRow(**g).model_dump() for g in items],
        page=pagination.page,
        limit=pagination.limit,
        total=total,
    )


@router.post("/tour-groups", summary="Create a departure", status_code=201)
async def create_tour_group(
    payload: TourGroupCreateRequest,
    membership: OperatorManager,
    db: DbSession,
):
    group = await OperatorService(db, membership).create_tour_group(payload)
    return responses.success(
        TourGroupRow(**group).model_dump(), "Departure created", status_code=201
    )


@router.put(
    "/tour-groups/{group_id}/coordinator", summary="Assign or unassign a coordinator"
)
async def assign_coordinator(
    group_id: Annotated[uuid.UUID, Path()],
    payload: AssignCoordinatorRequest,
    membership: OperatorManager,
    db: DbSession,
):
    group = await OperatorService(db, membership).assign_coordinator(
        group_id, payload.coordinator_id
    )
    return responses.success(
        TourGroupRow(**group).model_dump(),
        "Coordinator assigned" if payload.coordinator_id else "Coordinator removed",
    )


@router.put("/tour-groups/{group_id}/status", summary="Update a departure's status")
async def set_group_status(
    group_id: Annotated[uuid.UUID, Path()],
    payload: TourGroupStatusRequest,
    membership: OperatorContext,
    db: DbSession,
):
    group = await OperatorService(db, membership).set_group_status(
        group_id, payload.status
    )
    return responses.success(TourGroupRow(**group).model_dump(), "Status updated")


@router.post("/tour-groups/{group_id}/members", summary="Put a booking on a departure")
async def add_to_group(
    group_id: Annotated[uuid.UUID, Path()],
    payload: AddToGroupRequest,
    membership: OperatorContext,
    db: DbSession,
):
    group = await OperatorService(db, membership).add_booking_to_group(
        group_id, payload.booking_id, payload.seats
    )
    return responses.success(TourGroupRow(**group).model_dump(), "Added to departure")


@router.delete(
    "/tour-groups/{group_id}/members/{member_id}",
    summary="Take a booking off a departure",
)
async def remove_from_group(
    group_id: Annotated[uuid.UUID, Path()],
    member_id: Annotated[uuid.UUID, Path()],
    membership: OperatorContext,
    db: DbSession,
):
    group = await OperatorService(db, membership).remove_booking_from_group(
        group_id, member_id
    )
    return responses.success(
        TourGroupRow(**group).model_dump(), "Removed from departure"
    )


# --------------------------------------------------------------------------
# Money
# --------------------------------------------------------------------------

@router.get("/payments", summary="Payments ledger")
async def payments(
    membership: OperatorContext, db: DbSession, pagination: Pagination
):
    items, total, totals = await OperatorService(db, membership).payments(
        offset=pagination.offset, limit=pagination.limit
    )
    payload = {
        "items": [PaymentRow(**p).model_dump() for p in items],
        "pagination": responses.PaginationMeta.build(
            page=pagination.page, limit=pagination.limit, total=total
        ).model_dump(),
        "totals": totals,
    }
    return responses.success(payload, "OK")
