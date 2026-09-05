
"""Typed application settings, loaded from the environment / .env file."""

import logging
from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- App ---
    PROJECT_NAME: str = "Tripzyy"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: Literal["development", "test", "production"] = "development"
    DEBUG: bool = True

    # --- Database ---
    DATABASE_URL: PostgresDsn
    DB_ECHO: bool = False

    # --- JWT ---
    SECRET_KEY: str = Field(min_length=32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=60, ge=1)
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7, ge=1)
    # bcrypt work factor. 12 is the production default; the test suite drops
    # this to 4 so hashing does not dominate the run. Never lower it in a
    # real environment.
    BCRYPT_ROUNDS: int = Field(default=12, ge=4, le=16)

    # --- CORS ---
    # Comma-separated in .env, e.g. "http://localhost:3000,http://127.0.0.1:3000"
    CORS_ORIGINS: str = (
        "http://localhost:3000,http://127.0.0.1:3000,https://tripzzy-one.vercel.app"
    )
    CORS_ORIGIN_REGEX: str | None = (
        r"^https:\/\/(.*\.)?vercel\.app$|^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$|^https:\/\/(.*\.)?onrender\.com$"
    )

    # --- Email / OTP (R1) ---
    REQUIRE_EMAIL_VERIFICATION: bool = True
    GOOGLE_APP_SCRIPT_URL: str | None = None
    SMTP_SERVER: str | None = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM_NAME: str = "Tripzyy"
    SMTP_FROM_EMAIL: str | None = None
    EMAIL_SENDER: str | None = None
    EMAIL_APP_PASSWORD: str | None = None
    SMTP_START_TLS: bool = True
    SMTP_TIMEOUT_SECONDS: int = 15

    OTP_LENGTH: int = Field(default=6, ge=4, le=10)
    OTP_TTL_MINUTES: int = Field(default=10, ge=1)
    OTP_MAX_ATTEMPTS: int = Field(default=5, ge=1)
    OTP_RESEND_COOLDOWN_SECONDS: int = Field(default=60, ge=0)
    OTP_MAX_SENDS_PER_HOUR: int = Field(default=5, ge=1)

    # --- Rate limiting (R5) & Proxy security ---
    RATE_LIMIT_ENABLED: bool = True
    AUTH_RATE_LIMIT_PER_MINUTE: int = Field(default=10, ge=1)
    BEHIND_TRUSTED_PROXY: bool = False
    TRUSTED_PROXIES: str = "127.0.0.1,::1"

    # --- Payment provider configuration ---
    PAYMENT_PROVIDER: str = "simulated"
    PAYMENT_SIMULATED_FAILURE_RATE: float = 0.0
    STRIPE_SECRET_KEY: str | None = None
    RAZORPAY_KEY_SECRET: str | None = None

    # --- Business defaults ---
    DEFAULT_CURRENCY: str = "INR"
    MAX_TRIP_DAYS: int = 365
    MAX_TRAVELLERS: int = 50

    # --- Optional external services (must never be required, see spec 2.1) ---
    IMAGEKIT_PUBLIC_KEY: str | None = None
    IMAGEKIT_PRIVATE_KEY: str | None = None
    IMAGEKIT_URL_ENDPOINT: str | None = None
    UPLOAD_DIR: str = "uploads"

    # --- AI itinerary generation, Groq (E2, phase P10) ---
    GROQ_API_KEY: str | None = None
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    GROQ_MODEL: str = "openai/gpt-oss-120b"

    # --- Google Places API ---
    GOOGLE_PLACES_API: str | None = None

    # --- Clerk (external auth provider) ---
    CLERK_SECRET_KEY: str | None = None
    CLERK_PUBLISHABLE_KEY: str | None = None

    @field_validator("SECRET_KEY")
    @classmethod
    def _reject_placeholder_secret(cls, v: str) -> str:
        if v.strip().lower() in {"your_secret_key", "changeme", "secret"}:
            raise ValueError(
                "SECRET_KEY is still the placeholder value. Generate one with: "
                "python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
        return v

    @model_validator(mode="after")
    def _no_debug_in_production(self) -> "Settings":
        """Force ``DEBUG`` off in production, whatever the environment says.

        ``DEBUG`` defaults to true so local development is pleasant, which
        means a deployment that simply forgets to set it inherits the
        dangerous value. The unhandled-error handler in ``app.main`` puts
        ``str(exc)`` into the response body when DEBUG is on -- SQL, table
        names and connection details included -- so the default failing open
        is a real disclosure risk rather than a tidiness one.

        Overridden rather than rejected: refusing to boot would turn a
        forgotten variable into an outage, and there is exactly one safe
        value here, so the setting is corrected and the correction is logged.
        """
        if self.ENVIRONMENT == "production" and self.DEBUG:
            logging.getLogger("tripzyy").warning(
                "DEBUG was true with ENVIRONMENT=production; forcing it off. "
                "Set DEBUG=false explicitly to silence this."
            )
            object.__setattr__(self, "DEBUG", False)
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def trusted_proxy_list(self) -> list[str]:
        return [p.strip() for p in self.TRUSTED_PROXIES.split(",") if p.strip()]

    @property
    def email_configured(self) -> bool:
        """Email is usable if Google App Script URL or full SMTP credentials are present."""
        if bool(self.GOOGLE_APP_SCRIPT_URL):
            return True
        username = self.EMAIL_SENDER or self.SMTP_USERNAME
        password = self.EMAIL_APP_PASSWORD or self.SMTP_PASSWORD
        return bool(all([self.SMTP_SERVER, username, password]))

    @property
    def imagekit_configured(self) -> bool:
        return all(
            [
                self.IMAGEKIT_PUBLIC_KEY,
                self.IMAGEKIT_PRIVATE_KEY,
                self.IMAGEKIT_URL_ENDPOINT,
            ]
        )

    @property
    def ai_configured(self) -> bool:
        return bool(self.GROQ_API_KEY)

    @property
    def database_url_str(self) -> str:
        """The connection URL, forced onto settings a PgBouncer pooler tolerates.

        The database is Neon, reached through its ``-pooler`` (PgBouncer)
        endpoint. SQLAlchemy's asyncpg dialect keeps a prepared-statement
        cache whose handles do not survive PgBouncer handing the connection
        to a different backend between transactions, so it has to be off.
        Unlike asyncpg's own ``statement_cache_size`` -- which is a connect
        argument -- this one is only settable through the URL query string,
        and it is appended here so Alembic and the app agree on it.
        """
        url = str(self.DATABASE_URL)
        if "prepared_statement_cache_size" in url:
            return url
        return f"{url}{'&' if '?' in url else '?'}prepared_statement_cache_size=0"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
