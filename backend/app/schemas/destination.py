"""Destination and activity-catalog schemas (spec sections 6, 12)."""

import uuid
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import ActivityCategory


class DestinationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    country: str
    region: str | None = None
    description: str | None = None
    cost_index: int
    popularity_score: int
    image_url: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None


class DestinationDetail(DestinationSummary):
    activity_count: int = 0
    top_activities: list["ActivityCatalogResponse"] = []


class DestinationFromPlaceRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    country: str = Field(default="India", max_length=100)
    region: str | None = Field(default=None, max_length=100)
    description: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    image_url: str | None = Field(default=None, max_length=500)


class ActivityCatalogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    destination_id: uuid.UUID
    title: str
    description: str | None = None
    category: ActivityCategory
    estimated_cost: Decimal
    currency: str
    duration_minutes: int | None = None
    image_url: str | None = None
    rating: Decimal | None = None
    destination_name: str | None = None
    country: str | None = None


class DestinationSearchParams(BaseModel):
    """Spec section 12: ?q=&country=&region=&page=&limit="""

    q: Annotated[str | None, Field(max_length=100)] = None
    country: Annotated[str | None, Field(max_length=100)] = None
    region: Annotated[str | None, Field(max_length=100)] = None
    max_cost_index: Annotated[int | None, Field(ge=1, le=5)] = None


class ActivitySearchParams(BaseModel):
    """Spec section 12: ?city=&category=&min_cost=&max_cost=&page=&limit="""

    q: Annotated[str | None, Field(max_length=100)] = None
    city: Annotated[str | None, Field(max_length=100)] = None
    destination_id: uuid.UUID | None = None
    category: ActivityCategory | None = None
    min_cost: Annotated[Decimal | None, Field(ge=0)] = None
    max_cost: Annotated[Decimal | None, Field(ge=0)] = None
    max_duration_minutes: Annotated[int | None, Field(gt=0)] = None
    min_rating: Annotated[Decimal | None, Field(ge=0, le=5)] = None

    @model_validator(mode="after")
    def _cost_range(self) -> "ActivitySearchParams":
        if (
            self.min_cost is not None
            and self.max_cost is not None
            and self.min_cost > self.max_cost
        ):
            raise ValueError("min_cost cannot be greater than max_cost")
        return self


DestinationDetail.model_rebuild()
