"""Trip stop and itinerary activity schemas (spec sections 8, 9, 13)."""

import uuid
from datetime import date, time
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core import validators
from app.models.enums import ActivityCategory
from app.schemas.common import Money


class StopCreateRequest(BaseModel):
    city_name: Annotated[str, Field(min_length=2, max_length=100)]
    arrival_date: date
    departure_date: date
    country: Annotated[str | None, Field(max_length=100)] = None
    destination_id: uuid.UUID | None = None
    notes: Annotated[str | None, Field(max_length=2000)] = None
    # Omitted means "append to the end".
    order_index: Annotated[int | None, Field(ge=0)] = None

    @field_validator("city_name")
    @classmethod
    def _city(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("City name must be at least 2 characters")
        return v

    @field_validator("notes")
    @classmethod
    def _notes(cls, v: str | None) -> str | None:
        return validators.clean_text(v, field="Notes", max_len=2000)

    @model_validator(mode="after")
    def _dates(self) -> "StopCreateRequest":
        # Spec section 31: arrival_date <= departure_date.
        # The trip-boundary checks need the parent trip, so they run in the
        # service layer.
        if self.arrival_date > self.departure_date:
            raise ValueError("Departure date cannot be earlier than arrival date")
        return self


class StopUpdateRequest(BaseModel):
    city_name: Annotated[str | None, Field(min_length=2, max_length=100)] = None
    country: Annotated[str | None, Field(max_length=100)] = None
    destination_id: uuid.UUID | None = None
    arrival_date: date | None = None
    departure_date: date | None = None
    notes: Annotated[str | None, Field(max_length=2000)] = None

    @field_validator("city_name")
    @classmethod
    def _city(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if len(v) < 2:
            raise ValueError("City name must be at least 2 characters")
        return v

    @field_validator("notes")
    @classmethod
    def _notes(cls, v: str | None) -> str | None:
        return validators.clean_text(v, field="Notes", max_len=2000)

    @model_validator(mode="after")
    def _dates(self) -> "StopUpdateRequest":
        if (
            self.arrival_date is not None
            and self.departure_date is not None
            and self.arrival_date > self.departure_date
        ):
            raise ValueError("Departure date cannot be earlier than arrival date")
        return self


class ItineraryActivityCreateRequest(BaseModel):
    title: Annotated[str, Field(min_length=2, max_length=160)]
    activity_date: date
    start_time: time | None = None
    end_time: time | None = None
    estimated_cost: Money = Decimal("0")
    category: ActivityCategory = ActivityCategory.OTHER
    description: Annotated[str | None, Field(max_length=2000)] = None
    notes: Annotated[str | None, Field(max_length=2000)] = None
    # Link back to a catalog entry when the user picked one from search.
    activity_id: uuid.UUID | None = None
    order_index: Annotated[int | None, Field(ge=0)] = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Title must be at least 2 characters")
        return v

    @field_validator("description", "notes")
    @classmethod
    def _text(cls, v: str | None) -> str | None:
        return validators.clean_text(v, field="Text", max_len=2000)

    @model_validator(mode="after")
    def _times(self) -> "ItineraryActivityCreateRequest":
        # Spec section 2.3: "Activity with invalid time range -> reject".
        if self.end_time is not None and self.start_time is None:
            raise ValueError("An end time requires a start time")
        if (
            self.start_time is not None
            and self.end_time is not None
            and self.start_time >= self.end_time
        ):
            raise ValueError("End time must be later than start time")
        return self


class ItineraryActivityUpdateRequest(BaseModel):
    title: Annotated[str | None, Field(min_length=2, max_length=160)] = None
    activity_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    estimated_cost: Money | None = None
    category: ActivityCategory | None = None
    description: Annotated[str | None, Field(max_length=2000)] = None
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

    @model_validator(mode="after")
    def _times(self) -> "ItineraryActivityUpdateRequest":
        # Partial updates are finished in the service, which can see the
        # stored values for whichever fields were not sent.
        if (
            self.start_time is not None
            and self.end_time is not None
            and self.start_time >= self.end_time
        ):
            raise ValueError("End time must be later than start time")
        return self


class ItineraryActivityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    stop_id: uuid.UUID
    activity_id: uuid.UUID | None = None
    title: str
    description: str | None = None
    activity_date: date
    start_time: time | None = None
    end_time: time | None = None
    estimated_cost: Decimal
    category: ActivityCategory
    order_index: int
    notes: str | None = None


class StopResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    trip_id: uuid.UUID
    destination_id: uuid.UUID | None = None
    city_name: str
    country: str | None = None
    arrival_date: date
    departure_date: date
    order_index: int
    notes: str | None = None
    nights: int = 0
    activity_count: int = 0
    estimated_cost: Decimal = Decimal("0")


class StopDetail(StopResponse):
    activities: list[ItineraryActivityResponse] = []


class ItineraryDay(BaseModel):
    """One day of the itinerary view (spec section 13)."""

    date: date
    day_number: int
    city_name: str | None = None
    stop_id: uuid.UUID | None = None
    activities: list[ItineraryActivityResponse] = []
    estimated_cost: Decimal = Decimal("0")
