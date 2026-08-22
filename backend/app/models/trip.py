"""Trip and TripStop -- the multi-city backbone described in spec section 9."""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDMixin
from app.models.enums import TripStatus


class Trip(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "trips"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    budget: Mapped[float] = mapped_column(
        Numeric(12, 2), nullable=False, default=0, server_default="0"
    )
    traveller_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, default="INR", server_default="INR"
    )
    cover_image_url: Mapped[str | None] = mapped_column(String(500))

    # Persisted for querying/filtering, but always recomputed server-side on
    # read (refinement R3) -- the client's value is never trusted.
    status: Mapped[TripStatus] = mapped_column(
        SAEnum(TripStatus, name="trip_status", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=TripStatus.DRAFT,
        server_default=TripStatus.DRAFT.value,
    )

    # --- Sharing (spec section 16) ---
    is_public: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    share_slug: Mapped[str | None] = mapped_column(String(64), unique=True)

    cloned_from_trip_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("trips.id", ondelete="SET NULL")
    )
    # Soft delete (refinement R8): a mis-click cannot destroy a demo trip.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship(back_populates="trips")  # noqa: F821
    stops: Mapped[list["TripStop"]] = relationship(
        back_populates="trip",
        cascade="all, delete-orphan",
        order_by="TripStop.order_index",
    )
    expenses: Mapped[list["Expense"]] = relationship(  # noqa: F821
        back_populates="trip", cascade="all, delete-orphan"
    )
    transports: Mapped[list["Transport"]] = relationship(  # noqa: F821
        back_populates="trip", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("length(btrim(title)) >= 3", name="title_min_length"),
        # Spec section 31: the single most important trip rule.
        CheckConstraint("start_date <= end_date", name="date_order"),
        CheckConstraint("budget >= 0", name="budget_non_negative"),
        CheckConstraint("traveller_count >= 1", name="traveller_count_positive"),
        CheckConstraint("traveller_count <= 50", name="traveller_count_max"),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_iso4217"),
        # A public trip must have a slug to be reachable, and vice versa.
        CheckConstraint(
            "(is_public = false AND share_slug IS NULL) OR "
            "(is_public = true AND share_slug IS NOT NULL)",
            name="public_requires_slug",
        ),
        CheckConstraint(
            "cloned_from_trip_id IS NULL OR cloned_from_trip_id <> id",
            name="no_self_clone",
        ),
        Index("ix_trips_user_id", "user_id"),
        Index("ix_trips_status", "status"),
        Index("ix_trips_start_date", "start_date"),
        Index("ix_trips_share_slug", "share_slug"),
        Index("ix_trips_deleted_at", "deleted_at"),
    )

    @property
    def duration_days(self) -> int:
        return (self.end_date - self.start_date).days + 1


class TripStop(UUIDMixin, TimestampMixin, Base):
    """One city/destination leg of a trip (spec section 9)."""

    __tablename__ = "trip_stops"

    trip_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Nullable: a user may add a city that is not yet in the catalog.
    destination_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("destinations.id", ondelete="SET NULL")
    )
    city_name: Mapped[str] = mapped_column(String(100), nullable=False)
    country: Mapped[str | None] = mapped_column(String(100))
    arrival_date: Mapped[date] = mapped_column(Date, nullable=False)
    departure_date: Mapped[date] = mapped_column(Date, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    trip: Mapped["Trip"] = relationship(back_populates="stops")
    destination: Mapped["Destination | None"] = relationship()  # noqa: F821
    activities: Mapped[list["ItineraryActivity"]] = relationship(  # noqa: F821
        back_populates="stop",
        cascade="all, delete-orphan",
        order_by="ItineraryActivity.order_index",
    )
    accommodations: Mapped[list["Accommodation"]] = relationship(  # noqa: F821
        back_populates="stop", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("length(btrim(city_name)) >= 2", name="city_name_min_length"),
        # Spec section 31: arrival_date <= departure_date.
        CheckConstraint("arrival_date <= departure_date", name="date_order"),
        CheckConstraint("order_index >= 0", name="order_index_non_negative"),
        # DEFERRABLE so a reorder can renumber every stop inside one
        # transaction without transiently colliding.
        UniqueConstraint(
            "trip_id",
            "order_index",
            name="uq_trip_stops_trip_id_order_index",
            deferrable=True,
            initially="DEFERRED",
        ),
        Index("ix_trip_stops_trip_id", "trip_id"),
        Index("ix_trip_stops_destination_id", "destination_id"),
    )
