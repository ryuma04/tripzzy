"""Bookings, the components inside them, and payments against them.

``BookingItem`` is the spine of the platform. It is the single row that ties a
piece of the itinerary to a piece of vendor inventory on a specific date at an
agreed price, and it is what the adaptation engine actually operates on: when
a date moves or a hotel cancels, the change is expressed as items being
cancelled, repriced or replaced.

Prices are copied onto the item rather than read through to the service.
A booking is an agreement about a number, and that number must not silently
change when an operator reprices their catalogue tomorrow. The same applies to
cancellation terms, which are snapshotted for exactly the same reason -- the
refund a traveller is owed is the one that applied when they booked.
"""

import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

from sqlalchemy import (
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
    Time,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDMixin
from app.models.enums import (
    BookingItemStatus,
    BookingStatus,
    PaymentKind,
    PaymentStatus,
    ServiceType,
)


class Booking(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "bookings"

    trip_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
    )
    traveller_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Nullable so a self-planned trip can be booked without an operator in
    # the middle; assigning one later is what brings it into their console.
    operator_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("operators.id", ondelete="SET NULL")
    )

    # Human-quotable, unique. What a traveller reads out on the phone.
    reference: Mapped[str] = mapped_column(String(16), nullable=False, unique=True)
    status: Mapped[BookingStatus] = mapped_column(
        SAEnum(
            BookingStatus,
            name="booking_status",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        default=BookingStatus.DRAFT,
        server_default=BookingStatus.DRAFT.value,
    )

    # Denormalised totals. Recomputed from the items whenever they change, but
    # stored so a listing does not have to aggregate every item to show a
    # price, and so a cancelled booking keeps the figure it was agreed at.
    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=0, server_default="0"
    )
    discount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=0, server_default="0"
    )
    tax: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=0, server_default="0"
    )
    total: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=0, server_default="0"
    )
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, default="INR", server_default="INR"
    )

    notes: Mapped[str | None] = mapped_column(Text)
    placed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    trip: Mapped["Trip"] = relationship()  # noqa: F821
    traveller: Mapped["User"] = relationship()  # noqa: F821
    operator: Mapped["Operator | None"] = relationship()  # noqa: F821
    items: Mapped[list["BookingItem"]] = relationship(
        back_populates="booking",
        cascade="all, delete-orphan",
        order_by="BookingItem.service_date",
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="booking",
        cascade="all, delete-orphan",
        order_by="Payment.created_at",
    )

    __table_args__ = (
        CheckConstraint("subtotal >= 0", name="subtotal_non_negative"),
        CheckConstraint("discount >= 0", name="discount_non_negative"),
        CheckConstraint("tax >= 0", name="tax_non_negative"),
        CheckConstraint("total >= 0", name="total_non_negative"),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_iso4217"),
        Index("ix_bookings_trip_id", "trip_id"),
        Index("ix_bookings_traveller_id", "traveller_id"),
        Index("ix_bookings_operator_id", "operator_id"),
        Index("ix_bookings_status", "status"),
        Index("ix_bookings_reference", "reference"),
    )


class BookingItem(UUIDMixin, TimestampMixin, Base):
    """One booked component. The unit adaptation operates on."""

    __tablename__ = "booking_items"

    booking_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("bookings.id", ondelete="CASCADE"),
        nullable=False,
    )
    # SET NULL rather than CASCADE: retiring a service from the catalogue must
    # not delete the record that somebody booked it.
    service_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("vendor_services.id", ondelete="SET NULL")
    )
    stop_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("trip_stops.id", ondelete="SET NULL")
    )
    itinerary_activity_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("itinerary_activities.id", ondelete="SET NULL"),
    )

    component_type: Mapped[ServiceType] = mapped_column(
        SAEnum(
            ServiceType,
            name="service_type",
            values_callable=lambda e: [m.value for m in e],
            create_type=False,
        ),
        nullable=False,
    )
    # Snapshot of the service name, so a voucher still reads correctly after
    # the vendor renames or delists the product.
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    vendor_name: Mapped[str | None] = mapped_column(String(160))
    city: Mapped[str | None] = mapped_column(String(100))

    service_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)
    start_time: Mapped[time | None] = mapped_column(Time)
    end_time: Mapped[time | None] = mapped_column(Time)

    quantity: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
    units: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=0, server_default="0"
    )
    total_price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=0, server_default="0"
    )

    # Snapshotted terms. The refund owed is the one that applied at booking,
    # not whatever the vendor's policy says by the time of cancellation.
    free_cancellation_days: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    cancellation_penalty_pct: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    status: Mapped[BookingItemStatus] = mapped_column(
        SAEnum(
            BookingItemStatus,
            name="booking_item_status",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        default=BookingItemStatus.PENDING,
        server_default=BookingItemStatus.PENDING.value,
    )
    # Points at the item that superseded this one, so a replacement chain can
    # be walked when explaining what changed and why.
    replaced_by_item_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("booking_items.id", ondelete="SET NULL")
    )
    notes: Mapped[str | None] = mapped_column(Text)
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    booking: Mapped["Booking"] = relationship(back_populates="items")
    service: Mapped["VendorService | None"] = relationship()  # noqa: F821

    __table_args__ = (
        CheckConstraint("quantity >= 1", name="quantity_positive"),
        CheckConstraint("units >= 1", name="units_positive"),
        CheckConstraint("unit_price >= 0", name="unit_price_non_negative"),
        CheckConstraint("total_price >= 0", name="total_price_non_negative"),
        CheckConstraint(
            "end_date IS NULL OR end_date >= service_date", name="date_order"
        ),
        CheckConstraint(
            "cancellation_penalty_pct BETWEEN 0 AND 100",
            name="cancellation_penalty_range",
        ),
        CheckConstraint(
            "replaced_by_item_id IS NULL OR replaced_by_item_id <> id",
            name="no_self_replacement",
        ),
        Index("ix_booking_items_booking_id", "booking_id"),
        Index("ix_booking_items_service_id", "service_id"),
        Index("ix_booking_items_service_date", "service_date"),
        Index("ix_booking_items_status", "status"),
    )


class Payment(UUIDMixin, TimestampMixin, Base):
    """A movement of money against a booking.

    Refunds are rows too, with a negative-signed ``kind`` rather than a
    negative amount: keeping every amount positive means a sum over payments
    is never accidentally a net figure, and the ledger reads the way an
    accountant expects.
    """

    __tablename__ = "payments"

    booking_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("bookings.id", ondelete="CASCADE"),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, default="INR", server_default="INR"
    )
    kind: Mapped[PaymentKind] = mapped_column(
        SAEnum(
            PaymentKind,
            name="payment_kind",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        default=PaymentKind.FULL,
        server_default=PaymentKind.FULL.value,
    )
    status: Mapped[PaymentStatus] = mapped_column(
        SAEnum(
            PaymentStatus,
            name="payment_status",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        default=PaymentStatus.INITIATED,
        server_default=PaymentStatus.INITIATED.value,
    )
    method: Mapped[str | None] = mapped_column(String(40))
    # The simulated gateway's own reference, so the ledger looks like a real
    # one and a support conversation has something to quote.
    gateway_reference: Mapped[str | None] = mapped_column(String(64))
    failure_reason: Mapped[str | None] = mapped_column(String(200))
    # Set when this row reverses an earlier one.
    refund_of_payment_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("payments.id", ondelete="SET NULL")
    )

    authorized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    booking: Mapped["Booking"] = relationship(back_populates="payments")

    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_iso4217"),
        CheckConstraint(
            "refund_of_payment_id IS NULL OR refund_of_payment_id <> id",
            name="no_self_refund",
        ),
        Index("ix_payments_booking_id", "booking_id"),
        Index("ix_payments_status", "status"),
        Index("ix_payments_created_at", "created_at"),
    )
