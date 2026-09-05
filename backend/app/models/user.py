"""User, preferences, OTP codes and token revocation."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDMixin
from app.models.enums import (
    ComfortTier,
    TravelPace,
    TravelStyle,
    UserRole,
    UserStatus,
)


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    first_name: Mapped[str] = mapped_column(String(50), nullable=False)
    last_name: Mapped[str] = mapped_column(String(50), nullable=False)
    # Always stored lowercased so uniqueness is genuinely case-insensitive.
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    phone: Mapped[str | None] = mapped_column(String(20))
    city: Mapped[str | None] = mapped_column(String(100))
    country: Mapped[str | None] = mapped_column(String(100))
    additional_info: Mapped[str | None] = mapped_column(Text)

    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)

    # Clerk external authentication provider ID.
    # Nullable because users created via email/password registration won't have one.
    clerk_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )

    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=UserRole.USER,
        server_default=UserRole.USER.value,
    )
    status: Mapped[UserStatus] = mapped_column(
        SAEnum(UserStatus, name="user_status", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=UserStatus.ACTIVE,
        server_default=UserStatus.ACTIVE.value,
    )
    is_email_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    avatar_url: Mapped[str | None] = mapped_column(String(500))

    preferences: Mapped["UserPreference | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    trips: Mapped[list["Trip"]] = relationship(  # noqa: F821
        back_populates="user", cascade="all, delete-orphan"
    )
    saved_destinations: Mapped[list["SavedDestination"]] = relationship(  # noqa: F821
        back_populates="user", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("length(btrim(first_name)) > 0", name="first_name_not_blank"),
        CheckConstraint("length(btrim(last_name)) > 0", name="last_name_not_blank"),
        CheckConstraint("email = lower(email)", name="email_lowercase"),
        CheckConstraint("position('@' in email) > 1", name="email_has_at"),
        Index("ix_users_email_lower", text("lower(email)"), unique=True),
        Index("ix_users_clerk_id", "clerk_id", unique=True),
        Index("ix_users_role", "role"),
        Index("ix_users_status", "status"),
    )

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def is_admin(self) -> bool:
        return self.role == UserRole.ADMIN

    @property
    def is_active(self) -> bool:
        return self.status == UserStatus.ACTIVE


class UserPreference(UUIDMixin, TimestampMixin, Base):
    """Spec section 11: PUT /api/v1/users/me/preferences."""

    __tablename__ = "user_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, default="INR", server_default="INR"
    )
    default_traveller_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
    preferred_categories: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    home_city: Mapped[str | None] = mapped_column(String(100))
    home_country: Mapped[str | None] = mapped_column(String(100))
    email_notifications: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )

    # --- Personalisation intake ---
    # These are what let the platform compose a tour around one traveller
    # instead of selling them a fixed package. They are also the inputs the
    # adaptation engine scores replacement options against, so a suggested
    # alternative respects the same preferences the original choice did.
    #
    # All nullable: a traveller who has not told us is different from one who
    # has no preference, and defaulting would silently invent an answer.
    travel_style: Mapped[TravelStyle | None] = mapped_column(
        SAEnum(
            TravelStyle,
            name="travel_style",
            values_callable=lambda e: [m.value for m in e],
        )
    )
    pace: Mapped[TravelPace | None] = mapped_column(
        SAEnum(
            TravelPace,
            name="travel_pace",
            values_callable=lambda e: [m.value for m in e],
        )
    )
    accommodation_class: Mapped[ComfortTier | None] = mapped_column(
        SAEnum(
            ComfortTier,
            name="comfort_tier",
            values_callable=lambda e: [m.value for m in e],
        )
    )
    transport_class: Mapped[ComfortTier | None] = mapped_column(
        SAEnum(
            ComfortTier,
            name="comfort_tier",
            values_callable=lambda e: [m.value for m in e],
            create_type=False,
        )
    )
    # Preferred transport modes, most-preferred first, as TransportType
    # values. Order carries meaning, so this is a list rather than a set.
    preferred_transport_modes: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    # Free-form interest tags beyond the fixed activity categories --
    # "street food", "birdwatching". Kept open so personalisation is not
    # capped by the catalog's taxonomy.
    interests: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    dietary_requirements: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    # Accessibility needs. Read during adaptation: a replacement that a
    # traveller cannot physically use is not a valid alternative.
    mobility_needs: Mapped[str | None] = mapped_column(Text)
    # Per-day ceiling, distinct from a trip's total budget. Used to flag a
    # plan that fits overall but front-loads spending into a few days.
    daily_budget_cap: Mapped[float | None] = mapped_column(Numeric(12, 2))

    user: Mapped["User"] = relationship(back_populates="preferences")

    __table_args__ = (
        CheckConstraint(
            "default_traveller_count >= 1", name="default_traveller_count_positive"
        ),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_iso4217"),
        CheckConstraint(
            "daily_budget_cap IS NULL OR daily_budget_cap >= 0",
            name="daily_budget_cap_non_negative",
        ),
    )


class EmailVerificationCode(UUIDMixin, TimestampMixin, Base):
    """Database-backed OTP (refinement R1).

    Replaces the in-process dict in the original scaffold, which lost every
    pending code on restart and could not work across more than one worker.
    The code itself is stored hashed, never in plaintext.
    """

    __tablename__ = "email_verification_codes"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    attempts: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("attempts >= 0", name="attempts_non_negative"),
        Index("ix_email_verification_codes_user_id", "user_id"),
        Index("ix_email_verification_codes_email", "email"),
        Index("ix_email_verification_codes_expires_at", "expires_at"),
    )


class RevokedToken(UUIDMixin, TimestampMixin, Base):
    """Backs a real POST /auth/logout (refinement R2).

    A bare JWT cannot be invalidated; recording its ``jti`` until natural
    expiry makes logout meaningful. Rows past ``expires_at`` are prunable.
    """

    __tablename__ = "revoked_tokens"

    jti: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    __table_args__ = (
        Index("ix_revoked_tokens_jti", "jti"),
        Index("ix_revoked_tokens_expires_at", "expires_at"),
    )
