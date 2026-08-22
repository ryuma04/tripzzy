"""Request/response schemas for authentication (spec sections 4, 5)."""

from typing import Annotated

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.core import validators
from app.schemas.user import UserResponse


class RegisterRequest(BaseModel):
    """The nine fields the wireframe's registration screen shows (spec 5).

    Note there is deliberately no ``role`` field: role is assigned by the
    server, never accepted from the client, so nobody can register as admin.
    """

    first_name: Annotated[str, Field(min_length=1, max_length=50)]
    last_name: Annotated[str, Field(min_length=1, max_length=50)]
    email: EmailStr
    phone: Annotated[str, Field(min_length=7, max_length=20)]
    city: Annotated[str, Field(min_length=2, max_length=100)]
    country: Annotated[str, Field(min_length=2, max_length=100)]
    additional_info: Annotated[str | None, Field(max_length=1000)] = None
    password: Annotated[str, Field(min_length=8, max_length=128)]
    confirm_password: Annotated[str, Field(min_length=8, max_length=128)]

    @field_validator("first_name")
    @classmethod
    def _first_name(cls, v: str) -> str:
        return validators.clean_name(v, "First name")

    @field_validator("last_name")
    @classmethod
    def _last_name(cls, v: str) -> str:
        return validators.clean_name(v, "Last name")

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return validators.clean_email(v)

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return validators.clean_phone(v)

    @field_validator("city", "country")
    @classmethod
    def _place(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Must be at least 2 characters")
        return v

    @field_validator("additional_info")
    @classmethod
    def _info(cls, v: str | None) -> str | None:
        return validators.clean_text(v, field="Additional information", max_len=1000)

    @model_validator(mode="after")
    def _passwords(self) -> "RegisterRequest":
        # Confirmation is checked before strength so the more obvious mistake
        # is the one reported first.
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        validators.validate_password(self.password, email=self.email)
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: Annotated[str, Field(min_length=1, max_length=128)]

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return validators.clean_email(v)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class RefreshRequest(BaseModel):
    refresh_token: str


class OTPRequest(BaseModel):
    """Request a fresh verification code (refinement R1)."""

    email: EmailStr

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return validators.clean_email(v)


class OTPVerifyRequest(BaseModel):
    email: EmailStr
    code: Annotated[str, Field(min_length=4, max_length=10)]

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return validators.clean_email(v)

    @field_validator("code")
    @classmethod
    def _code(cls, v: str) -> str:
        v = v.strip()
        if not v.isdigit():
            raise ValueError("Verification code must be numeric")
        return v


class RegisterResponse(BaseModel):
    """Registration returns a token directly, or asks for verification first.

    ``verification_required`` tells the frontend which screen to show next
    without it having to know the server's configuration.
    """

    user: UserResponse
    verification_required: bool
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int | None = None
