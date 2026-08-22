
"""Typed application settings, loaded from the environment / .env file."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn, field_validator
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
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

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

    # --- Rate limiting (R5) ---
    RATE_LIMIT_ENABLED: bool = True
    AUTH_RATE_LIMIT_PER_MINUTE: int = Field(default=10, ge=1)

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

    @field_validator("SECRET_KEY")
    @classmethod
    def _reject_placeholder_secret(cls, v: str) -> str:
        if v.strip().lower() in {"your_secret_key", "changeme", "secret"}:
            raise ValueError(
                "SECRET_KEY is still the placeholder value. Generate one with: "
                "python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

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
        return str(self.DATABASE_URL)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
