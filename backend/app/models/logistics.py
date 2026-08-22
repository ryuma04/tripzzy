"""Transport between stops, accommodation at a stop, and recorded expenses.

Spec sections 15, 19 and 20.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDMixin
from app.models.enums import ExpenseCategory, TransportType


class Transport(UUIDMixin, TimestampMixin, Base):
    """A leg between two stops (spec section 19).

    Stop references are nullable and SET NULL on delete so removing a stop
    does not silently destroy the transport record that referenced it.
    """

    __tablename__ = "transport"

    trip_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
    )
    origin_stop_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("trip_stops.id", ondelete="SET NULL")
    )
    destination_stop_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("trip_stops.id", ondelete="SET NULL")
    )
    transport_type: Mapped[TransportType] = mapped_column(
        SAEnum(
            TransportType,
            name="transport_type",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        default=TransportType.OTHER,
        server_default=TransportType.OTHER.value,
    )
    provider: Mapped[str | None] = mapped_column(String(120))
    departure_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    arrival_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    cost: Mapped[float] = mapped_column(
        Numeric(12, 2), nullable=False, default=0, server_default="0"
    )
    booking_ref: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)

    trip: Mapped["Trip"] = relationship(back_populates="transports")  # noqa: F821
    origin_stop: Mapped["TripStop | None"] = relationship(  # noqa: F821
        foreign_keys=[origin_stop_id]
    )
    destination_stop: Mapped["TripStop | None"] = relationship(  # noqa: F821
        foreign_keys=[destination_stop_id]
    )

    __table_args__ = (
        CheckConstraint("departure_time < arrival_time", name="time_order"),
        CheckConstraint("cost >= 0", name="cost_non_negative"),
        CheckConstraint(
            "origin_stop_id IS NULL OR destination_stop_id IS NULL "
            "OR origin_stop_id <> destination_stop_id",
            name="distinct_stops",
        ),
        Index("ix_transport_trip_id", "trip_id"),
        Index("ix_transport_departure_time", "departure_time"),
    )


class Accommodation(UUIDMixin, TimestampMixin, Base):
    """Lodging attached to a stop (spec section 20)."""

    __tablename__ = "accommodations"

    stop_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("trip_stops.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    address: Mapped[str | None] = mapped_column(Text)
    check_in: Mapped[date] = mapped_column(Date, nullable=False)
    check_out: Mapped[date] = mapped_column(Date, nullable=False)
    estimated_cost: Mapped[float] = mapped_column(
        Numeric(12, 2), nullable=False, default=0, server_default="0"
    )
    booking_url: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)

    stop: Mapped["TripStop"] = relationship(back_populates="accommodations")  # noqa: F821

    __table_args__ = (
        CheckConstraint("length(btrim(name)) >= 2", name="name_min_length"),
        CheckConstraint("check_in <= check_out", name="date_order"),
        CheckConstraint("estimated_cost >= 0", name="estimated_cost_non_negative"),
        Index("ix_accommodations_stop_id", "stop_id"),
    )


class Expense(UUIDMixin, TimestampMixin, Base):
    """An actually-spent amount, as opposed to a planned estimate.

    Spec section 31 requires ``amount > 0`` strictly -- a zero expense is not a
    meaningful record, so the constraint is ``>`` rather than ``>=``.
    """

    __tablename__ = "expenses"

    trip_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
    )
    stop_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("trip_stops.id", ondelete="SET NULL")
    )
    category: Mapped[ExpenseCategory] = mapped_column(
        SAEnum(
            ExpenseCategory,
            name="expense_category",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    trip: Mapped["Trip"] = relationship(back_populates="expenses")  # noqa: F821

    __table_args__ = (
        CheckConstraint("length(btrim(title)) >= 2", name="title_min_length"),
        CheckConstraint("amount > 0", name="amount_positive"),
        Index("ix_expenses_trip_id", "trip_id"),
        Index("ix_expenses_category", "category"),
        Index("ix_expenses_expense_date", "expense_date"),
    )
