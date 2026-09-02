"""Booking endpoints: quote, place, pay, cancel.

Quoting and creating hang off a trip; everything afterwards addresses the
booking directly, since a booking outlives any particular view of the trip.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Path

from app.core import responses
from app.core.deps import CurrentUser, DbSession, Pagination
from app.schemas.booking import (
    BookingCreateRequest,
    BookingResponse,
    PaymentRequest,
    QuoteRequest,
    QuoteResponse,
)
from app.services.booking_service import BookingService

trip_bookings_router = APIRouter(prefix="/trips", tags=["bookings"])
bookings_router = APIRouter(prefix="/bookings", tags=["bookings"])


@trip_bookings_router.post("/{trip_id}/quote", summary="Price components, commit to nothing")
async def quote(
    trip_id: Annotated[uuid.UUID, Path()],
    payload: QuoteRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Itemised pricing for a proposed set of components.

    Availability is checked while quoting, not deferred to payment: quoting a
    price for something that cannot be supplied is worse than refusing.
    """
    result = await BookingService(db).quote(trip_id, payload.items, current_user)
    return responses.success(
        QuoteResponse(**result).model_dump(), "Quote prepared"
    )


@trip_bookings_router.post(
    "/{trip_id}/bookings", summary="Create a booking", status_code=201
)
async def create_booking(
    trip_id: Annotated[uuid.UUID, Path()],
    payload: BookingCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    booking = await BookingService(db).create(trip_id, payload, current_user)
    return responses.success(
        BookingResponse(**booking).model_dump(),
        "Booking created",
        status_code=201,
    )


@bookings_router.get("", summary="Your bookings")
async def list_bookings(
    current_user: CurrentUser, db: DbSession, pagination: Pagination
):
    items, total = await BookingService(db).list_for_user(
        current_user, offset=pagination.offset, limit=pagination.limit
    )
    return responses.paginated(
        [BookingResponse(**b).model_dump() for b in items],
        page=pagination.page,
        limit=pagination.limit,
        total=total,
    )


@bookings_router.get("/{booking_id}", summary="Booking detail")
async def get_booking(
    booking_id: Annotated[uuid.UUID, Path()],
    current_user: CurrentUser,
    db: DbSession,
):
    booking = await BookingService(db).get(booking_id, current_user)
    return responses.success(
        BookingResponse(**booking).model_dump(), "Booking fetched"
    )


@bookings_router.post("/{booking_id}/payments", summary="Pay for a booking")
async def pay_booking(
    booking_id: Annotated[uuid.UUID, Path()],
    payload: PaymentRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Take a payment through the simulated gateway.

    Omit ``amount`` to settle the balance in full. A smaller amount is
    recorded as a deposit and the booking stays ``pending_payment`` until the
    rest clears, which is how an operator holds a tour on part-payment.
    """
    booking = await BookingService(db).pay(
        booking_id, current_user, amount=payload.amount, method=payload.method
    )
    return responses.success(
        BookingResponse(**booking).model_dump(), "Payment captured"
    )


@bookings_router.delete(
    "/{booking_id}/items/{item_id}", summary="Cancel one component"
)
async def cancel_item(
    booking_id: Annotated[uuid.UUID, Path()],
    item_id: Annotated[uuid.UUID, Path()],
    current_user: CurrentUser,
    db: DbSession,
):
    """Cancel a single component, refunded on its own snapshotted terms.

    The rest of the tour stands. The response carries what was refunded, what
    was retained as a penalty, and why.
    """
    booking = await BookingService(db).cancel_item(booking_id, item_id, current_user)
    return responses.success(
        BookingResponse(**booking).model_dump(), "Component cancelled"
    )


@bookings_router.delete("/{booking_id}", summary="Cancel a booking")
async def cancel_booking(
    booking_id: Annotated[uuid.UUID, Path()],
    current_user: CurrentUser,
    db: DbSession,
):
    booking = await BookingService(db).cancel(booking_id, current_user)
    return responses.success(
        BookingResponse(**booking).model_dump(), "Booking cancelled"
    )
