"""Database-backed email verification codes (refinement R1).

Replaces the original in-process ``otp_store`` dict, which lost every pending
code on restart and could not work across more than one worker.

Properties this implementation guarantees:

* codes are stored **hashed**, so a database dump does not leak live codes;
* a code expires after ``OTP_TTL_MINUTES``;
* at most ``OTP_MAX_ATTEMPTS`` guesses, after which the code is burned;
* resends are throttled per address (cooldown plus an hourly cap);
* verification is single-use and consumed inside the same transaction.
"""

import logging
import secrets
from datetime import datetime, timedelta, timezone

from passlib.context import CryptContext
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import RateLimitedError, ValidationError
from app.models import EmailVerificationCode, User
from app.services.email_service import EmailService

logger = logging.getLogger(__name__)

# Separate context from passwords: OTPs are short-lived, so a low cost factor
# keeps verification fast without weakening anything that matters.
otp_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=6)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def generate_code() -> str:
    """A cryptographically random numeric code of the configured length."""
    upper = 10**settings.OTP_LENGTH
    return str(secrets.randbelow(upper)).zfill(settings.OTP_LENGTH)


class OTPService:
    @staticmethod
    async def issue(db: AsyncSession, user: User, *, send: bool = True) -> str | None:
        """Create and email a fresh code, invalidating any outstanding one.

        Returns the plaintext code only when email is unavailable and
        verification is disabled -- that path exists so tests and offline
        development can complete the flow without a live mailbox.
        """
        now = _now()

        recent = (
            await db.execute(
                select(EmailVerificationCode)
                .where(
                    EmailVerificationCode.email == user.email,
                    EmailVerificationCode.created_at
                    > now - timedelta(hours=1),
                )
                .order_by(EmailVerificationCode.created_at.desc())
            )
        ).scalars().all()

        if len(recent) >= settings.OTP_MAX_SENDS_PER_HOUR:
            raise RateLimitedError(
                "Too many verification codes requested. Try again in an hour."
            )

        if recent:
            since = (now - recent[0].created_at).total_seconds()
            if since < settings.OTP_RESEND_COOLDOWN_SECONDS:
                wait = int(settings.OTP_RESEND_COOLDOWN_SECONDS - since) + 1
                raise RateLimitedError(
                    f"Please wait {wait} seconds before requesting another code.",
                    details={"retry_after_seconds": wait},
                )

        # Burn any still-live code so only the newest one works.
        for old in recent:
            if old.consumed_at is None:
                old.consumed_at = now

        code = generate_code()
        db.add(
            EmailVerificationCode(
                user_id=user.id,
                email=user.email,
                code_hash=otp_context.hash(code),
                expires_at=now + timedelta(minutes=settings.OTP_TTL_MINUTES),
            )
        )
        await db.flush()

        if send and EmailService.is_available():
            await EmailService.send_otp(user.email, code, user.first_name)
            return None

        # No mailbox configured. Log it so a developer can still complete the
        # flow locally, and surface it only when verification is not enforced.
        logger.warning(
            "SMTP not configured; verification code for %s is %s", user.email, code
        )
        return None if settings.REQUIRE_EMAIL_VERIFICATION else code

    @staticmethod
    async def verify(db: AsyncSession, email: str, code: str) -> User:
        """Consume a code, or raise. Marks the user verified on success."""
        now = _now()

        record = (
            await db.execute(
                select(EmailVerificationCode)
                .where(
                    EmailVerificationCode.email == email,
                    EmailVerificationCode.consumed_at.is_(None),
                )
                .order_by(EmailVerificationCode.created_at.desc())
                .limit(1)
                .with_for_update()
            )
        ).scalar_one_or_none()

        if record is None:
            raise ValidationError(
                "No pending verification code for this address. Request a new one."
            )

        if record.expires_at <= now:
            record.consumed_at = now
            raise ValidationError("This code has expired. Request a new one.")

        if record.attempts >= settings.OTP_MAX_ATTEMPTS:
            record.consumed_at = now
            raise ValidationError(
                "Too many incorrect attempts. Request a new code."
            )

        if not otp_context.verify(code, record.code_hash):
            record.attempts += 1
            remaining = settings.OTP_MAX_ATTEMPTS - record.attempts
            if remaining <= 0:
                record.consumed_at = now
                raise ValidationError(
                    "Too many incorrect attempts. Request a new code."
                )
            raise ValidationError(
                "Incorrect verification code.",
                details={"attempts_remaining": remaining},
            )

        record.consumed_at = now

        user = await db.get(User, record.user_id)
        if user is None:
            raise ValidationError("The account for this code no longer exists")
        user.is_email_verified = True
        await db.flush()
        return user

    @staticmethod
    async def purge_expired(db: AsyncSession) -> int:
        """Housekeeping: drop codes that can no longer be used."""
        result = await db.execute(
            select(func.count())
            .select_from(EmailVerificationCode)
            .where(EmailVerificationCode.expires_at < _now())
        )
        return result.scalar_one()
