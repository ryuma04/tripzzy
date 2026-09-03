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
from app.models.enums import (
    AssistThreadStatus,
    BookingStatus,
    ChangeRequestStatus,
    DisruptionStatus,
    TourGroupStatus,
)
from app.schemas.adaptation import (
    ChangeRequestResponse,
    DecisionRequest,
    DisruptionCreate,
    DisruptionResponse,
    DisruptionStatusRequest,
)
from app.schemas.engagement import (
    AssignThreadRequest,
    AssistThreadResponse,
    StaffReplyRequest,
    ThreadStatusRequest,
)
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
from app.services.adaptation_service import (
    AdaptationService,
    OperatorAdaptationService,
)
from app.services.assist_service import AssistService
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


# --------------------------------------------------------------------------
# Dynamic tour management
# --------------------------------------------------------------------------

@router.get("/change-requests", summary="Changes waiting on you")
async def change_requests(
    membership: OperatorContext,
    db: DbSession,
    pagination: Pagination,
    status: Annotated[ChangeRequestStatus | None, Query()] = None,
):
    """The queue, pending first.

    Each row carries the impact report exactly as the traveller saw it when
    they submitted -- not a recomputation. Approving means agreeing to those
    numbers, so those are the numbers shown.
    """
    items, total = await OperatorAdaptationService(db, membership).queue(
        offset=pagination.offset, limit=pagination.limit, status=status
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


@router.get("/change-requests/{request_id}", summary="One change in full")
async def change_request(
    request_id: Annotated[uuid.UUID, Path()],
    membership: OperatorContext,
    db: DbSession,
):
    request = await OperatorAdaptationService(db, membership).get_scoped(request_id)
    return responses.success(
        ChangeRequestResponse(**AdaptationService.serialise(request)).model_dump(),
        "OK",
    )


@router.post("/change-requests/{request_id}/decision", summary="Decide on a change")
async def decide_change_request(
    request_id: Annotated[uuid.UUID, Path()],
    payload: DecisionRequest,
    membership: OperatorContext,
    db: DbSession,
):
    """Approve, counter or reject.

    Approving **applies** the change in the same transaction: cancellations,
    refunds, replacement bookings and the itinerary rewrite all land together
    or none of them do. An approved-but-unapplied request is how a traveller
    ends up believing they have a hotel they do not have.
    """
    request = await OperatorAdaptationService(db, membership).decide(
        request_id,
        action=payload.action,
        note=payload.note,
        counter_proposal=(
            payload.counter_proposal.model_dump(exclude_none=True)
            if payload.counter_proposal
            else None
        ),
    )
    return responses.success(
        ChangeRequestResponse(**AdaptationService.serialise(request)).model_dump(),
        {
            "approve": "Change approved and applied",
            "counter": "Alternative proposed",
            "reject": "Change declined",
        }[payload.action],
    )


@router.get("/disruptions", summary="Incidents affecting your tours")
async def disruptions(
    membership: OperatorContext,
    db: DbSession,
    pagination: Pagination,
    status: Annotated[DisruptionStatus | None, Query()] = None,
):
    items, total = await OperatorAdaptationService(db, membership).disruptions(
        offset=pagination.offset, limit=pagination.limit, status=status
    )
    return responses.paginated(
        [DisruptionResponse(**d).model_dump() for d in items],
        page=pagination.page,
        limit=pagination.limit,
        total=total,
    )


@router.post("/disruptions", summary="Raise a disruption", status_code=201)
async def raise_disruption(
    payload: DisruptionCreate,
    membership: OperatorContext,
    db: DbSession,
):
    """Record what went wrong, and cost its blast radius immediately.

    The response carries the assessment: which committed components are at
    risk, what each is worth, what cancelling each would refund under the terms
    already agreed, and a ranked replacement shortlist per component. That is
    the difference between an alert and an answer.
    """
    disruption = await OperatorAdaptationService(db, membership).raise_disruption(
        type=payload.type,
        severity=payload.severity,
        title=payload.title,
        description=payload.description,
        city=payload.city,
        trip_id=payload.trip_id,
        booking_id=payload.booking_id,
        service_id=payload.service_id,
        from_date=payload.from_date,
        to_date=payload.to_date,
        notify=payload.notify,
    )
    return responses.success(
        DisruptionResponse(
            **AdaptationService.serialise_disruption(disruption)
        ).model_dump(),
        "Disruption raised",
        status_code=201,
    )


@router.get("/disruptions/{disruption_id}", summary="One incident in full")
async def disruption(
    disruption_id: Annotated[uuid.UUID, Path()],
    membership: OperatorContext,
    db: DbSession,
):
    record = await OperatorAdaptationService(db, membership).get_disruption(
        disruption_id
    )
    return responses.success(
        DisruptionResponse(
            **AdaptationService.serialise_disruption(record)
        ).model_dump(),
        "OK",
    )


@router.post("/disruptions/{disruption_id}/reassess", summary="Recost an incident")
async def reassess_disruption(
    disruption_id: Annotated[uuid.UUID, Path()],
    membership: OperatorContext,
    db: DbSession,
):
    """Re-run the assessment against availability and prices as they are now."""
    record = await OperatorAdaptationService(db, membership).reassess(disruption_id)
    return responses.success(
        DisruptionResponse(
            **AdaptationService.serialise_disruption(record)
        ).model_dump(),
        "Disruption reassessed",
    )


@router.put("/disruptions/{disruption_id}/status", summary="Update incident status")
async def set_disruption_status(
    disruption_id: Annotated[uuid.UUID, Path()],
    payload: DisruptionStatusRequest,
    membership: OperatorContext,
    db: DbSession,
):
    record = await OperatorAdaptationService(db, membership).set_disruption_status(
        disruption_id, payload.status
    )
    return responses.success(
        DisruptionResponse(
            **AdaptationService.serialise_disruption(record)
        ).model_dump(),
        "Status updated",
    )


@router.post(
    "/disruptions/{disruption_id}/items/{item_id}/recover",
    summary="Propose the recommended replacement",
    status_code=201,
)
async def propose_recovery(
    disruption_id: Annotated[uuid.UUID, Path()],
    item_id: Annotated[uuid.UUID, Path()],
    membership: OperatorContext,
    db: DbSession,
):
    """Raise the swap the assessment already recommends, on the traveller's behalf.

    It is recorded against the traveller's own account rather than applied
    silently: they are the one who has to live with the replacement, so it must
    appear in their history as something that happened to their tour.
    """
    request = await OperatorAdaptationService(db, membership).propose_recovery(
        disruption_id, item_id
    )
    return responses.success(
        ChangeRequestResponse(**AdaptationService.serialise(request)).model_dump(),
        "Recovery proposed",
        status_code=201,
    )


# --------------------------------------------------------------------------
# Assist
# --------------------------------------------------------------------------

@router.get("/assist", summary="Traveller questions for your operator")
async def assist_threads(
    membership: OperatorContext,
    db: DbSession,
    pagination: Pagination,
    status: Annotated[AssistThreadStatus | None, Query()] = None,
    mine_only: Annotated[bool, Query()] = False,
):
    """Open threads first, then most recently spoken in.

    ``mine_only`` includes unassigned threads as well as your own — a queue
    that hid them would leave new questions invisible to everybody.
    """
    items, total = await AssistService(db).list_for_operator(
        membership,
        offset=pagination.offset,
        limit=pagination.limit,
        status=status,
        mine_only=mine_only,
    )
    return responses.paginated(
        [
            AssistThreadResponse(
                **AssistService.serialise(t, include_messages=False)
            ).model_dump()
            for t in items
        ],
        page=pagination.page,
        limit=pagination.limit,
        total=total,
    )


@router.get("/assist/{thread_id}", summary="One conversation in full")
async def assist_thread(
    thread_id: Annotated[uuid.UUID, Path()],
    membership: OperatorContext,
    db: DbSession,
):
    thread = await AssistService(db).get_for_operator(thread_id, membership)
    return responses.success(
        AssistThreadResponse(**AssistService.serialise(thread)).model_dump(), "OK"
    )


@router.post("/assist/{thread_id}/messages", summary="Answer a traveller", status_code=201)
async def assist_reply(
    thread_id: Annotated[uuid.UUID, Path()],
    payload: StaffReplyRequest,
    membership: OperatorContext,
    db: DbSession,
):
    """Replying claims the thread, so it stops appearing as unowned work.

    Pass ``resolve`` for the common case where the answer *is* the resolution.
    """
    thread = await AssistService(db).reply_as_staff(
        thread_id, membership, payload.body, resolve=payload.resolve
    )
    return responses.success(
        AssistThreadResponse(**AssistService.serialise(thread)).model_dump(),
        "Reply sent",
        status_code=201,
    )


@router.put("/assist/{thread_id}/status", summary="Update a conversation's status")
async def assist_status(
    thread_id: Annotated[uuid.UUID, Path()],
    payload: ThreadStatusRequest,
    membership: OperatorContext,
    db: DbSession,
):
    thread = await AssistService(db).set_status(thread_id, membership, payload.status)
    return responses.success(
        AssistThreadResponse(**AssistService.serialise(thread)).model_dump(),
        "Status updated",
    )


@router.put("/assist/{thread_id}/assignee", summary="Assign a conversation")
async def assist_assign(
    thread_id: Annotated[uuid.UUID, Path()],
    payload: AssignThreadRequest,
    membership: OperatorContext,
    db: DbSession,
):
    """Pass a null ``member_id`` to hand it back to the unassigned pool."""
    thread = await AssistService(db).assign(thread_id, membership, payload.member_id)
    return responses.success(
        AssistThreadResponse(**AssistService.serialise(thread)).model_dump(),
        "Assigned" if payload.member_id else "Returned to the pool",
    )
