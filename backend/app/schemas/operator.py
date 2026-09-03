"""Operator console schemas."""

import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field, model_validator

from app.models.enums import (
    BookingItemStatus,
    BookingStatus,
    ComfortTier,
    OperatorRole,
    PaymentKind,
    PaymentStatus,
    ServiceType,
    TourGroupStatus,
)


class OperatorProfile(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None = None
    logo_url: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    city: str | None = None
    country: str | None = None
    rating: Decimal | None = None
    # The caller's own standing, so the UI can hide what they cannot do.
    your_role: OperatorRole
    your_job_title: str | None = None


class OperatorDashboard(BaseModel):
    operator_id: uuid.UUID
    bookings: dict
    money: dict
    operations: dict


class CustomerRow(BaseModel):
    id: uuid.UUID
    first_name: str
    last_name: str
    email: str
    city: str | None = None
    avatar_url: str | None = None
    booking_count: int
    lifetime_value: Decimal
    last_booked_at: datetime | None = None


class OperatorBookingRow(BaseModel):
    id: uuid.UUID
    reference: str
    status: BookingStatus
    trip_id: uuid.UUID
    trip_title: str | None = None
    traveller_id: uuid.UUID
    traveller_name: str | None = None
    traveller_email: str | None = None
    currency: str
    total: Decimal
    amount_paid: Decimal
    amount_outstanding: Decimal
    item_count: int
    first_service_date: date | None = None
    created_at: datetime


class ScheduleEvent(BaseModel):
    item_id: uuid.UUID
    booking_id: uuid.UUID
    booking_reference: str
    component_type: ServiceType
    title: str
    vendor_name: str | None = None
    city: str | None = None
    start_time: time | None = None
    end_time: time | None = None
    quantity: int
    traveller_name: str
    status: BookingItemStatus


class ScheduleDay(BaseModel):
    date: str
    events: list[ScheduleEvent]


class ScheduleResponse(BaseModel):
    start: date
    end: date
    days: list[ScheduleDay]
    total_events: int


class VendorRow(BaseModel):
    id: uuid.UUID
    name: str
    category: ServiceType
    city: str | None = None
    country: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    rating: Decimal | None = None
    reliability_score: int
    is_active: bool
    service_count: int


class VendorServiceRow(BaseModel):
    id: uuid.UUID
    name: str
    service_type: ServiceType
    comfort_tier: ComfortTier
    unit_price: Decimal
    unit_label: str
    currency: str
    city: str | None = None
    rating: Decimal | None = None
    free_cancellation_days: int
    cancellation_penalty_pct: int
    is_active: bool


class CoordinatorRow(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str | None = None
    email: str | None = None
    avatar_url: str | None = None
    role: OperatorRole
    job_title: str | None = None
    is_active: bool
    active_departures: int


class TourGroupMemberRow(BaseModel):
    id: uuid.UUID
    booking_id: uuid.UUID
    traveller_id: uuid.UUID
    traveller_name: str | None = None
    seats: int


class TourGroupRow(BaseModel):
    id: uuid.UUID
    name: str
    destination: str | None = None
    start_date: date
    end_date: date
    capacity: int
    seats_taken: int
    seats_left: int
    status: TourGroupStatus
    coordinator_id: uuid.UUID | None = None
    coordinator_name: str | None = None
    notes: str | None = None
    members: list[TourGroupMemberRow] = []
    created_at: datetime


class TourGroupCreateRequest(BaseModel):
    name: Annotated[str, Field(min_length=2, max_length=160)]
    destination: Annotated[str | None, Field(max_length=100)] = None
    start_date: date
    end_date: date
    capacity: Annotated[int, Field(ge=1, le=200)] = 10
    coordinator_id: uuid.UUID | None = None
    notes: Annotated[str | None, Field(max_length=2000)] = None

    @model_validator(mode="after")
    def _dates(self) -> "TourGroupCreateRequest":
        if self.end_date < self.start_date:
            raise ValueError("end_date cannot be before start_date")
        return self


class AssignCoordinatorRequest(BaseModel):
    # Null unassigns, which is how a departure gets handed back to the pool.
    coordinator_id: uuid.UUID | None = None


class TourGroupStatusRequest(BaseModel):
    status: TourGroupStatus


class AddToGroupRequest(BaseModel):
    booking_id: uuid.UUID
    seats: Annotated[int, Field(ge=1, le=50)] = 1


class PaymentRow(BaseModel):
    id: uuid.UUID
    booking_id: uuid.UUID
    booking_reference: str
    traveller_name: str
    amount: Decimal
    currency: str
    kind: PaymentKind
    status: PaymentStatus
    method: str | None = None
    gateway_reference: str | None = None
    failure_reason: str | None = None
    created_at: datetime
