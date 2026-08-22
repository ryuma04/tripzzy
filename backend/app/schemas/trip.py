"""Trip schemas (spec sections 7, 10)."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core import validators
from app.core.config import settings
from app.models.enums import TripStatus
from app.schemas.common import Money
from app.schemas.stop import StopDetail
from app.schemas.user import PublicUserResponse



class TripGenerateRequest(BaseModel):
    destination_ids: list[uuid.UUID]
    start_date: date
    end_date: date
    budget_tier: str
    travel_style: str
    traveller_count: int = 1


class SelectAIPlanRequest(BaseModel):
    selected_plan: dict
    destination_ids: list[uuid.UUID] = []
    start_date: date | None = None
    end_date: date | None = None
    traveller_count: int = 1



class TripCreateRequest(BaseModel):
    """The five required fields from the Create-New-Trip screen (spec 7)."""

    title: Annotated[str, Field(min_length=3, max_length=120)]
    start_date: date
    end_date: date
    budget: Money = Decimal("0")
    traveller_count: Annotated[int, Field(ge=1, le=50)] = 1
    description: Annotated[str | None, Field(max_length=2000)] = None
    currency: Annotated[str, Field(min_length=3, max_length=3)] = settings.DEFAULT_CURRENCY
    cover_image_url: Annotated[str | None, Field(max_length=500)] = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Title must be at least 3 characters")
        return v

    @field_validator("description")
    @classmethod
    def _description(cls, v: str | None) -> str | None:
        return validators.clean_text(v, field="Description", max_len=2000)

    @field_validator("currency")
    @classmethod
    def _currency(cls, v: str) -> str:
        return validators.clean_currency(v)

    @model_validator(mode="after")
    def _dates(self) -> "TripCreateRequest":
        # Spec section 31 / 2.3: "End date before start date -> reject".
        if self.start_date > self.end_date:
            raise ValueError("End date cannot be earlier than start date")
        span = (self.end_date - self.start_date).days + 1
        if span > settings.MAX_TRIP_DAYS:
            raise ValueError(
                f"A trip cannot be longer than {settings.MAX_TRIP_DAYS} days"
            )
        return self


class TripUpdateRequest(BaseModel):
    """Partial update. Cross-field date rules are finished in the service,
    which can see the values that were *not* sent."""

    title: Annotated[str | None, Field(min_length=3, max_length=120)] = None
    start_date: date | None = None
    end_date: date | None = None
    budget: Money | None = None
    traveller_count: Annotated[int | None, Field(ge=1, le=50)] = None
    description: Annotated[str | None, Field(max_length=2000)] = None
    currency: Annotated[str | None, Field(min_length=3, max_length=3)] = None
    cover_image_url: Annotated[str | None, Field(max_length=500)] = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Title must be at least 3 characters")
        return v

    @field_validator("description")
    @classmethod
    def _description(cls, v: str | None) -> str | None:
        return validators.clean_text(v, field="Description", max_len=2000)

    @field_validator("currency")
    @classmethod
    def _currency(cls, v: str | None) -> str | None:
        return validators.clean_currency(v) if v is not None else None

    @model_validator(mode="after")
    def _dates(self) -> "TripUpdateRequest":
        if (
            self.start_date is not None
            and self.end_date is not None
            and self.start_date > self.end_date
        ):
            raise ValueError("End date cannot be earlier than start date")
        return self


class TripSummary(BaseModel):
    """The card shown on the trip-listing screen (spec section 10)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str | None = None
    start_date: date
    end_date: date
    duration_days: int
    budget: Decimal
    traveller_count: int
    currency: str
    status: TripStatus
    is_public: bool
    share_slug: str | None = None
    cover_image_url: str | None = None
    stop_count: int = 0
    activity_count: int = 0
    estimated_cost: Decimal = Decimal("0")
    created_at: datetime
    updated_at: datetime


class TripDetail(TripSummary):
    """Trip overview plus its cities, for the detail screen."""

    cities: list[str] = []
    stops: list[StopDetail] = []
    owner: PublicUserResponse | None = None
    cloned_from_trip_id: uuid.UUID | None = None


class ShareResponse(BaseModel):
    share_slug: str
    share_url: str
    is_public: bool


class CloneRequest(BaseModel):
    """Cloning may rebase the itinerary onto a new start date (spec 16)."""

    title: Annotated[str | None, Field(min_length=3, max_length=120)] = None
    start_date: date | None = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: str | None) -> str | None:
        return v.strip() if v else None
