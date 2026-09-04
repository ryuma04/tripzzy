"""Booking, quote and payment schemas."""

import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import (
    BookingItemStatus,
    BookingStatus,
    PaymentKind,
    PaymentStatus,
    ServiceType,
)
from app.schemas.common import Money, PositiveMoney

PaymentMethod = Annotated[str, Field(pattern="^(card|upi|netbanking|wallet)$")]


class BookingItemInput(BaseModel):
    """One component to book.

    Either points at a catalogue ``service_id``, or is a free-form line with
    its own ``unit_price`` -- operators arrange things off-catalogue, and
    refusing those would make the booking flow unusable for real tours.
    """

    service_id: uuid.UUID | None = None
    stop_id: uuid.UUID | None = None
    itinerary_activity_id: uuid.UUID | None = None

    component_type: ServiceType
    title: Annotated[str | None, Field(max_length=200)] = None
    city: Annotated[str | None, Field(max_length=100)] = None

    service_date: date
    end_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None

    # ``quantity`` is how many people/rooms; ``units`` is how many nights or
    # days. Kept apart because the two multiply and conflating them makes a
    # three-night stay for two indistinguishable from a six-night stay for one.
    quantity: Annotated[int, Field(ge=1, le=50)] = 1
    units: Annotated[int, Field(ge=1, le=365)] = 1
    unit_price: Money | None = None
    notes: Annotated[str | None, Field(max_length=2000)] = None

    @model_validator(mode="after")
    def _needs_a_source(self) -> "BookingItemInput":
        if self.service_id is None and self.unit_price is None:
            raise ValueError(
                "A booking line needs either a service_id or an explicit unit_price"
            )
        if self.end_date is not None and self.end_date < self.service_date:
            raise ValueError("end_date cannot be before service_date")
        return self


class BookingCreateRequest(BaseModel):
    operator_id: uuid.UUID | None = None
    notes: Annotated[str | None, Field(max_length=2000)] = None
    items: Annotated[list[BookingItemInput], Field(min_length=1, max_length=100)]


class QuoteRequest(BaseModel):
    items: Annotated[list[BookingItemInput], Field(min_length=1, max_length=100)]


class PaymentRequest(BaseModel):
    # Omit to settle the whole outstanding balance. A smaller amount is
    # treated as a deposit and leaves the booking pending.
    #
    # ``PositiveMoney``, not ``Money``: zero is falsy, so an ``amount`` of 0
    # fell through the ``amount or outstanding`` default in the service and
    # silently charged the entire balance instead of the nothing that was
    # asked for. Sending 0 is now rejected at the door.
    amount: PositiveMoney | None = None
    method: PaymentMethod = "card"


class BookingItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    service_id: uuid.UUID | None
    stop_id: uuid.UUID | None
    component_type: ServiceType
    title: str
    vendor_name: str | None
    city: str | None
    service_date: date
    end_date: date | None
    start_time: time | None
    end_time: time | None
    quantity: int
    units: int
    unit_price: Decimal
    total_price: Decimal
    free_cancellation_days: int
    cancellation_penalty_pct: int
    status: BookingItemStatus
    replaced_by_item_id: uuid.UUID | None
    notes: str | None


class PaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    amount: Decimal
    currency: str
    kind: PaymentKind
    status: PaymentStatus
    method: str | None
    gateway_reference: str | None
    failure_reason: str | None
    created_at: datetime


class CancellationSummary(BaseModel):
    refunded: Decimal
    penalty: Decimal
    explanation: str


class BookingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    reference: str
    trip_id: uuid.UUID
    trip_title: str | None = None
    traveller_id: uuid.UUID
    operator_id: uuid.UUID | None
    status: BookingStatus
    currency: str
    subtotal: Decimal
    discount: Decimal
    tax: Decimal
    total: Decimal
    amount_paid: Decimal
    amount_outstanding: Decimal
    # Penalties kept from cancelled components. Part of ``total`` -- money the
    # operator earned that is not coming back.
    cancellation_fees: Decimal = Decimal("0")
    notes: str | None
    placed_at: datetime | None
    confirmed_at: datetime | None
    cancelled_at: datetime | None
    items: list[BookingItemResponse] = []
    payments: list[PaymentResponse] = []
    cancellation: CancellationSummary | None = None
    created_at: datetime
    updated_at: datetime


class QuoteLine(BaseModel):
    service_id: uuid.UUID | None
    component_type: ServiceType
    title: str
    vendor_name: str | None
    city: str | None
    service_date: date
    quantity: int
    units: int
    unit_price: Decimal
    total_price: Decimal
    free_cancellation_days: int
    cancellation_penalty_pct: int


class QuoteResponse(BaseModel):
    trip_id: uuid.UUID
    currency: str
    items: list[QuoteLine]
    subtotal: Decimal
    total: Decimal
