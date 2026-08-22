"""Registration, login, logout and token refresh (spec sections 4, 5, 23)."""

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    UnauthorizedError,
    ValidationError,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models import RevokedToken, User
from app.models.enums import UserRole, UserStatus
from app.repositories.user_repository import UserRepository
from app.schemas.auth import RegisterRequest
from app.services.email_service import EmailService
from app.services.otp_service import OTPService

logger = logging.getLogger(__name__)


class AuthService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.users = UserRepository(db)

    async def register(self, payload: RegisterRequest) -> tuple[User, str | None]:
        """Create an account.

        Everything happens in one transaction (spec section 32): the user row,
        their preferences and the verification code either all land or none do.
        The original scaffold emailed the code *before* inserting the user,
        which could leave a live code for an account that was never created.

        Returns ``(user, debug_code)`` where ``debug_code`` is only ever
        populated when SMTP is unconfigured and verification is not enforced.
        """
        if await self.users.email_exists(payload.email):
            raise ConflictError(
                "An account with this email already exists",
                details={"fields": {"email": "This email is already registered"}},
            )

        try:
            user = await self.users.create(
                first_name=payload.first_name,
                last_name=payload.last_name,
                email=payload.email,
                phone=payload.phone,
                city=payload.city,
                country=payload.country,
                additional_info=payload.additional_info,
                hashed_password=hash_password(payload.password),
                # Role is server-assigned. A client cannot register as admin.
                role=UserRole.USER,
                status=UserStatus.ACTIVE,
                is_email_verified=not settings.REQUIRE_EMAIL_VERIFICATION,
            )
            await self.users.ensure_preferences(user)
        except IntegrityError as exc:
            await self.db.rollback()
            # Lost the race against a concurrent signup with the same email.
            raise ConflictError(
                "An account with this email already exists",
                details={"fields": {"email": "This email is already registered"}},
            ) from exc

        debug_code: str | None = None
        if settings.REQUIRE_EMAIL_VERIFICATION or EmailService.is_available():
            try:
                debug_code = await OTPService.issue(self.db, user)
            except Exception as exc:
                # Delivery failed. If verification is mandatory the account is
                # unusable, so fail the whole registration rather than stranding
                # the user; otherwise the account is fine without it.
                if settings.REQUIRE_EMAIL_VERIFICATION:
                    await self.db.rollback()
                    raise
                logger.warning("Verification email skipped for %s: %s", user.email, exc)

        await self.db.commit()
        await self.db.refresh(user)
        return user, debug_code

    async def authenticate(self, email: str, password: str) -> User:
        """Verify credentials (spec section 4).

        Wrong email and wrong password produce the *same* error, so the
        response cannot be used to enumerate which addresses are registered.
        """
        user = await self.users.get_by_email(email)

        if user is None:
            # Constant-ish work on the miss path so timing does not leak
            # whether the address exists.
            hash_password("dummy-password-for-timing-parity")
            raise UnauthorizedError("Invalid email or password")

        if not verify_password(password, user.hashed_password):
            raise UnauthorizedError("Invalid email or password")

        if user.status == UserStatus.SUSPENDED:
            raise ForbiddenError(
                "This account has been suspended. Contact support for help."
            )
        if user.status == UserStatus.DELETED:
            raise UnauthorizedError("Invalid email or password")

        if settings.REQUIRE_EMAIL_VERIFICATION and not user.is_email_verified:
            raise ForbiddenError(
                "Please verify your email address before signing in",
                details={"verification_required": True, "email": user.email},
            )

        return user

    def issue_tokens(self, user: User) -> dict:
        access, _, expires_at = create_access_token(user.id, user.role.value)
        refresh, _, _ = create_refresh_token(user.id)
        return {
            "access_token": access,
            "refresh_token": refresh,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "_expires_at": expires_at,
        }

    async def logout(self, token: str) -> None:
        """Revoke the presented access token (refinement R2).

        A bare JWT cannot be invalidated, so its ``jti`` is recorded until the
        token would have expired anyway. ``get_current_user`` checks this list.
        """
        payload = decode_token(token, expected_type="access")
        jti = payload.get("jti")
        if not jti:
            return

        already = await self.db.scalar(
            select(RevokedToken.id).where(RevokedToken.jti == jti)
        )
        if already is not None:
            return

        expires_at = datetime.fromtimestamp(
            payload.get("exp", 0), tz=timezone.utc
        )
        try:
            self.db.add(
                RevokedToken(
                    jti=jti,
                    user_id=uuid.UUID(str(payload["sub"])),
                    expires_at=expires_at,
                )
            )
            await self.db.commit()
        except IntegrityError:
            # Concurrent logout of the same token; the desired state holds.
            await self.db.rollback()

    async def refresh(self, refresh_token: str) -> tuple[User, dict]:
        payload = decode_token(refresh_token, expected_type="refresh")

        jti = payload.get("jti")
        if jti:
            revoked = await self.db.scalar(
                select(RevokedToken.id).where(RevokedToken.jti == jti)
            )
            if revoked is not None:
                raise UnauthorizedError("This session has been logged out")

        try:
            user_id = uuid.UUID(str(payload["sub"]))
        except (ValueError, KeyError) as exc:
            raise UnauthorizedError("Malformed token") from exc

        user = await self.users.get_by_id(user_id)
        if user is None or user.status != UserStatus.ACTIVE:
            raise UnauthorizedError("This account is no longer active")

        return user, self.issue_tokens(user)

    async def change_password(
        self, user: User, current_password: str, new_password: str
    ) -> None:
        if not verify_password(current_password, user.hashed_password):
            raise ValidationError(
                "Your current password is incorrect",
                details={"fields": {"current_password": "Incorrect password"}},
            )
        if verify_password(new_password, user.hashed_password):
            raise ValidationError(
                "The new password must be different from the current one",
                details={"fields": {"new_password": "Choose a different password"}},
            )
        user.hashed_password = hash_password(new_password)
        await self.db.commit()
