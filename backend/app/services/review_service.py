"""Reviews, and the loop they close.

A review here is not a testimonial. The rating a traveller leaves on a hotel is
written back onto the ``VendorService`` and ``Vendor`` rows, which are exactly
what ``InventoryService`` ranks when it chooses components for the *next*
traveller and when the adaptation engine looks for a replacement. Complete
feeds Discover, and this module is the wire between them.

That makes provenance load-bearing. If anybody could rate anything, the ranker
would be reading noise, so a review is refused unless the author holds a
booking that actually contains the thing being reviewed. The booking is
recorded on the row, and the rating is marked ``is_verified`` only when that
booking reached a state where the traveller genuinely experienced it.
"""

import logging
import uuid
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.models import (
    Booking,
    BookingItem,
    Operator,
    Review,
    Trip,
    User,
    Vendor,
    VendorService,
)
from app.models.enums import BookingStatus, ReviewSubject

logger = logging.getLogger(__name__)

# A booking only counts as evidence once it represents a tour the traveller
# actually took. A draft or an unpaid hold proves nothing.
EXPERIENCED = (
    BookingStatus.CONFIRMED,
    BookingStatus.IN_PROGRESS,
    BookingStatus.COMPLETED,
)

# Ratings are Numeric(2,1) on both target tables.
RATING = Decimal("0.1")


class ReviewService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # -- provenance --------------------------------------------------------

    async def _evidence(
        self, user: User, subject: ReviewSubject, target_id: uuid.UUID
    ) -> Booking | None:
        """Find a booking of this user's that covers the thing being reviewed.

        Returns the booking when one exists, ``None`` otherwise. The caller
        decides what to do with that: a trip review by its owner needs no
        booking, everything else does.
        """
        stmt = (
            select(Booking)
            .join(BookingItem, BookingItem.booking_id == Booking.id)
            .where(
                Booking.traveller_id == user.id,
                Booking.status.in_(EXPERIENCED),
            )
            .limit(1)
        )

        if subject is ReviewSubject.SERVICE:
            stmt = stmt.where(BookingItem.service_id == target_id)
        elif subject is ReviewSubject.VENDOR:
            stmt = stmt.join(
                VendorService, BookingItem.service_id == VendorService.id
            ).where(VendorService.vendor_id == target_id)
        elif subject is ReviewSubject.OPERATOR:
            stmt = stmt.where(Booking.operator_id == target_id)
        else:
            return None

        return (await self.db.execute(stmt)).scalars().first()

    async def _target_exists(
        self, subject: ReviewSubject, target_id: uuid.UUID
    ) -> bool:
        model = {
            ReviewSubject.TRIP: Trip,
            ReviewSubject.VENDOR: Vendor,
            ReviewSubject.SERVICE: VendorService,
            ReviewSubject.OPERATOR: Operator,
        }[subject]
        return (await self.db.get(model, target_id)) is not None

    # -- aggregates --------------------------------------------------------

    async def _recompute(self, subject: ReviewSubject, target_id: uuid.UUID) -> None:
        """Write the new average back onto the row the ranker reads.

        Denormalised deliberately. ``InventoryService`` scores dozens of
        candidates per request and cannot afford an aggregate per candidate;
        the column is the cache, and this is the only place that writes it.

        A vendor's rating is rolled up from its *services* rather than only
        from reviews naming the vendor directly, because a traveller reviews
        the room they slept in far more often than the company that owns it.
        """
        column_map = {
            ReviewSubject.SERVICE: (VendorService, Review.service_id),
            ReviewSubject.VENDOR: (Vendor, Review.vendor_id),
            ReviewSubject.OPERATOR: (Operator, Review.operator_id),
        }
        if subject not in column_map:
            return  # Trips carry no aggregate rating column.

        model, column = column_map[subject]
        average = await self.db.scalar(
            select(func.avg(Review.rating)).where(
                column == target_id, Review.is_public.is_(True)
            )
        )
        row = await self.db.get(model, target_id)
        if row is None:
            return
        # ``None`` when the last review is removed, rather than leaving the
        # previous average standing. A rating no review supports is worse than
        # no rating: the ranker treats a null as neutral and says "not yet
        # rated", where a stale 5.0 would keep recommending on evidence that
        # has been withdrawn.
        row.rating = (
            Decimal(str(average)).quantize(RATING, rounding=ROUND_HALF_UP)
            if average is not None
            else None
        )

        # A service review also moves its vendor, since that is where most
        # ratings actually land.
        if subject is ReviewSubject.SERVICE and row.vendor_id:
            vendor_average = await self.db.scalar(
                select(func.avg(Review.rating))
                .select_from(Review)
                .join(VendorService, Review.service_id == VendorService.id)
                .where(
                    VendorService.vendor_id == row.vendor_id,
                    Review.is_public.is_(True),
                )
            )
            vendor = await self.db.get(Vendor, row.vendor_id)
            if vendor is not None:
                vendor.rating = (
                    Decimal(str(vendor_average)).quantize(
                        RATING, rounding=ROUND_HALF_UP
                    )
                    if vendor_average is not None
                    else None
                )

    # -- writes ------------------------------------------------------------

    async def create(
        self,
        user: User,
        *,
        subject: ReviewSubject,
        target_id: uuid.UUID,
        rating: int,
        title: str | None = None,
        body: str | None = None,
    ) -> Review:
        """Record a review, or refuse it.

        Refusal is the interesting half: an unverifiable rating is worse than
        no rating, because the ranker cannot tell the difference and will
        recommend on it.
        """
        if not await self._target_exists(subject, target_id):
            raise NotFoundError(subject.value.capitalize())

        existing = await self.db.scalar(
            select(Review).where(
                Review.author_id == user.id,
                Review.subject == subject,
                _column_for(subject) == target_id,
            )
        )
        if existing is not None:
            raise ConflictError(
                "You have already reviewed this. Edit that review instead.",
                details={"review_id": str(existing.id)},
            )

        booking: Booking | None = None
        verified = False

        if subject is ReviewSubject.TRIP:
            trip = await self.db.get(Trip, target_id)
            if trip is None or trip.deleted_at is not None:
                raise NotFoundError("Trip")
            if trip.user_id != user.id:
                raise ForbiddenError("You can only review your own trip")
            verified = True
        else:
            booking = await self._evidence(user, subject, target_id)
            if booking is None:
                raise ForbiddenError(
                    "You can only review something you booked and travelled on."
                )
            verified = True

        review = Review(
            author_id=user.id,
            subject=subject,
            rating=rating,
            title=title,
            body=body,
            booking_id=booking.id if booking else None,
            is_verified=verified,
            **{_field_for(subject): target_id},
        )
        self.db.add(review)
        await self.db.flush()
        await self._recompute(subject, target_id)
        await self.db.commit()
        await self.db.refresh(review)
        return review

    async def update(
        self,
        review_id: uuid.UUID,
        user: User,
        *,
        rating: int | None = None,
        title: str | None = None,
        body: str | None = None,
    ) -> Review:
        review = await self.get_owned(review_id, user)
        if rating is not None:
            review.rating = rating
        if title is not None:
            review.title = title
        if body is not None:
            review.body = body
        await self.db.flush()
        await self._recompute(review.subject, _target_of(review))
        await self.db.commit()
        await self.db.refresh(review)
        return review

    async def delete(self, review_id: uuid.UUID, user: User) -> None:
        review = await self.get_owned(review_id, user)
        subject, target = review.subject, _target_of(review)
        await self.db.delete(review)
        await self.db.flush()
        # Recomputed after the delete so the average reflects what is left.
        await self._recompute(subject, target)
        await self.db.commit()

    async def get_owned(self, review_id: uuid.UUID, user: User) -> Review:
        review = await self.db.get(Review, review_id)
        if review is None:
            raise NotFoundError("Review")
        if review.author_id != user.id and not user.is_admin:
            raise ForbiddenError("This review belongs to someone else")
        return review

    # -- reads -------------------------------------------------------------

    async def list_for(
        self,
        subject: ReviewSubject,
        target_id: uuid.UUID,
        *,
        offset: int,
        limit: int,
    ) -> tuple[list[Review], int, dict[str, Any]]:
        """Public reviews of one thing, with its rating summary.

        The distribution comes back too: an average of 4.2 built from fives and
        ones means something different from one built entirely from fours, and
        a single number cannot say which.
        """
        column = _column_for(subject)
        where = [column == target_id, Review.is_public.is_(True)]

        total = (
            await self.db.execute(
                select(func.count()).select_from(Review).where(*where)
            )
        ).scalar_one()

        rows = (
            (
                await self.db.execute(
                    select(Review)
                    .where(*where)
                    .options(selectinload(Review.author))
                    .order_by(Review.created_at.desc())
                    .offset(offset)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )

        buckets = dict(
            (
                await self.db.execute(
                    select(Review.rating, func.count())
                    .where(*where)
                    .group_by(Review.rating)
                )
            ).all()
        )
        average = await self.db.scalar(select(func.avg(Review.rating)).where(*where))

        summary = {
            "average": (
                Decimal(str(average)).quantize(RATING, rounding=ROUND_HALF_UP)
                if average is not None
                else None
            ),
            "count": total,
            "distribution": {str(star): buckets.get(star, 0) for star in range(1, 6)},
        }
        return list(rows), total, summary

    async def list_by_author(
        self, user: User, *, offset: int, limit: int
    ) -> tuple[list[Review], int]:
        total = (
            await self.db.execute(
                select(func.count())
                .select_from(Review)
                .where(Review.author_id == user.id)
            )
        ).scalar_one()
        rows = (
            (
                await self.db.execute(
                    select(Review)
                    .where(Review.author_id == user.id)
                    .options(selectinload(Review.author))
                    .order_by(Review.created_at.desc())
                    .offset(offset)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        return list(rows), total

    async def reviewable(self, user: User) -> list[dict[str, Any]]:
        """What this traveller could review but has not.

        Drives the "how was it?" prompt after a tour. Built from what they
        actually booked, so the prompt can never ask about somewhere they
        never went.
        """
        items = (
            (
                await self.db.execute(
                    select(BookingItem)
                    .join(Booking, BookingItem.booking_id == Booking.id)
                    .where(
                        Booking.traveller_id == user.id,
                        Booking.status.in_(EXPERIENCED),
                        BookingItem.service_id.is_not(None),
                    )
                    .options(selectinload(BookingItem.booking))
                    .order_by(BookingItem.service_date.desc())
                )
            )
            .scalars()
            .all()
        )

        reviewed = set(
            (
                await self.db.execute(
                    select(Review.service_id).where(
                        Review.author_id == user.id,
                        Review.subject == ReviewSubject.SERVICE,
                    )
                )
            )
            .scalars()
            .all()
        )

        out: list[dict[str, Any]] = []
        seen: set[uuid.UUID] = set()
        for item in items:
            if item.service_id in reviewed or item.service_id in seen:
                continue
            seen.add(item.service_id)
            out.append(
                {
                    "subject": ReviewSubject.SERVICE,
                    "target_id": item.service_id,
                    "title": item.title,
                    "vendor_name": item.vendor_name,
                    "city": item.city,
                    "service_date": item.service_date,
                    "booking_reference": (
                        item.booking.reference if item.booking else None
                    ),
                }
            )
        return out

    @staticmethod
    def serialise(review: Review) -> dict[str, Any]:
        return {
            "id": review.id,
            "author_id": review.author_id,
            "author_name": (
                review.author.full_name if review.author else None
            ),
            "author_avatar_url": (
                review.author.avatar_url if review.author else None
            ),
            "subject": review.subject,
            "target_id": _target_of(review),
            "trip_id": review.trip_id,
            "vendor_id": review.vendor_id,
            "service_id": review.service_id,
            "operator_id": review.operator_id,
            "booking_id": review.booking_id,
            "rating": review.rating,
            "title": review.title,
            "body": review.body,
            "is_verified": review.is_verified,
            "is_public": review.is_public,
            "created_at": review.created_at,
            "updated_at": review.updated_at,
        }


# Mapping the subject enum onto its column, in one place rather than a
# four-branch conditional at every call site.
_FIELDS = {
    ReviewSubject.TRIP: "trip_id",
    ReviewSubject.VENDOR: "vendor_id",
    ReviewSubject.SERVICE: "service_id",
    ReviewSubject.OPERATOR: "operator_id",
}


def _field_for(subject: ReviewSubject) -> str:
    return _FIELDS[subject]


def _column_for(subject: ReviewSubject):
    return getattr(Review, _FIELDS[subject])


def _target_of(review: Review) -> uuid.UUID:
    return getattr(review, _FIELDS[review.subject])
