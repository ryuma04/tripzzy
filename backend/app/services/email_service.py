"""SMTP delivery, isolated behind one service (refinement R1).

The rest of the application never touches aiosmtplib directly, so email can be
disabled, stubbed in tests, or swapped for another provider without touching
the auth flow.
"""

import logging
from email.message import EmailMessage

import aiosmtplib

from app.core.config import settings
from app.core.exceptions import ServiceUnavailableError

logger = logging.getLogger(__name__)


class EmailService:
    @staticmethod
    def is_available() -> bool:
        return settings.email_configured

    @staticmethod
    async def send(to: str, subject: str, body: str, html: str | None = None) -> None:
        """Send one message, or raise ``ServiceUnavailableError``.

        Never raises a bare exception: callers decide whether a delivery
        failure should abort their operation.
        """
        if not settings.email_configured:
            raise ServiceUnavailableError(
                "Email delivery is not configured on this server"
            )

        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_USERNAME}>"
        message["To"] = to
        message.set_content(body)
        if html:
            message.add_alternative(html, subtype="html")

        try:
            await aiosmtplib.send(
                message,
                hostname=settings.SMTP_SERVER,
                port=settings.SMTP_PORT,
                username=settings.SMTP_USERNAME,
                password=settings.SMTP_PASSWORD,
                start_tls=settings.SMTP_START_TLS,
                timeout=settings.SMTP_TIMEOUT_SECONDS,
            )
        except (aiosmtplib.SMTPException, OSError, TimeoutError) as exc:
            # Log the real cause; tell the client something actionable.
            logger.error("SMTP delivery to %s failed: %s", to, exc)
            raise ServiceUnavailableError(
                "Could not send the email right now. Please try again shortly."
            ) from exc

    @classmethod
    async def send_otp(cls, to: str, code: str, first_name: str = "") -> None:
        greeting = f"Hi {first_name}," if first_name else "Hi,"
        minutes = settings.OTP_TTL_MINUTES
        body = (
            f"{greeting}\n\n"
            f"Your Tripzyy verification code is {code}.\n"
            f"It expires in {minutes} minutes.\n\n"
            "If you did not create a Tripzyy account, you can ignore this email.\n"
        )
        html = (
            f"<p>{greeting}</p>"
            f"<p>Your Tripzyy verification code is "
            f"<strong style='font-size:22px;letter-spacing:3px'>{code}</strong></p>"
            f"<p>It expires in {minutes} minutes.</p>"
            "<p style='color:#666;font-size:12px'>If you did not create a "
            "Tripzyy account, you can ignore this email.</p>"
        )
        await cls.send(to, "Your Tripzyy verification code", body, html)
