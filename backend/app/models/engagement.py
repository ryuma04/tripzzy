"""Assist conversations and reviews -- the two ends of the tour lifecycle.

*Assist* is what happens while a tour is running: a traveller has a question,
and it reaches the coordinator actually on the ground. *Review* is what happens
after it finishes, and it is not merely a testimonial -- ratings written here
feed the ranking that chooses components for the next traveller, which is what
closes the loop between Complete and Discover.

Two decisions worth stating:

**An AI answer is labelled as one.** ``AssistMessage.sender`` distinguishes a
coordinator from the concierge rather than hiding the difference behind a
nullable ``sender_id``. A traveller is entitled to know whether a person
answered them, and an answer that only looks human is the one thing this
feature must not do.

**A review names its subject explicitly.** ``ReviewSubject`` is stored rather
than inferred from whichever of four nullable foreign keys happens to be set,
so "every review of this vendor" is an index lookup and not a scan.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDMixin
from app.models.enums import AssistSender, AssistThreadStatus, ReviewSubject


class AssistThread(UUIDMixin, TimestampMixin, Base):
    """One support conversation, about one trip.

    Scoped to a trip rather than free-floating because every useful answer
    depends on trip context -- which city, which dates, what is booked. A
    thread with no trip would be a generic contact form, which is not what a
    traveller mid-tour needs.
    """

    __tablename__ = "assist_threads"

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
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("bookings.id", ondelete="SET NULL")
    )
    # Denormalised so a coordinator's queue is one indexed read rather than a
    # join through bookings on every poll.
    operator_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("operators.id", ondelete="SET NULL")
    )
    # SET NULL rather than CASCADE: a coordinator leaving must not delete the
    # conversations they handled.
    assigned_member_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("operator_members.id", ondelete="SET NULL")
    )

    subject: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[AssistThreadStatus] = mapped_column(
        SAEnum(
            AssistThreadStatus,
            name="assist_thread_status",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        default=AssistThreadStatus.OPEN,
        server_default=AssistThreadStatus.OPEN.value,
    )
    # Sorting a queue by ``updated_at`` would reorder it on any edit, including
    # an assignment; this moves only when somebody actually says something.
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    trip: Mapped["Trip"] = relationship()  # noqa: F821
    traveller: Mapped["User"] = relationship()  # noqa: F821
    assigned_member: Mapped["OperatorMember | None"] = relationship()  # noqa: F821
    messages: Mapped[list["AssistMessage"]] = relationship(
        back_populates="thread",
        cascade="all, delete-orphan",
        order_by="AssistMessage.created_at",
    )

    __table_args__ = (
        CheckConstraint("length(btrim(subject)) >= 3", name="subject_min_length"),
        Index("ix_assist_threads_trip_id", "trip_id"),
        Index("ix_assist_threads_traveller_id", "traveller_id"),
        Index("ix_assist_threads_operator_id", "operator_id"),
        Index("ix_assist_threads_status", "status"),
        Index("ix_assist_threads_last_message_at", "last_message_at"),
    )


class AssistMessage(UUIDMixin, TimestampMixin, Base):
    """One message in a thread, always attributed."""

    __tablename__ = "assist_messages"

    thread_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("assist_threads.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Null for an AI message: there is no account behind it, and inventing one
    # would let the concierge be mistaken for a colleague.
    sender_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    sender: Mapped[AssistSender] = mapped_column(
        SAEnum(
            AssistSender,
            name="assist_sender",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    sender_name: Mapped[str | None] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # What the concierge was told when it answered: the trip facts it was
    # handed. Kept so a wrong answer can be diagnosed rather than guessed at.
    context: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    thread: Mapped["AssistThread"] = relationship(back_populates="messages")

    __table_args__ = (
        CheckConstraint("length(btrim(body)) >= 1", name="body_not_empty"),
        # An AI message has no author; every human message has one.
        CheckConstraint(
            "(sender = 'ai') = (sender_id IS NULL)",
            name="ai_messages_have_no_author",
        ),
        Index("ix_assist_messages_thread_id", "thread_id"),
        Index("ix_assist_messages_created_at", "created_at"),
    )


class Review(UUIDMixin, TimestampMixin, Base):
    """A rating written after the fact, which then shapes what gets ranked.

    Reviews are gated on having actually been there: the service layer refuses
    one unless the author holds a matching booking. A rating that anybody can
    leave is worthless as an input to the ranker, and this rating is an input
    to the ranker.
    """

    __tablename__ = "reviews"

    author_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    subject: Mapped[ReviewSubject] = mapped_column(
        SAEnum(
            ReviewSubject,
            name="review_subject",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )

    # Exactly one of these is set, matching ``subject``.
    trip_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE")
    )
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("vendors.id", ondelete="CASCADE")
    )
    service_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("vendor_services.id", ondelete="CASCADE")
    )
    operator_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("operators.id", ondelete="CASCADE")
    )
    # The evidence the author was actually there.
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("bookings.id", ondelete="SET NULL")
    )

    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(String(160))
    body: Mapped[str | None] = mapped_column(Text)
    # Ratings from a completed, paid booking are the ones worth weighting.
    is_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    is_public: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )

    author: Mapped["User"] = relationship()  # noqa: F821

    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="rating_range"),
        # The subject column and the foreign keys must agree, and exactly one
        # target may be set. Enforced in the database because a review pointing
        # at the wrong thing would silently corrupt the ranking that reads it.
        CheckConstraint(
            "(CASE WHEN trip_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN vendor_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN service_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN operator_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
            name="exactly_one_subject",
        ),
        CheckConstraint(
            "(subject = 'trip' AND trip_id IS NOT NULL) OR "
            "(subject = 'vendor' AND vendor_id IS NOT NULL) OR "
            "(subject = 'service' AND service_id IS NOT NULL) OR "
            "(subject = 'operator' AND operator_id IS NOT NULL)",
            name="subject_matches_target",
        ),
        # One review per person per thing. A second opinion is an edit.
        UniqueConstraint(
            "author_id", "subject", "service_id", name="uq_reviews_author_service"
        ),
        UniqueConstraint(
            "author_id", "subject", "vendor_id", name="uq_reviews_author_vendor"
        ),
        UniqueConstraint(
            "author_id", "subject", "operator_id", name="uq_reviews_author_operator"
        ),
        UniqueConstraint(
            "author_id", "subject", "trip_id", name="uq_reviews_author_trip"
        ),
        Index("ix_reviews_subject", "subject"),
        Index("ix_reviews_vendor_id", "vendor_id"),
        Index("ix_reviews_service_id", "service_id"),
        Index("ix_reviews_operator_id", "operator_id"),
        Index("ix_reviews_trip_id", "trip_id"),
        Index("ix_reviews_created_at", "created_at"),
    )
