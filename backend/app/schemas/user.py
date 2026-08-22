"""User profile and preference schemas (spec section 11)."""

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core import validators
from app.models.enums import ActivityCategory, UserRole, UserStatus


class UserResponse(BaseModel):
    """The public shape of a user.

    Deliberately omits ``hashed_password`` and every OTP field -- spec section
    11: "Profile must not expose sensitive information."
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    first_name: str
    last_name: str
    email: str
    phone: str | None = None
    city: str | None = None
    country: str | None = None
    additional_info: str | None = None
    role: UserRole
    status: UserStatus
    is_email_verified: bool
    avatar_url: str | None = None
    created_at: datetime


class PublicUserResponse(BaseModel):
    """The even narrower shape shown to *other* users in the community feed."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    first_name: str
    last_name: str
    city: str | None = None
    country: str | None = None
    avatar_url: str | None = None


class UserUpdateRequest(BaseModel):
    """Every field optional -- this is a partial update.

    Email, role and status are absent on purpose: changing an email would
    bypass verification, and role/status are administrative concerns.
    """

    first_name: Annotated[str | None, Field(min_length=1, max_length=50)] = None
    last_name: Annotated[str | None, Field(min_length=1, max_length=50)] = None
    phone: Annotated[str | None, Field(min_length=7, max_length=20)] = None
    city: Annotated[str | None, Field(min_length=2, max_length=100)] = None
    country: Annotated[str | None, Field(min_length=2, max_length=100)] = None
    additional_info: Annotated[str | None, Field(max_length=1000)] = None
    avatar_url: Annotated[str | None, Field(max_length=500)] = None

    @field_validator("first_name")
    @classmethod
    def _first(cls, v: str | None) -> str | None:
        return validators.clean_name(v, "First name") if v is not None else None

    @field_validator("last_name")
    @classmethod
    def _last(cls, v: str | None) -> str | None:
        return validators.clean_name(v, "Last name") if v is not None else None

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        return validators.clean_phone(v) if v is not None else None

    @field_validator("additional_info")
    @classmethod
    def _info(cls, v: str | None) -> str | None:
        return validators.clean_text(v, field="Additional information", max_len=1000)


class PasswordChangeRequest(BaseModel):
    current_password: Annotated[str, Field(min_length=1, max_length=128)]
    new_password: Annotated[str, Field(min_length=8, max_length=128)]
    confirm_password: Annotated[str, Field(min_length=8, max_length=128)]

    @field_validator("new_password")
    @classmethod
    def _strength(cls, v: str) -> str:
        return validators.validate_password(v)

    @field_validator("confirm_password")
    @classmethod
    def _match(cls, v: str, info) -> str:
        if "new_password" in info.data and v != info.data["new_password"]:
            raise ValueError("Passwords do not match")
        return v


class PreferencesResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    currency: str
    default_traveller_count: int
    preferred_categories: list[str]
    home_city: str | None = None
    home_country: str | None = None
    email_notifications: bool


class PreferencesUpdateRequest(BaseModel):
    currency: Annotated[str | None, Field(min_length=3, max_length=3)] = None
    default_traveller_count: Annotated[int | None, Field(ge=1, le=50)] = None
    preferred_categories: list[ActivityCategory] | None = None
    home_city: Annotated[str | None, Field(max_length=100)] = None
    home_country: Annotated[str | None, Field(max_length=100)] = None
    email_notifications: bool | None = None

    @field_validator("currency")
    @classmethod
    def _currency(cls, v: str | None) -> str | None:
        return validators.clean_currency(v) if v is not None else None

    @field_validator("preferred_categories")
    @classmethod
    def _categories(
        cls, v: list[ActivityCategory] | None
    ) -> list[ActivityCategory] | None:
        if v is None:
            return None
        # Preserve order but drop duplicates.
        return list(dict.fromkeys(v))
