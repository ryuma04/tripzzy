"""Bill splitting: dividing a trip's real spend among the people who travelled.

A split is a snapshot, not a live view. It records what the total *was* at the
moment it was raised, so later edits to the trip's expenses cannot silently
change what somebody already agreed they owe.

Members are stored denormalised (``display_name``, ``email``, ``avatar_url``)
alongside an optional ``user_id``. That is deliberate: a split can include
somebody who has no Tripzyy account, and a member who later deletes their
account should leave the arithmetic intact rather than blanking a row -- hence
``ON DELETE SET NULL`` on the user reference while the name survives.
"""

import uuid
from decimal import Decimal

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
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDMixin
from app.models.enums import BillSplitStatus, SplitMemberStatus


class BillSplit(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "bill_splits"

    trip_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, default="INR", server_default="INR"
    )
    member_count: Mapped[int] = mapped_column(Integer, nullable=False)
    split_method: Mapped[str] = mapped_column(
        String(20), nullable=False, default="equal", server_default="equal"
    )
    # A solo trip still records a split so the trip has one consistent
    # settlement history; ``is_group`` is what distinguishes the two.
    is_group: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    status: Mapped[BillSplitStatus] = mapped_column(
        SAEnum(
            BillSplitStatus,
            name="bill_split_status",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        default=BillSplitStatus.PENDING,
        server_default=BillSplitStatus.PENDING.value,
    )
    note: Mapped[str | None] = mapped_column(Text)

    trip: Mapped["Trip"] = relationship()  # noqa: F821
    created_by: Mapped["User"] = relationship()  # noqa: F821
    members: Mapped[list["BillSplitMember"]] = relationship(
        back_populates="split",
        cascade="all, delete-orphan",
        order_by="BillSplitMember.order_index",
    )

    __table_args__ = (
        CheckConstraint("total_amount >= 0", name="total_non_negative"),
        CheckConstraint("member_count >= 1", name="member_count_positive"),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_iso4217"),
        Index("ix_bill_splits_trip_id", "trip_id"),
        Index("ix_bill_splits_created_by_id", "created_by_id"),
        Index("ix_bill_splits_status", "status"),
    )


class BillSplitMember(UUIDMixin, TimestampMixin, Base):
    """One person's share of a split.

    ``share_amount`` is stored rather than derived. Equal division rarely
    lands on a whole number of paise, so the remainder is distributed
    explicitly at creation time and persisted -- recomputing it on read would
    let the displayed shares drift from the ones members were notified about.
    """

    __tablename__ = "bill_split_members"

    split_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("bill_splits.id", ondelete="CASCADE"),
        nullable=False,
    )
    # NULL once the account is gone, or when the member never had one.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(String(500))

    share_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[SplitMemberStatus] = mapped_column(
        SAEnum(
            SplitMemberStatus,
            name="split_member_status",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        default=SplitMemberStatus.PENDING,
        server_default=SplitMemberStatus.PENDING.value,
    )
    # The person who actually settled the bill and is owed by everyone else.
    is_payer: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    order_index: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    split: Mapped["BillSplit"] = relationship(back_populates="members")
    user: Mapped["User | None"] = relationship()  # noqa: F821

    __table_args__ = (
        CheckConstraint("share_amount >= 0", name="share_non_negative"),
        CheckConstraint(
            "length(btrim(display_name)) >= 1", name="display_name_not_blank"
        ),
        # A registered user appears at most once per split. Unregistered
        # members carry NULL, which PostgreSQL treats as distinct, so any
        # number of them can coexist.
        UniqueConstraint("split_id", "user_id", name="uq_bill_split_members_split_id_user_id"),
        Index("ix_bill_split_members_split_id", "split_id"),
        Index("ix_bill_split_members_user_id", "user_id"),
    )
