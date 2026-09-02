"""Tour operators, their staff, their vendors, and sellable inventory.

This is the supply side of the platform. A traveller composes a tour out of
``VendorService`` rows rather than choosing a fixed package, so this is also
the pool the "compare alternatives" view draws from and the pool the
adaptation engine searches when something has to be replaced.

``ServiceAvailability`` is what makes those answers real rather than
plausible: without per-date capacity, a suggested replacement is only a guess
that the hotel has a room on the night the trip actually moved to.
"""

import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
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
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDMixin
from app.models.enums import (
    ComfortTier,
    OperatorRole,
    ServiceType,
    TourGroupStatus,
)


class Operator(UUIDMixin, TimestampMixin, Base):
    """A tour operator: the business coordinating personalised tours."""

    __tablename__ = "operators"

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    logo_url: Mapped[str | None] = mapped_column(String(500))
    contact_email: Mapped[str | None] = mapped_column(String(255))
    contact_phone: Mapped[str | None] = mapped_column(String(20))
    city: Mapped[str | None] = mapped_column(String(100))
    country: Mapped[str | None] = mapped_column(String(100))
    rating: Mapped[Decimal | None] = mapped_column(Numeric(2, 1))
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )

    members: Mapped[list["OperatorMember"]] = relationship(
        back_populates="operator", cascade="all, delete-orphan"
    )
    vendors: Mapped[list["Vendor"]] = relationship(
        back_populates="operator", cascade="all, delete-orphan"
    )
    tour_groups: Mapped[list["TourGroup"]] = relationship(
        back_populates="operator", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("length(btrim(name)) >= 2", name="name_min_length"),
        CheckConstraint(
            "rating IS NULL OR (rating BETWEEN 0 AND 5)", name="rating_range"
        ),
        Index("ix_operators_slug", "slug"),
    )


class OperatorMember(UUIDMixin, TimestampMixin, Base):
    """Links a user account to an operator, with a role inside that operator."""

    __tablename__ = "operator_members"

    operator_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("operators.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[OperatorRole] = mapped_column(
        SAEnum(
            OperatorRole,
            name="operator_role",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        default=OperatorRole.COORDINATOR,
        server_default=OperatorRole.COORDINATOR.value,
    )
    job_title: Mapped[str | None] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )

    operator: Mapped["Operator"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship()  # noqa: F821

    __table_args__ = (
        UniqueConstraint(
            "operator_id", "user_id", name="uq_operator_members_operator_id_user_id"
        ),
        Index("ix_operator_members_operator_id", "operator_id"),
        Index("ix_operator_members_user_id", "user_id"),
    )


class TourGroup(UUIDMixin, TimestampMixin, Base):
    """A departure several travellers share.

    Personalised tours still get batched: a shared coach, a single guide, one
    coordinator on the ground. The group is what an operator actually staffs
    and schedules, so it holds the coordinator assignment rather than each
    booking doing so separately.
    """

    __tablename__ = "tour_groups"

    operator_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("operators.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    destination: Mapped[str | None] = mapped_column(String(100))
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    capacity: Mapped[int] = mapped_column(
        Integer, nullable=False, default=10, server_default="10"
    )
    # The staff member on the ground. SET NULL rather than CASCADE: removing
    # somebody from the roster must not delete the departures they ran.
    coordinator_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("operator_members.id", ondelete="SET NULL")
    )
    status: Mapped[TourGroupStatus] = mapped_column(
        SAEnum(
            TourGroupStatus,
            name="tour_group_status",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        default=TourGroupStatus.FORMING,
        server_default=TourGroupStatus.FORMING.value,
    )
    notes: Mapped[str | None] = mapped_column(Text)

    operator: Mapped["Operator"] = relationship(back_populates="tour_groups")
    coordinator: Mapped["OperatorMember | None"] = relationship()
    members: Mapped[list["TourGroupMember"]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("length(btrim(name)) >= 2", name="name_min_length"),
        CheckConstraint("start_date <= end_date", name="date_order"),
        CheckConstraint("capacity >= 1", name="capacity_positive"),
        Index("ix_tour_groups_operator_id", "operator_id"),
        Index("ix_tour_groups_start_date", "start_date"),
        Index("ix_tour_groups_status", "status"),
    )


class TourGroupMember(UUIDMixin, TimestampMixin, Base):
    """One traveller's place on a departure, via their booking."""

    __tablename__ = "tour_group_members"

    tour_group_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tour_groups.id", ondelete="CASCADE"),
        nullable=False,
    )
    booking_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("bookings.id", ondelete="CASCADE"),
        nullable=False,
    )
    traveller_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # How many seats this booking occupies, which is not always one person.
    seats: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
    notes: Mapped[str | None] = mapped_column(Text)

    group: Mapped["TourGroup"] = relationship(back_populates="members")
    booking: Mapped["Booking"] = relationship()  # noqa: F821
    traveller: Mapped["User"] = relationship()  # noqa: F821

    __table_args__ = (
        # A booking sits on one departure at a time.
        UniqueConstraint(
            "tour_group_id",
            "booking_id",
            name="uq_tour_group_members_tour_group_id_booking_id",
        ),
        CheckConstraint("seats >= 1", name="seats_positive"),
        Index("ix_tour_group_members_tour_group_id", "tour_group_id"),
        Index("ix_tour_group_members_booking_id", "booking_id"),
    )


class Vendor(UUIDMixin, TimestampMixin, Base):
    """A supplier an operator books through: hotel, transport firm, guide."""

    __tablename__ = "vendors"

    operator_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("operators.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    category: Mapped[ServiceType] = mapped_column(
        SAEnum(
            ServiceType,
            name="service_type",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        default=ServiceType.OTHER,
        server_default=ServiceType.OTHER.value,
    )
    city: Mapped[str | None] = mapped_column(String(100))
    country: Mapped[str | None] = mapped_column(String(100))
    contact_email: Mapped[str | None] = mapped_column(String(255))
    contact_phone: Mapped[str | None] = mapped_column(String(20))
    rating: Mapped[Decimal | None] = mapped_column(Numeric(2, 1))
    # 0-100. How often this vendor honours a booking without incident --
    # weighed when ranking replacements, since the cheapest option is a poor
    # suggestion if it is the one most likely to cancel again.
    reliability_score: Mapped[int] = mapped_column(
        Integer, nullable=False, default=80, server_default="80"
    )
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )

    operator: Mapped["Operator"] = relationship(back_populates="vendors")
    services: Mapped[list["VendorService"]] = relationship(
        back_populates="vendor", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("length(btrim(name)) >= 2", name="name_min_length"),
        CheckConstraint(
            "rating IS NULL OR (rating BETWEEN 0 AND 5)", name="rating_range"
        ),
        CheckConstraint(
            "reliability_score BETWEEN 0 AND 100", name="reliability_range"
        ),
        Index("ix_vendors_operator_id", "operator_id"),
        Index("ix_vendors_category", "category"),
        Index("ix_vendors_city", "city"),
    )


class VendorService(UUIDMixin, TimestampMixin, Base):
    """One bookable thing: a room type, a transfer, a guided walk.

    The unit a traveller actually picks, compares and swaps. ``comfort_tier``
    and ``tags`` are what preference matching runs against; the cancellation
    terms are what the adaptation engine costs a change with.
    """

    __tablename__ = "vendor_services"

    vendor_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("vendors.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Denormalised from the vendor so a service can be filtered by type
    # without a join, and so a vendor can sell across categories.
    service_type: Mapped[ServiceType] = mapped_column(
        SAEnum(
            ServiceType,
            name="service_type",
            values_callable=lambda e: [m.value for m in e],
            create_type=False,
        ),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    comfort_tier: Mapped[ComfortTier] = mapped_column(
        SAEnum(
            ComfortTier,
            name="comfort_tier",
            values_callable=lambda e: [m.value for m in e],
            create_type=False,
        ),
        nullable=False,
        default=ComfortTier.STANDARD,
        server_default=ComfortTier.STANDARD.value,
    )

    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=0, server_default="0"
    )
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, default="INR", server_default="INR"
    )
    # What one unit buys -- a night, a seat, a head. Purely descriptive, but
    # it is what a quote line has to say to be readable.
    unit_label: Mapped[str] = mapped_column(
        String(30), nullable=False, default="unit", server_default="unit"
    )
    duration_minutes: Mapped[int | None] = mapped_column(Integer)

    city: Mapped[str | None] = mapped_column(String(100))
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))

    # Cancellation terms, as days-before-service and a penalty percentage.
    # Held per service rather than per vendor because a flexible room and a
    # non-refundable one routinely sit side by side in the same hotel.
    free_cancellation_days: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    cancellation_penalty_pct: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    rating: Mapped[Decimal | None] = mapped_column(Numeric(2, 1))
    # Interest tags matched against UserPreference.interests.
    tags: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    # Anything type-specific that does not deserve a column: star rating,
    # baggage allowance, difficulty grade.
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )

    vendor: Mapped["Vendor"] = relationship(back_populates="services")
    availability: Mapped[list["ServiceAvailability"]] = relationship(
        back_populates="service", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("length(btrim(name)) >= 2", name="name_min_length"),
        CheckConstraint("unit_price >= 0", name="unit_price_non_negative"),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_iso4217"),
        CheckConstraint(
            "free_cancellation_days >= 0", name="free_cancellation_days_non_negative"
        ),
        CheckConstraint(
            "cancellation_penalty_pct BETWEEN 0 AND 100",
            name="cancellation_penalty_range",
        ),
        CheckConstraint(
            "rating IS NULL OR (rating BETWEEN 0 AND 5)", name="rating_range"
        ),
        CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes > 0",
            name="duration_positive",
        ),
        Index("ix_vendor_services_vendor_id", "vendor_id"),
        Index("ix_vendor_services_service_type", "service_type"),
        Index("ix_vendor_services_city", "city"),
        Index("ix_vendor_services_comfort_tier", "comfort_tier"),
    )


class ServiceAvailability(UUIDMixin, TimestampMixin, Base):
    """Capacity and price for one service on one date.

    Sparse by design: a missing row means "no published limit", not "sold
    out". Only dates an operator has actually constrained or repriced need to
    exist, so seeding a catalogue does not require a row per service per day.
    """

    __tablename__ = "service_availability"

    service_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("vendor_services.id", ondelete="CASCADE"),
        nullable=False,
    )
    on_date: Mapped[date] = mapped_column(Date, nullable=False)
    capacity_total: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    capacity_booked: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    # Overrides VendorService.unit_price for this date -- seasonal pricing,
    # which is exactly what makes shifting a trip's dates cost something.
    price_override: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    # Hard stop regardless of capacity: closed for maintenance, blacked out.
    is_blocked: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )

    service: Mapped["VendorService"] = relationship(back_populates="availability")

    __table_args__ = (
        UniqueConstraint(
            "service_id", "on_date", name="uq_service_availability_service_id_on_date"
        ),
        CheckConstraint("capacity_total >= 0", name="capacity_total_non_negative"),
        CheckConstraint("capacity_booked >= 0", name="capacity_booked_non_negative"),
        CheckConstraint(
            "capacity_booked <= capacity_total", name="not_overbooked"
        ),
        CheckConstraint(
            "price_override IS NULL OR price_override >= 0",
            name="price_override_non_negative",
        ),
        Index("ix_service_availability_service_id", "service_id"),
        Index("ix_service_availability_on_date", "on_date"),
    )

    @property
    def seats_left(self) -> int:
        return 0 if self.is_blocked else self.capacity_total - self.capacity_booked
