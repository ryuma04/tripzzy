"""Authentication endpoints (spec section 27, /auth)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.security import HTTPAuthorizationCredentials

from app.core import responses
from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, bearer_scheme
from app.core.exceptions import ForbiddenError, UnauthorizedError
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
    data = {
        "id": str(user.id),
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email": user.email,
        "phone": user.phone,
        "city": user.city,
        "country": user.country,
        "additional_info": user.additional_info,
        "role": getattr(user.role, "value", str(user.role)).lower(),
        "status": getattr(user.status, "value", str(user.status)).lower(),
        "is_email_verified": user.is_email_verified,
        "avatar_url": user.avatar_url,
        "operator_role": None,
        "operator_id": None,
        "operator_name": None,
        "created_at": (
            user.created_at.isoformat()
            if hasattr(user.created_at, "isoformat")
            else str(user.created_at)
        ),
    }
    membership = await db.scalar(
        select(OperatorMember)
        .where(OperatorMember.user_id == user.id, OperatorMember.is_active.is_(True))
        .limit(1)
    )
    if membership:
        data["operator_role"] = (
            membership.role.value
            if hasattr(membership.role, "value")
            else str(membership.role)
        )
        data["operator_id"] = str(membership.operator_id)
        op = await db.get(Operator, membership.operator_id)
        if op:
            data["operator_name"] = op.name
        if data["role"] in ("user", "userrole.user"):
            if data["operator_role"] in ("owner", "manager"):
                data["role"] = "operator"
            elif data["operator_role"] == "coordinator":
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
    from app.core.exceptions import ErrorCode

    logger = logging.getLogger("tripzyy.clerk_sync")
    origin = request.headers.get("origin")

    try:
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
        try:
            clerk_info = await get_clerk_user_info(clerk_token)
        except Exception as exc:
            logger.warning("get_clerk_user_info warning: %s", exc)
            clerk_info = {}

        # Use Clerk-verified email if available; fall back to body
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

        from app.models.enums import UserRole
        if isinstance(role_str, str):
            try:
                role = UserRole(role_str.lower())
            except ValueError:
                role = UserRole.USER
        else:
            role = role_str if role_str else UserRole.USER

        # ── 3. Upsert the user ────────────────────────────────────────
        user = None
        if verified_clerk_id:
            user = await db.scalar(
                select(User).where(User.clerk_id == verified_clerk_id)
            )
        if user is None and email:
            user = await UserRepository(db).get_by_email(email)

        # ── Role boundary verification: Traveller cannot log in to Tour & Travel ──
        if user is not None:
            existing_user_role = getattr(user.role, "value", str(user.role)).lower()
            existing_mem = await db.scalar(
                select(OperatorMember).where(
                    OperatorMember.user_id == user.id,
                    OperatorMember.is_active.is_(True),
                ).limit(1)
            )
            is_staff_user = (
                existing_user_role in ("operator", "coordinator", "admin", "userrole.operator", "userrole.coordinator", "userrole.admin")
                or existing_mem is not None
            )

            # Block ordinary travellers from accessing Tour & Travel workspace
            if payload_role_val in ("operator", "coordinator"):
                if not is_staff_user:
                    raise ForbiddenError(
                        "This account is registered as a Traveller and cannot access "
                        "Tour & Travel operations. Please sign in to the Explorer workspace, "
                        "or use an authorized Tour Operator account."
                    )

            # Block non-admins from accessing Station Administrator workspace
            if payload_role_val == "admin":
                if existing_user_role not in ("admin", "userrole.admin"):
                    raise ForbiddenError(
                        "This account is not authorized to access Station Administration."
                    )

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
            try:
                await db.commit()
                await db.refresh(user)
                logger.info("Created new user %s (clerk=%s)", email, verified_clerk_id)
            except Exception as exc:
                logger.warning("Conflict creating user %s: %s; retrieving existing", email, exc)
                await db.rollback()
                user = await UserRepository(db).get_by_email(email)
                if not user and verified_clerk_id:
                    user = await db.scalar(select(User).where(User.clerk_id == verified_clerk_id))
        else:
            # Update existing user
            updated = False
            if not user.is_email_verified:
                user.is_email_verified = True
                updated = True
            if verified_clerk_id and user.clerk_id != verified_clerk_id:
                user.clerk_id = verified_clerk_id
                updated = True
            if role and role != UserRole.USER and user.role != role:
                user.role = role
                updated = True
            if updated:
                try:
                    await db.commit()
                    await db.refresh(user)
                    logger.info("Updated user %s (clerk=%s)", email, verified_clerk_id)
                except Exception as exc:
                    logger.warning("Conflict updating user %s: %s", email, exc)
                    await db.rollback()
                    user = await db.get(User, user.id)

        # ── 4. Auto-enroll operator/coordinator/admin into default operator ─
        user_role_str = getattr(user.role, "value", str(user.role)).lower()
        is_staff = (
            payload_role_val in ("operator", "coordinator", "admin") or
            user_role_str in ("operator", "coordinator", "admin", "userrole.operator", "userrole.coordinator", "userrole.admin")
        )
        if is_staff:
            from app.models.enums import OperatorRole

            existing_mem = await db.scalar(
                select(OperatorMember).where(
                    OperatorMember.user_id == user.id,
                ).limit(1)
            )
            if existing_mem:
                if not existing_mem.is_active:
                    existing_mem.is_active = True
                    try:
                        await db.commit()
                    except Exception as exc:
                        logger.warning("Could not reactivate member: %s", exc)
                        await db.rollback()
            else:
                op = await db.scalar(
                    select(Operator).where(Operator.slug == "tripzyy-journeys")
                )
                if op:
                    op_role = (
                        OperatorRole.COORDINATOR
                        if "coordinator" in user_role_str or payload_role_val == "coordinator"
                        else OperatorRole.OWNER
                    )
                    title = (
                        "Field Coordinator"
                        if op_role == OperatorRole.COORDINATOR
                        else "Operations Lead"
                    )
                    try:
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
                    except Exception as exc:
                        logger.warning("OperatorMember creation skipped: %s", exc)
                        await db.rollback()

        # ── 5. Issue Tripzyy JWT tokens ────────────────────────────────
        service = AuthService(db)
        tokens = service.issue_tokens(user)
        tokens.pop("_expires_at", None)
        serialized = await _serialize_user(user, db)
        resp = responses.success(
            {**tokens, "user": serialized},
            "User synchronized successfully",
        )
        if origin:
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Access-Control-Allow-Credentials"] = "true"
        return resp

    except (UnauthorizedError, ForbiddenError) as exc:
        await db.rollback()
        resp = responses.error(
            exc.message,
            code=exc.code,
            status_code=exc.status_code,
            details=exc.details,
        )
        if origin:
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Access-Control-Allow-Credentials"] = "true"
        return resp
    except Exception as exc:
        logger.exception("Unhandled error during clerk_sync: %s", exc)
        await db.rollback()
        resp = responses.error(
            f"Authentication sync error: {exc}",
            code=ErrorCode.INTERNAL_ERROR,
            status_code=500,
            details={"error": str(exc)} if settings.DEBUG else {},
        )
        if origin:
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Access-Control-Allow-Credentials"] = "true"
        return resp

