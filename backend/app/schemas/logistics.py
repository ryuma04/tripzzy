"""Transport, accommodation and expense schemas (spec sections 15, 19, 20)."""

import uuid
# Aliased: the expense schemas have a field literally named `date`,
# which would otherwise shadow the type inside the class body.
from datetime import date as dt_date, datetime, timezone
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core import validators
from app.models.enums import ExpenseCategory, TransportType
from app.schemas.common import Money, PositiveMoney


def _as_utc(value: datetime) -> datetime:
    """Treat a naive datetime as UTC so comparisons never raise.

    Mixing naive and aware datetimes is a TypeError in Python, and the client
    may legitimately send either form.
    """
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


# --------------------------------------------------------------------------
# Transport
# --------------------------------------------------------------------------

class TransportCreateRequest(BaseModel):
    transport_type: TransportType
    departure_time: datetime
    arrival_time: datetime
    origin_stop_id: uuid.UUID | None = None
    destination_stop_id: uuid.UUID | None = None
    provider: Annotated[str | None, Field(max_length=120)] = None
    cost: Money = Decimal("0")
    booking_ref: Annotated[str | None, Field(max_length=120)] = None
    notes: Annotated[str | None, Field(max_length=2000)] = None

    @field_validator("departure_time", "arrival_time")
    @classmethod
    def _tz(cls, v: datetime) -> datetime:
        return _as_utc(v)

    @model_validator(mode="after")
    def _check(self) -> "TransportCreateRequest":
        if self.departure_time >= self.arrival_time:
            raise ValueError("Arrival time must be later than departure time")
        if (
            self.origin_stop_id is not None
            and self.origin_stop_id == self.destination_stop_id
        ):
            raise ValueError("Origin and destination stops must be different")
        return self


class TransportUpdateRequest(BaseModel):
    transport_type: TransportType | None = None
    departure_time: datetime | None = None
    arrival_time: datetime | None = None
    origin_stop_id: uuid.UUID | None = None
    destination_stop_id: uuid.UUID | None = None
    provider: Annotated[str | None, Field(max_length=120)] = None
    cost: Money | None = None
    booking_ref: Annotated[str | None, Field(max_length=120)] = None
    notes: Annotated[str | None, Field(max_length=2000)] = None

    @field_validator("departure_time", "arrival_time")
    @classmethod
    def _tz(cls, v: datetime | None) -> datetime | None:
        return _as_utc(v) if v is not None else None

    @model_validator(mode="after")
    def _check(self) -> "TransportUpdateRequest":
        if (
            self.departure_time is not None
            and self.arrival_time is not None
            and self.departure_time >= self.arrival_time
        ):
            raise ValueError("Arrival time must be later than departure time")
        return self


class TransportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    trip_id: uuid.UUID
    origin_stop_id: uuid.UUID | None = None
    destination_stop_id: uuid.UUID | None = None
    origin_city: str | None = None
    destination_city: str | None = None
    transport_type: TransportType
    provider: str | None = None
    departure_time: datetime
    arrival_time: datetime
    cost: Decimal
    booking_ref: str | None = None
    notes: str | None = None
    duration_minutes: int = 0


# --------------------------------------------------------------------------
# Accommodation
# --------------------------------------------------------------------------

class AccommodationCreateRequest(BaseModel):
    name: Annotated[str, Field(min_length=2, max_length=160)]
    check_in: dt_date
    check_out: dt_date
    address: Annotated[str | None, Field(max_length=500)] = None
    estimated_cost: Money = Decimal("0")
    booking_url: Annotated[str | None, Field(max_length=500)] = None
    notes: Annotated[str | None, Field(max_length=2000)] = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Name must be at least 2 characters")
        return v

    @field_validator("booking_url")
    @classmethod
    def _url(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        v = v.strip()
        if not v.startswith(("http://", "https://")):
            raise ValueError("Booking URL must start with http:// or https://")
        return v

    @model_validator(mode="after")
    def _dates(self) -> "AccommodationCreateRequest":
        if self.check_in > self.check_out:
            raise ValueError("Check-out cannot be earlier than check-in")
        return self


class AccommodationUpdateRequest(BaseModel):
    name: Annotated[str | None, Field(min_length=2, max_length=160)] = None
    check_in: dt_date | None = None
    check_out: dt_date | None = None
    address: Annotated[str | None, Field(max_length=500)] = None
    estimated_cost: Money | None = None
    booking_url: Annotated[str | None, Field(max_length=500)] = None
    notes: Annotated[str | None, Field(max_length=2000)] = None

    @field_validator("booking_url")
    @classmethod
    def _url(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        v = v.strip()
        if not v.startswith(("http://", "https://")):
            raise ValueError("Booking URL must start with http:// or https://")
        return v

    @model_validator(mode="after")
    def _dates(self) -> "AccommodationUpdateRequest":
        if (
            self.check_in is not None
            and self.check_out is not None
            and self.check_in > self.check_out
        ):
            raise ValueError("Check-out cannot be earlier than check-in")
        return self


class AccommodationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    stop_id: uuid.UUID
    name: str
    address: str | None = None
    check_in: dt_date
    check_out: dt_date
    estimated_cost: Decimal
    booking_url: str | None = None
    notes: str | None = None
    nights: int = 0


# --------------------------------------------------------------------------
# Expenses (spec section 15)
# --------------------------------------------------------------------------

class ExpenseCreateRequest(BaseModel):
    category: ExpenseCategory
    title: Annotated[str, Field(min_length=2, max_length=120)]
    # Spec section 31 requires amount > 0 strictly: a zero expense is not a
    # meaningful record.
    amount: PositiveMoney
    date: dt_date
    stop_id: uuid.UUID | None = None
    notes: Annotated[str | None, Field(max_length=2000)] = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Title must be at least 2 characters")
        return v

    @field_validator("notes")
    @classmethod
    def _notes(cls, v: str | None) -> str | None:
        return validators.clean_text(v, field="Notes", max_len=2000)


class ExpenseUpdateRequest(BaseModel):
    category: ExpenseCategory | None = None
    title: Annotated[str | None, Field(min_length=2, max_length=120)] = None
    amount: PositiveMoney | None = None
    date: dt_date | None = None
    stop_id: uuid.UUID | None = None
    notes: Annotated[str | None, Field(max_length=2000)] = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Title must be at least 2 characters")
        return v


class ExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    trip_id: uuid.UUID
    stop_id: uuid.UUID | None = None
    category: ExpenseCategory
    title: str
    amount: Decimal
    date: dt_date = Field(validation_alias="expense_date")
    notes: str | None = None
