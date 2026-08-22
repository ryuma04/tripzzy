"""SMTP delivery, isolated behind one service (refinement R1).

The rest of the application never touches aiosmtplib directly, so email can be
disabled, stubbed in tests, or swapped for another provider without touching
the auth flow.
"""

import logging
from email.message import EmailMessage

import aiosmtplib
import httpx

from app.core.config import settings
from app.core.exceptions import ServiceUnavailableError

logger = logging.getLogger(__name__)


class EmailService:
    @staticmethod
    def is_available() -> bool:
        return settings.email_configured

    @staticmethod
    async def send(to: str, subject: str, body: str, html: str | None = None) -> None:
        """Send one message via Google Apps Script or SMTP, or raise ``ServiceUnavailableError``.

        Never raises a bare exception: callers decide whether a delivery
        failure should abort their operation.
        """
        if not settings.email_configured:
            raise ServiceUnavailableError(
                "Email delivery is not configured on this server"
            )

        # --- Priority 1: Google Apps Script Webhook ---
        if settings.GOOGLE_APP_SCRIPT_URL:
            payload = {
                "to": to,
                "subject": subject,
                "body": body,
                "html": html,
                "name": settings.SMTP_FROM_NAME or "Tripzyy",
            }
            try:
                # GAS web apps redirect (302) to script.googleusercontent.com, so follow_redirects=True is required
                async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as client:
                    response = await client.post(
                        settings.GOOGLE_APP_SCRIPT_URL,
                        json=payload,
                        headers={"Content-Type": "application/json"},
                    )
                    response.raise_for_status()
                    
                    try:
                        data = response.json()
                        if isinstance(data, dict) and data.get("status") == "error":
                            logger.error("Google Apps Script email delivery error: %s", data.get("message"))
                            raise ServiceUnavailableError(
                                f"Could not send email: {data.get('message')}"
                            )
                    except ValueError:
                        # Non-JSON response but HTTP 200 OK
                        pass
                logger.info("Email sent to %s via Google Apps Script", to)
                return
            except Exception as exc:
                logger.error("Google Apps Script delivery to %s failed: %s", to, exc)
                raise ServiceUnavailableError(
                    "Could not send the email right now. Please try again shortly."
                ) from exc

        # --- Priority 2: Direct SMTP ---
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
            logger.info("Email sent to %s via SMTP", to)
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
