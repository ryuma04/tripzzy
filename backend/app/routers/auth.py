"""Authentication endpoints (spec section 27, /auth)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.security import HTTPAuthorizationCredentials

from app.core import responses
from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, bearer_scheme
from app.core.exceptions import UnauthorizedError
from app.core.rate_limit import rate_limit_auth
from app.repositories.user_repository import UserRepository
from app.schemas.auth import (
    LoginRequest,
    OTPRequest,
    OTPVerifyRequest,
    RefreshRequest,
    RegisterRequest,
)
from app.schemas.user import UserResponse
from app.services.auth_service import AuthService
from app.services.otp_service import OTPService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    summary="Create a new account",
    dependencies=[Depends(rate_limit_auth)],
)
async def register(payload: RegisterRequest, db: DbSession):
    service = AuthService(db)
    user, debug_code = await service.register(payload)

    data: dict = {
        "user": UserResponse.model_validate(user).model_dump(),
        "verification_required": settings.REQUIRE_EMAIL_VERIFICATION,
    }

    if settings.REQUIRE_EMAIL_VERIFICATION:
        message = "Account created. Check your email for a verification code."
    else:
        # Nothing left to gate on, so sign the user straight in.
        tokens = service.issue_tokens(user)
        tokens.pop("_expires_at", None)
        data.update(tokens)
        message = "Account created successfully"

    if debug_code:
        # Only ever set when SMTP is unconfigured AND verification is off.
        data["debug_verification_code"] = debug_code

    return responses.success(data, message, status_code=201)


@router.post(
    "/login",
    summary="Sign in and receive a JWT",
    dependencies=[Depends(rate_limit_auth)],
)
async def login(payload: LoginRequest, db: DbSession):
    service = AuthService(db)
    user = await service.authenticate(payload.email, payload.password)

    tokens = service.issue_tokens(user)
    tokens.pop("_expires_at", None)

    return responses.success(
        {**tokens, "user": UserResponse.model_validate(user).model_dump()},
        "Signed in successfully",
    )


@router.post("/logout", summary="Revoke the current access token")
async def logout(
    db: DbSession,
    _: CurrentUser,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(bearer_scheme)
    ] = None,
):
    if credentials is None:
        raise UnauthorizedError("Authentication required")
    await AuthService(db).logout(credentials.credentials)
    return responses.success(None, "Signed out successfully")


@router.post("/refresh", summary="Exchange a refresh token for a new access token")
async def refresh(payload: RefreshRequest, db: DbSession):
    user, tokens = await AuthService(db).refresh(payload.refresh_token)
    tokens.pop("_expires_at", None)
    return responses.success(
        {**tokens, "user": UserResponse.model_validate(user).model_dump()},
        "Token refreshed",
    )


@router.get("/me", summary="The currently authenticated user")
async def me(current_user: CurrentUser):
    return responses.success(
        UserResponse.model_validate(current_user).model_dump(), "OK"
    )


@router.post("/verify-otp", summary="Confirm an email address with a code")
async def verify_otp(payload: OTPVerifyRequest, db: DbSession):
    service = AuthService(db)
    user = await OTPService.verify(db, payload.email, payload.code)
    await db.commit()
    await db.refresh(user)

    tokens = service.issue_tokens(user)
    tokens.pop("_expires_at", None)
    return responses.success(
        {**tokens, "user": UserResponse.model_validate(user).model_dump()},
        "Email verified successfully",
    )


@router.post(
    "/resend-otp",
    summary="Send a fresh verification code",
    dependencies=[Depends(rate_limit_auth)],
)
async def resend_otp(payload: OTPRequest, db: DbSession):
    user = await UserRepository(db).get_by_email(payload.email)

    # Do not reveal whether the address is registered: respond identically
    # either way, so this cannot be used to enumerate accounts.
    generic = "If that address has an unverified account, a code has been sent."

    if user is None or user.is_email_verified:
        return responses.success(None, generic)

    debug_code = await OTPService.issue(db, user)
    await db.commit()

    data = {"debug_verification_code": debug_code} if debug_code else None
    return responses.success(data, generic)


@router.post(
    "/request-login-otp",
    summary="Request a 6-digit OTP code for instant login",
    dependencies=[Depends(rate_limit_auth)],
)
async def request_login_otp(payload: OTPRequest, db: DbSession):
    user = await UserRepository(db).get_by_email(payload.email)
    generic = "If that address is registered, a login code has been sent."

    if user is None or user.status.value != "active":
        return responses.success(None, generic)

    debug_code = await OTPService.issue(db, user)
    await db.commit()

    data = {"debug_verification_code": debug_code} if debug_code else None
    return responses.success(data, generic)


@router.post(
    "/login-otp",
    summary="Sign in using a 6-digit OTP code",
    dependencies=[Depends(rate_limit_auth)],
)
async def login_otp(payload: OTPVerifyRequest, db: DbSession):
    service = AuthService(db)
    user = await OTPService.verify(db, payload.email, payload.code)
    await db.commit()
    await db.refresh(user)

    tokens = service.issue_tokens(user)
    tokens.pop("_expires_at", None)
    return responses.success(
        {**tokens, "user": UserResponse.model_validate(user).model_dump()},
        "Signed in successfully",
    )
