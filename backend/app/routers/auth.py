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
from sqlalchemy import select
import secrets
from app.core.security import hash_password
from app.models import Operator, OperatorMember, User
from app.schemas.auth import (
    ClerkSyncRequest,
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


async def _serialize_user(user: User, db: DbSession) -> dict:
    data = UserResponse.model_validate(user).model_dump()
    membership = await db.scalar(
        select(OperatorMember)
        .where(OperatorMember.user_id == user.id, OperatorMember.is_active.is_(True))
        .limit(1)
    )
    if not membership:
        role_str = getattr(user.role, "value", str(user.role)).lower()
        if role_str in ("operator", "coordinator", "admin", "userrole.operator", "userrole.coordinator", "userrole.admin"):
            from app.models.enums import OperatorRole
            op = await db.scalar(
                select(Operator).where(Operator.slug == "tripzyy-journeys")
            )
            if op:
                op_role = (
                    OperatorRole.COORDINATOR
                    if "coordinator" in role_str
                    else OperatorRole.OWNER
                )
                title = (
                    "Field Coordinator"
                    if op_role == OperatorRole.COORDINATOR
                    else "Operations Lead"
                )
                membership = OperatorMember(
                    operator_id=op.id,
                    user_id=user.id,
                    role=op_role,
                    job_title=title,
                    is_active=True,
                )
                db.add(membership)
                await db.commit()
                await db.refresh(membership)
    if membership:
        data["operator_role"] = membership.role.value
        data["operator_id"] = str(membership.operator_id)
        op = await db.get(Operator, membership.operator_id)
        if op:
            data["operator_name"] = op.name
        if data["role"] == "user":
            if membership.role.value in ("owner", "manager"):
                data["role"] = "operator"
            elif membership.role.value == "coordinator":
                data["role"] = "coordinator"
    return data


@router.post(
    "/register",
    summary="Create a new account",
    dependencies=[Depends(rate_limit_auth)],
)
async def register(payload: RegisterRequest, db: DbSession):
    service = AuthService(db)
    user, debug_code = await service.register(payload)

    user_dict = await _serialize_user(user, db)
    data: dict = {
        "user": user_dict,
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

    user_dict = await _serialize_user(user, db)
    return responses.success(
        {**tokens, "user": user_dict},
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
    user_dict = await _serialize_user(user, db)
    return responses.success(
        {**tokens, "user": user_dict},
        "Token refreshed",
    )


@router.get("/me", summary="The currently authenticated user")
async def me(current_user: CurrentUser, db: DbSession):
    user_dict = await _serialize_user(current_user, db)
    return responses.success(user_dict, "OK")


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


@router.post(
    "/clerk-sync",
    summary="Synchronize authenticated Clerk user with database",
)
async def clerk_sync(
    request: Request,
    payload: ClerkSyncRequest,
    db: DbSession,
):
    """Sync a Clerk-authenticated user into the Tripzyy database.

    Security: The caller MUST supply a valid Clerk session token in the
    ``Authorization: Bearer <token>`` header.  The token is verified
    against Clerk's JWKS (public keys) so that:
    - Only genuinely authenticated Clerk users can call this endpoint.
    - The email and clerk_id come from the verified token / Clerk API,
      not from the untrusted POST body (defence against spoofing).
    """
    import logging
    from app.core.clerk import get_clerk_user_info, verify_clerk_token

    logger = logging.getLogger("tripzyy.clerk_sync")

    # ── 1. Extract and verify the Clerk session token ──────────────
    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        raise UnauthorizedError(
            "Clerk session token required. "
            "Send Authorization: Bearer <clerk_session_token>"
        )
    clerk_token = auth_header[7:].strip()
    if not clerk_token:
        raise UnauthorizedError("Empty Clerk session token")

    # Verify the JWT signature (raises UnauthorizedError on failure)
    token_payload = verify_clerk_token(clerk_token)
    clerk_user_id = token_payload.get("sub")
    if not clerk_user_id:
        raise UnauthorizedError("Clerk token missing user identity")

    # ── 2. Fetch authoritative user data from Clerk Backend API ────
    clerk_info = await get_clerk_user_info(clerk_token)

    # Use Clerk-verified email if available; fall back to body only
    # if the Backend API call returned nothing (CLERK_SECRET_KEY unset).
    email = (clerk_info.get("email") or payload.email or "").lower().strip()
    if not email:
        raise UnauthorizedError("Unable to determine user email")

    first_name = clerk_info.get("first_name") or payload.first_name or "Traveler"
    last_name = clerk_info.get("last_name") or payload.last_name or ""
    verified_clerk_id = clerk_info.get("clerk_id") or clerk_user_id

    # Role: prefer explicit payload role if specified as operator/coordinator/admin, then Clerk metadata, default user
    payload_role_val = getattr(payload.role, "value", str(payload.role)).lower()
    if payload_role_val in ("operator", "coordinator", "admin"):
        role_str = payload_role_val
    else:
        role_str = clerk_info.get("role") or payload.role

    if isinstance(role_str, str):
        from app.models.enums import UserRole
        try:
            role = UserRole(role_str)
        except ValueError:
            role = UserRole.USER
    else:
        role = role_str if role_str else UserRole.USER

    # ── 3. Upsert the user ────────────────────────────────────────
    # Try lookup by clerk_id first (most reliable), then by email
    user = None
    if verified_clerk_id:
        user = await db.scalar(
            select(User).where(User.clerk_id == verified_clerk_id)
        )
    if user is None:
        user = await UserRepository(db).get_by_email(email)

    if user is None:
        # Create new user
        user = User(
            email=email,
            first_name=first_name,
            last_name=last_name,
            role=role,
            is_email_verified=True,
            hashed_password=hash_password(secrets.token_urlsafe(32)),
            clerk_id=verified_clerk_id,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        logger.info("Created new user %s (clerk=%s)", email, verified_clerk_id)
    else:
        # Update existing user
        updated = False
        if not user.is_email_verified:
            user.is_email_verified = True
            updated = True
        if verified_clerk_id and user.clerk_id != verified_clerk_id:
            user.clerk_id = verified_clerk_id
            updated = True
        if role and user.role != role:
            user.role = role
            updated = True
        if updated:
            await db.commit()
            await db.refresh(user)
            logger.info("Updated user %s (clerk=%s)", email, verified_clerk_id)

    # ── 4. Auto-enroll operator/coordinator/admin into default operator ─
    if (role in ("operator", "coordinator", "admin") or
            str(user.role).lower() in ("operator", "coordinator", "admin", "userrole.operator", "userrole.coordinator", "userrole.admin")):
        from app.models.enums import OperatorRole

        existing_mem = await db.scalar(
            select(OperatorMember).where(
                OperatorMember.user_id == user.id,
                OperatorMember.is_active.is_(True),
            )
        )
        if not existing_mem:
            op = await db.scalar(
                select(Operator).where(Operator.slug == "tripzyy-journeys")
            )
            if op:
                role_val = getattr(user.role, "value", str(user.role)).lower()
                op_role = (
                    OperatorRole.COORDINATOR
                    if role_val == "coordinator" or role == "coordinator"
                    else OperatorRole.OWNER
                )
                title = (
                    "Field Coordinator"
                    if op_role == OperatorRole.COORDINATOR
                    else "Operations Lead"
                )
                db.add(
                    OperatorMember(
                        operator_id=op.id,
                        user_id=user.id,
                        role=op_role,
                        job_title=title,
                        is_active=True,
                    )
                )
                await db.commit()

    # ── 5. Issue Tripzyy JWT tokens ────────────────────────────────
    service = AuthService(db)
    tokens = service.issue_tokens(user)
    tokens.pop("_expires_at", None)
    serialized = await _serialize_user(user, db)
    return responses.success(
        {**tokens, "user": serialized},
        "User synchronized successfully",
    )

