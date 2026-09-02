"""Bill split request/response schemas."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.core import validators
from app.models.enums import BillSplitStatus, SplitMemberStatus
from app.schemas.common import Money, PositiveMoney

SplitMethod = Literal["equal", "custom"]


class BillSplitMemberInput(BaseModel):
    """One participant.

    Either an existing Tripzyy user (``user_id``) or somebody outside the
    platform, identified by name alone. Trips get split with people who have
    not signed up, and refusing those would make the feature unusable.
    """

    user_id: uuid.UUID | None = None
    display_name: Annotated[str | None, Field(max_length=120)] = None
    email: EmailStr | None = None
    # Only read when split_method is "custom"; ignored for an equal split.
    share_amount: Money | None = None
    is_payer: bool = False

    @model_validator(mode="after")
    def _needs_an_identity(self) -> "BillSplitMemberInput":
        if self.user_id is None and not (self.display_name or "").strip():
            raise ValueError(
                "A member needs either a user_id or a display_name"
            )
        return self


class BillSplitCreateRequest(BaseModel):
    # Defaults to the trip's actual recorded spend when omitted, which is
    # almost always what the caller wants and saves the client re-deriving it.
    total_amount: PositiveMoney | None = None
    split_method: SplitMethod = "equal"
    is_group: bool = True
    currency: Annotated[str | None, Field(min_length=3, max_length=3)] = None
    note: Annotated[str | None, Field(max_length=2000)] = None
    members: Annotated[list[BillSplitMemberInput], Field(min_length=1, max_length=50)]

    @field_validator("currency")
    @classmethod
    def _currency(cls, v: str | None) -> str | None:
        return validators.clean_currency(v) if v is not None else None

    @model_validator(mode="after")
    def _check_members(self) -> "BillSplitCreateRequest":
        seen: set[uuid.UUID] = set()
        for m in self.members:
            if m.user_id is not None:
                if m.user_id in seen:
                    raise ValueError("The same user appears more than once")
                seen.add(m.user_id)

        if sum(1 for m in self.members if m.is_payer) > 1:
            raise ValueError("Only one member can be marked as the payer")

        if self.split_method == "custom":
            missing = [m for m in self.members if m.share_amount is None]
            if missing:
                raise ValueError(
                    "A custom split needs share_amount on every member"
                )
            if self.total_amount is None:
                raise ValueError(
                    "A custom split needs an explicit total_amount to check "
                    "the shares against"
                )
            shares = sum(
                (m.share_amount or Decimal("0")) for m in self.members
            )
            if shares != self.total_amount:
                raise ValueError(
                    f"Custom shares total {shares}, which does not match the "
                    f"split total of {self.total_amount}"
                )
        return self


class BillSplitMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID | None
    display_name: str
    email: str | None
    avatar_url: str | None
    share_amount: Decimal
    status: SplitMemberStatus
    is_payer: bool
    order_index: int


class BillSplitResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    trip_id: uuid.UUID
    trip_title: str | None = None
    created_by_id: uuid.UUID
    created_by_name: str | None = None
    total_amount: Decimal
    currency: str
    member_count: int
    split_method: str
    is_group: bool
    status: BillSplitStatus
    note: str | None
    members: list[BillSplitMemberResponse] = []
    # Derived, not stored: what is still outstanding across all members.
    outstanding_amount: Decimal | None = None
    settled_amount: Decimal | None = None
    created_at: datetime
    updated_at: datetime


class MemberStatusUpdateRequest(BaseModel):
    status: SplitMemberStatus
