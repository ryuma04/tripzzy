"""A scheduled activity inside a trip stop (spec sections 8, 9, 13)."""

import uuid
from datetime import date, time

from sqlalchemy import (
    CheckConstraint,
    Date,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDMixin
from app.models.enums import ActivityCategory


class ItineraryActivity(UUIDMixin, TimestampMixin, Base):
    """One entry on a day of the itinerary.

    Denormalises ``title``/``estimated_cost`` from the catalog on purpose: the
    user may rename an activity or record a different price, and a catalog row
    that is later edited or removed must not silently rewrite somebody's saved
    trip.
    """

    __tablename__ = "itinerary_activities"

    stop_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("trip_stops.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Optional link back to the catalog entry this was created from.
    activity_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("activities.id", ondelete="SET NULL")
    )

    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    activity_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time | None] = mapped_column(Time)
    end_time: Mapped[time | None] = mapped_column(Time)
    estimated_cost: Mapped[float] = mapped_column(
        Numeric(12, 2), nullable=False, default=0, server_default="0"
    )
    category: Mapped[ActivityCategory] = mapped_column(
        SAEnum(
            ActivityCategory,
            name="activity_category",
            values_callable=lambda e: [m.value for m in e],
            create_type=False,
        ),
        nullable=False,
        default=ActivityCategory.OTHER,
        server_default=ActivityCategory.OTHER.value,
    )
    order_index: Mapped[int] = mapped_column(nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    stop: Mapped["TripStop"] = relationship(back_populates="activities")  # noqa: F821
    catalog_activity: Mapped["ActivityCatalog | None"] = relationship()  # noqa: F821

    __table_args__ = (
        CheckConstraint("length(btrim(title)) >= 2", name="title_min_length"),
        CheckConstraint("estimated_cost >= 0", name="estimated_cost_non_negative"),
        CheckConstraint("order_index >= 0", name="order_index_non_negative"),
        # An end time without a start time is meaningless.
        CheckConstraint(
            "end_time IS NULL OR start_time IS NOT NULL",
            name="end_time_requires_start_time",
        ),
        # Spec: activity with invalid time range must be rejected.
        CheckConstraint(
            "start_time IS NULL OR end_time IS NULL OR start_time < end_time",
            name="time_order",
        ),
        UniqueConstraint(
            "stop_id",
            "order_index",
            name="uq_itinerary_activities_stop_id_order_index",
            deferrable=True,
            initially="DEFERRED",
        ),
        Index("ix_itinerary_activities_stop_id", "stop_id"),
        Index("ix_itinerary_activities_activity_date", "activity_date"),
    )
