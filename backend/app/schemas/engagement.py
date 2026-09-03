"""Assist and review schemas."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core import validators
from app.models.enums import AssistSender, AssistThreadStatus, ReviewSubject

# --------------------------------------------------------------------------
# Assist
# --------------------------------------------------------------------------


class ThreadOpenRequest(BaseModel):
    subject: Annotated[str, Field(min_length=3, max_length=160)]
    body: Annotated[str, Field(min_length=1, max_length=4000)]
    # On by default: a traveller mid-tour asking a question should get
    # *something* immediately rather than silence until office hours.
    ask_concierge: bool = True

    @field_validator("subject")
    @classmethod
    def _subject(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Subject must be at least 3 characters")
        return v


class MessageRequest(BaseModel):
    body: Annotated[str, Field(min_length=1, max_length=4000)]
    ask_concierge: bool = False


class StaffReplyRequest(BaseModel):
    body: Annotated[str, Field(min_length=1, max_length=4000)]
    # Answering and closing in one step, for the common case where the reply
    # *is* the resolution.
    resolve: bool = False


class ThreadStatusRequest(BaseModel):
    status: AssistThreadStatus


class AssignThreadRequest(BaseModel):
    # Null hands the thread back to the unassigned pool.
    member_id: uuid.UUID | None = None


class AssistMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sender: AssistSender
    sender_id: uuid.UUID | None
    sender_name: str | None
    body: str
    created_at: datetime


class AssistThreadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    trip_id: uuid.UUID
    trip_title: str | None = None
    traveller_id: uuid.UUID
    traveller_name: str | None = None
    booking_id: uuid.UUID | None = None
    operator_id: uuid.UUID | None = None
    assigned_member_id: uuid.UUID | None = None
    assigned_member_name: str | None = None
    subject: str
    status: AssistThreadStatus
    message_count: int
    last_message_at: datetime | None = None
    resolved_at: datetime | None = None
    messages: list[AssistMessageResponse] = []
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------
# Reviews
# --------------------------------------------------------------------------


class ReviewCreateRequest(BaseModel):
    """A rating of one thing.

    ``subject`` and ``target_id`` are kept as a pair rather than four optional
    id fields: exactly one thing is being reviewed, and a shape that can
    express "two things at once" would need a validator to forbid what it just
    allowed.
    """

    subject: ReviewSubject
    target_id: uuid.UUID
    rating: Annotated[int, Field(ge=1, le=5)]
    title: Annotated[str | None, Field(max_length=160)] = None
    body: Annotated[str | None, Field(max_length=4000)] = None

    @field_validator("body", "title")
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        return validators.clean_text(v, field="Review", max_len=4000)


class ReviewUpdateRequest(BaseModel):
    rating: Annotated[int | None, Field(ge=1, le=5)] = None
    title: Annotated[str | None, Field(max_length=160)] = None
    body: Annotated[str | None, Field(max_length=4000)] = None


class ReviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    author_id: uuid.UUID
    author_name: str | None = None
    author_avatar_url: str | None = None
    subject: ReviewSubject
    target_id: uuid.UUID
    trip_id: uuid.UUID | None = None
    vendor_id: uuid.UUID | None = None
    service_id: uuid.UUID | None = None
    operator_id: uuid.UUID | None = None
    booking_id: uuid.UUID | None = None
    rating: int
    title: str | None = None
    body: str | None = None
    is_verified: bool
    is_public: bool
    created_at: datetime
    updated_at: datetime


class RatingSummary(BaseModel):
    """An average plus its shape.

    The distribution is carried because 4.2 built from fives and ones means
    something different from 4.2 built entirely from fours, and one number
    cannot say which.
    """

    average: Decimal | None
    count: int
    distribution: dict[str, int]


class ReviewPage(BaseModel):
    items: list[ReviewResponse]
    summary: RatingSummary


class ReviewableItem(BaseModel):
    """Something the traveller went to and has not yet rated."""

    subject: ReviewSubject
    target_id: uuid.UUID
    title: str
    vendor_name: str | None = None
    city: str | None = None
    service_date: date
    booking_reference: str | None = None
