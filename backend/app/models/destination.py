"""Destination catalog and the activities available at each destination.

Spec section 21/22: one destination has many available activities. These tables
are the dynamic data source behind the search screens and the trip-creation
suggestions -- they are seeded into PostgreSQL, never read from JSON at
runtime (spec sections 2.1 and 38).
"""

import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDMixin
from app.models.enums import ActivityCategory


class Destination(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "destinations"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    country: Mapped[str] = mapped_column(String(100), nullable=False)
    region: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    # Relative expensiveness, 1 (cheap) to 5 (expensive); drives suggestions.
    cost_index: Mapped[int] = mapped_column(
        Integer, nullable=False, default=3, server_default="3"
    )
    popularity_score: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    image_url: Mapped[str | None] = mapped_column(String(500))
    latitude: Mapped[float | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[float | None] = mapped_column(Numeric(9, 6))

    activities: Mapped[list["ActivityCatalog"]] = relationship(
        back_populates="destination", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("length(btrim(name)) > 0", name="name_not_blank"),
        CheckConstraint("length(btrim(country)) > 0", name="country_not_blank"),
        CheckConstraint("cost_index BETWEEN 1 AND 5", name="cost_index_range"),
        CheckConstraint("popularity_score >= 0", name="popularity_non_negative"),
        CheckConstraint(
            "latitude IS NULL OR (latitude BETWEEN -90 AND 90)",
            name="latitude_range",
        ),
        CheckConstraint(
            "longitude IS NULL OR (longitude BETWEEN -180 AND 180)",
            name="longitude_range",
        ),
        # Case-insensitive uniqueness: "Goa, India" cannot be inserted twice.
        Index(
            "uq_destinations_name_country",
            text("lower(name)"),
            text("lower(country)"),
            unique=True,
        ),
        Index("ix_destinations_country", "country"),
        Index("ix_destinations_region", "region"),
        Index("ix_destinations_popularity", "popularity_score"),
    )


class ActivityCatalog(UUIDMixin, TimestampMixin, Base):
    """A bookable/doable thing at a destination.

    Distinct from ``ItineraryActivity``: this is the catalog users search and
    pick from; that is the scheduled instance inside somebody's trip.
    """

    __tablename__ = "activities"

    destination_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("destinations.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[ActivityCategory] = mapped_column(
        SAEnum(
            ActivityCategory,
            name="activity_category",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        default=ActivityCategory.OTHER,
        server_default=ActivityCategory.OTHER.value,
    )
    estimated_cost: Mapped[float] = mapped_column(
        Numeric(12, 2), nullable=False, default=0, server_default="0"
    )
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, default="INR", server_default="INR"
    )
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    image_url: Mapped[str | None] = mapped_column(String(500))
    rating: Mapped[float | None] = mapped_column(Numeric(2, 1))
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )

    destination: Mapped["Destination"] = relationship(back_populates="activities")

    __table_args__ = (
        CheckConstraint("length(btrim(title)) > 0", name="title_not_blank"),
        CheckConstraint("estimated_cost >= 0", name="estimated_cost_non_negative"),
        CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes > 0",
            name="duration_positive",
        ),
        CheckConstraint(
            "rating IS NULL OR (rating BETWEEN 0 AND 5)", name="rating_range"
        ),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_iso4217"),
        Index("ix_activities_destination_id", "destination_id"),
        Index("ix_activities_category", "category"),
        Index("ix_activities_cost", "estimated_cost"),
    )


class SavedDestination(TimestampMixin, Base):
    """A user's bookmarked destinations (spec section 21)."""

    __tablename__ = "saved_destinations"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    destination_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("destinations.id", ondelete="CASCADE"),
        primary_key=True,
    )

    user: Mapped["User"] = relationship(back_populates="saved_destinations")  # noqa: F821
    destination: Mapped["Destination"] = relationship()
