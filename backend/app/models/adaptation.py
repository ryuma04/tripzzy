"""Dynamic tour management: change requests and the disruptions behind them.

This is the record of a tour *changing*, which is a different thing from the
tour itself. Everywhere else in the schema stores the current state; these two
tables store the argument about how it got there -- what was proposed, what it
was calculated to cost, who decided, and what was actually done.

Two design choices carry most of the weight:

**The impact report is snapshotted onto the row.** ``ChangeRequest.impact``
holds the figures as they were computed when the traveller submitted, not a
pointer to a recomputation. Prices, availability and cancellation windows all
move; if the report were regenerated at review time the operator would be
approving different numbers from the ones the traveller was shown, and nobody
could later say which set was agreed. Recomputing on demand is still possible
-- it is a preview endpoint -- but the agreed version is the stored one.

**A disruption is not a change.** One weather alert touches many bookings and
produces many change requests, each with its own arithmetic and its own
decision. Modelling the incident separately is what lets an operator see "the
Goa storm" as one thing while still handling eleven travellers individually.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

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
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDMixin
from app.models.enums import (
    ChangeRequestStatus,
    ChangeRequestType,
    DisruptionSeverity,
    DisruptionStatus,
    DisruptionType,
)


class Disruption(UUIDMixin, TimestampMixin, Base):
    """Something that went wrong, scoped to what it can affect.

    Scope is expressed as the intersection of whatever is set: a city and a
    date window ("storm in Goa next Tuesday"), a specific vendor service ("the
    Signature Rooms are shut"), or a single booking ("this traveller is ill").
    Leaving a field null widens the blast radius rather than narrowing it,
    which is why every one of them is optional and none of them defaults.
    """

    __tablename__ = "disruptions"

    # Who raised it. Operator-scoped so the console never shows one operator
    # another's incidents; nullable because the platform itself may raise one.
    operator_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("operators.id", ondelete="CASCADE")
    )
    raised_by_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    # --- scope ---
    trip_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE")
    )
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE")
    )
    service_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("vendor_services.id", ondelete="SET NULL")
    )
    city: Mapped[str | None] = mapped_column(String(100))
    from_date: Mapped[date | None] = mapped_column(Date)
    to_date: Mapped[date | None] = mapped_column(Date)

    type: Mapped[DisruptionType] = mapped_column(
        SAEnum(
            DisruptionType,
            name="disruption_type",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        default=DisruptionType.OTHER,
        server_default=DisruptionType.OTHER.value,
    )
    severity: Mapped[DisruptionSeverity] = mapped_column(
        SAEnum(
            DisruptionSeverity,
            name="disruption_severity",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        default=DisruptionSeverity.MEDIUM,
        server_default=DisruptionSeverity.MEDIUM.value,
    )
    status: Mapped[DisruptionStatus] = mapped_column(
        SAEnum(
            DisruptionStatus,
            name="disruption_status",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        default=DisruptionStatus.OPEN,
        server_default=DisruptionStatus.OPEN.value,
    )

    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # The assessment made when the incident was raised: which items are at
    # risk and what they are worth. Stored for the same reason a change
    # request stores its impact -- so the console can show what was known at
    # the time rather than what is true now.
    assessment: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    operator: Mapped["Operator | None"] = relationship()  # noqa: F821
    change_requests: Mapped[list["ChangeRequest"]] = relationship(
        back_populates="disruption"
    )

    __table_args__ = (
        CheckConstraint("length(btrim(title)) >= 3", name="title_min_length"),
        CheckConstraint(
            "from_date IS NULL OR to_date IS NULL OR from_date <= to_date",
            name="date_order",
        ),
        Index("ix_disruptions_operator_id", "operator_id"),
        Index("ix_disruptions_trip_id", "trip_id"),
        Index("ix_disruptions_booking_id", "booking_id"),
        Index("ix_disruptions_status", "status"),
        Index("ix_disruptions_from_date", "from_date"),
    )


class ChangeRequest(UUIDMixin, TimestampMixin, Base):
    """One proposed alteration to a booked tour, with its costed impact.

    The row is the audit trail. It survives approval, rejection and
    application, keeping the proposal, the numbers it was judged on, the
    decision and the note that came with it -- so "why did this trip get more
    expensive" has an answer that does not require reading a diff of the
    itinerary.
    """

    __tablename__ = "change_requests"

    trip_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Nullable: a change can be raised against a trip that has not been booked
    # yet, in which case there is nothing to reprice and the impact is purely
    # about schedule and dependencies.
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE")
    )
    booking_item_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("booking_items.id", ondelete="SET NULL")
    )
    # Denormalised from the booking so the operator console can scope its
    # queue with one index rather than a two-table join on every read.
    operator_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("operators.id", ondelete="SET NULL")
    )
    disruption_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("disruptions.id", ondelete="SET NULL")
    )

    requested_by_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("operator_members.id", ondelete="SET NULL")
    )

    type: Mapped[ChangeRequestType] = mapped_column(
        SAEnum(
            ChangeRequestType,
            name="change_request_type",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    status: Mapped[ChangeRequestStatus] = mapped_column(
        SAEnum(
            ChangeRequestStatus,
            name="change_request_status",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        default=ChangeRequestStatus.PENDING,
        server_default=ChangeRequestStatus.PENDING.value,
    )

    reason: Mapped[str | None] = mapped_column(Text)
    # The proposal itself: new date, replacement service, party size. Shape
    # varies by ``type``, which is why it is JSONB rather than a wide table of
    # mostly-null columns -- and why the schema layer validates it per type.
    proposal: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    # The engine's report, exactly as the traveller saw it when submitting.
    impact: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    # Groq's prose rendering of that report. Narration only: every number in
    # it comes from ``impact``, which the deterministic engine produced.
    ai_summary: Mapped[str | None] = mapped_column(Text)

    # Lifted out of ``impact`` so the queue can sort and total by money
    # without unpacking JSON on every row.
    net_cost_delta: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=0, server_default="0"
    )
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, default="INR", server_default="INR"
    )

    review_note: Mapped[str | None] = mapped_column(Text)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # What applying it actually did, written at apply time: items cancelled,
    # items created, money moved. The before-and-after the audit trail needs.
    applied_result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    trip: Mapped["Trip"] = relationship()  # noqa: F821
    booking: Mapped["Booking | None"] = relationship()  # noqa: F821
    booking_item: Mapped["BookingItem | None"] = relationship()  # noqa: F821
    requested_by: Mapped["User"] = relationship(  # noqa: F821
        foreign_keys=[requested_by_id]
    )
    reviewed_by: Mapped["OperatorMember | None"] = relationship()  # noqa: F821
    disruption: Mapped["Disruption | None"] = relationship(
        back_populates="change_requests"
    )

    __table_args__ = (
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_iso4217"),
        # A decision needs a timestamp and a timestamp needs a decision; an
        # approved request with no ``decided_at`` is a row nobody can audit.
        CheckConstraint(
            "(status IN ('pending', 'withdrawn')) = (decided_at IS NULL)",
            name="decided_at_matches_status",
        ),
        CheckConstraint(
            "applied_at IS NULL OR status = 'applied'",
            name="applied_at_requires_applied",
        ),
        Index("ix_change_requests_trip_id", "trip_id"),
        Index("ix_change_requests_booking_id", "booking_id"),
        Index("ix_change_requests_operator_id", "operator_id"),
        Index("ix_change_requests_disruption_id", "disruption_id"),
        Index("ix_change_requests_status", "status"),
        Index("ix_change_requests_created_at", "created_at"),
    )
