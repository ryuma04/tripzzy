"""Trip business rules (spec sections 7, 10, 24, 31)."""

import re
import secrets
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.models import ItineraryActivity, Trip, TripStop, User
from app.models.enums import TripStatus
from app.repositories.trip_repository import TripRepository
from app.schemas.trip import TripCreateRequest, TripUpdateRequest


def compute_status(trip: Trip, stop_count: int, today: date | None = None) -> TripStatus:
    """Derive a trip's status (spec section 10, refinement R3).

    Section 10 says status must be calculated rather than trusted from the
    frontend, but it also lists ``draft`` -- which no date arithmetic can
    produce. The resolution: a trip with no stops yet is a draft; once it has
    at least one stop it enters the date-driven ladder.
    """
    if stop_count == 0:
        return TripStatus.DRAFT

    today = today or date.today()
    if today < trip.start_date:
        return TripStatus.UPCOMING
    if today > trip.end_date:
        return TripStatus.COMPLETED
    return TripStatus.ONGOING


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug[:40] or "trip"


class TripService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = TripRepository(db)

    # -- authorization -----------------------------------------------------

    async def get_owned(self, trip_id: uuid.UUID, user: User) -> Trip:
        """Fetch a trip the caller owns, or raise (spec section 24).

        The 404-vs-403 split is deliberate: a trip that does not exist and one
        that belongs to someone else must be distinguishable to the owner
        (who needs a useful error) but both are refusals to everyone else.
        Admins bypass the ownership check for moderation.
        """
        trip = await self.repo.get(trip_id)
        if trip is None:
            raise NotFoundError("Trip")
        if trip.user_id != user.id and not user.is_admin:
            raise ForbiddenError("You do not have access to this trip")
        return trip

    # -- reads -------------------------------------------------------------

    async def _decorate(self, trips: list[Trip]) -> list[dict]:
        """Attach computed status and counts to each trip."""
        stats = await self.repo.stats_for([t.id for t in trips])
        today = date.today()

        out = []
        for trip in trips:
            s = stats.get(
                trip.id,
                {"stop_count": 0, "activity_count": 0, "estimated_cost": Decimal("0")},
            )
            status = compute_status(trip, s["stop_count"], today)
            # Keep the stored column in step so status filtering stays honest.
            if trip.status != status:
                trip.status = status
            out.append(
                {
                    "id": trip.id,
                    "title": trip.title,
                    "description": trip.description,
                    "start_date": trip.start_date,
                    "end_date": trip.end_date,
                    "duration_days": trip.duration_days,
                    "budget": trip.budget,
                    "traveller_count": trip.traveller_count,
                    "currency": trip.currency,
                    "status": status,
                    "is_public": trip.is_public,
                    "share_slug": trip.share_slug,
                    "cover_image_url": trip.cover_image_url,
                    "stop_count": s["stop_count"],
                    "activity_count": s["activity_count"],
                    "estimated_cost": s["estimated_cost"],
                    "created_at": trip.created_at,
                    "updated_at": trip.updated_at,
                }
            )
        return out

    async def list_for_user(self, user: User, **kwargs) -> tuple[list[dict], int]:
        trips, total = await self.repo.list_for_user(user.id, **kwargs)
        decorated = await self._decorate(trips)
        await self.db.commit()
        return decorated, total

    async def detail(self, trip_id: uuid.UUID, user: User) -> dict:
        trip = await self.get_owned(trip_id, user)
        payload = (await self._decorate([trip]))[0]
        payload["cities"] = await self.repo.cities_for(trip.id)
        payload["cloned_from_trip_id"] = trip.cloned_from_trip_id

        from app.services.itinerary_service import ItineraryService
        stops = await ItineraryService(self.db).list_stops(trip.id, user)
        payload["stops"] = stops

        from app.services.logistics_service import LogisticsService
        transports = await LogisticsService(self.db).list_transport(trip.id, user)
        payload["transports"] = transports

        await self.db.commit()
        return payload

    # -- writes ------------------------------------------------------------

    async def create(self, payload: TripCreateRequest, user: User) -> dict:
        trip = Trip(
            user_id=user.id,
            title=payload.title,
            description=payload.description,
            start_date=payload.start_date,
            end_date=payload.end_date,
            budget=payload.budget,
            traveller_count=payload.traveller_count,
            currency=payload.currency,
            cover_image_url=payload.cover_image_url,
            # A brand-new trip has no stops yet, so it starts as a draft.
            status=TripStatus.DRAFT,
        )
        self.db.add(trip)
        await self.db.commit()
        await self.db.refresh(trip)

        payload_out = (await self._decorate([trip]))[0]
        payload_out["cities"] = []
        payload_out["cloned_from_trip_id"] = None
        await self.db.commit()
        return payload_out

    async def update(
        self,
        trip_id: uuid.UUID,
        payload: TripUpdateRequest,
        user: User,
        *,
        cascade: bool = False,
    ) -> dict:
        trip = await self.get_owned(trip_id, user)
        changes = payload.model_dump(exclude_unset=True)

        new_start = changes.get("start_date", trip.start_date)
        new_end = changes.get("end_date", trip.end_date)

        # Re-check against the values that were *not* sent: a request changing
        # only start_date can still invert the range.
        if new_start > new_end:
            raise ValidationError(
                "End date cannot be earlier than start date",
                details={
                    "fields": {"end_date": "Must be on or after the start date"}
                },
            )

        span = (new_end - new_start).days + 1
        if span > settings.MAX_TRIP_DAYS:
            raise ValidationError(
                f"A trip cannot be longer than {settings.MAX_TRIP_DAYS} days"
            )

        dates_changed = new_start != trip.start_date or new_end != trip.end_date
        if dates_changed:
            await self._handle_date_change(trip, new_start, new_end, cascade=cascade)

        for field, value in changes.items():
            setattr(trip, field, value)

        await self.db.commit()
        await self.db.refresh(trip)

        out = (await self._decorate([trip]))[0]
        out["cities"] = await self.repo.cities_for(trip.id)
        out["cloned_from_trip_id"] = trip.cloned_from_trip_id
        await self.db.commit()
        return out

    async def _handle_date_change(
        self, trip: Trip, new_start: date, new_end: date, *, cascade: bool
    ) -> None:
        """Refinement R9: shrinking a trip can strand its stops.

        Rejecting by default keeps the invariant ``trip.start <= stop.arrival``
        and ``stop.departure <= trip.end`` (spec section 31) true at all times.
        ``cascade=true`` is an explicit opt-in to clamp instead.
        """
        stops = (
            (
                await self.db.execute(
                    select(TripStop)
                    .where(TripStop.trip_id == trip.id)
                    .order_by(TripStop.order_index)
                )
            )
            .scalars()
            .all()
        )

        conflicts = [
            s for s in stops
            if s.arrival_date < new_start or s.departure_date > new_end
        ]
        if not conflicts:
            return

        if not cascade:
            raise ConflictError(
                "The new dates would leave some stops outside the trip. "
                "Adjust those stops, or retry with ?cascade=true to clamp them.",
                details={
                    "conflicting_stops": [
                        {
                            "id": str(s.id),
                            "city_name": s.city_name,
                            "arrival_date": s.arrival_date.isoformat(),
                            "departure_date": s.departure_date.isoformat(),
                        }
                        for s in conflicts
                    ]
                },
            )

        for stop in conflicts:
            stop.arrival_date = min(max(stop.arrival_date, new_start), new_end)
            stop.departure_date = max(
                min(stop.departure_date, new_end), stop.arrival_date
            )

            # Any activity now outside its stop's window moves to the new
            # arrival day rather than being silently orphaned.
            activities = (
                (
                    await self.db.execute(
                        select(ItineraryActivity).where(
                            ItineraryActivity.stop_id == stop.id
                        )
                    )
                )
                .scalars()
                .all()
            )
            for activity in activities:
                if not (
                    stop.arrival_date <= activity.activity_date <= stop.departure_date
                ):
                    activity.activity_date = stop.arrival_date

    async def delete(self, trip_id: uuid.UUID, user: User) -> None:
        """Soft delete (refinement R8)."""
        trip = await self.get_owned(trip_id, user)
        trip.deleted_at = datetime.now(timezone.utc)
        # A deleted trip must not stay reachable through its public link.
        trip.is_public = False
        trip.share_slug = None
        await self.db.commit()

    # -- sharing (spec section 16) ----------------------------------------

    async def enable_share(self, trip_id: uuid.UUID, user: User) -> Trip:
        trip = await self.get_owned(trip_id, user)

        if trip.share_slug and trip.is_public:
            return trip

        stop_count = await self.db.scalar(
            select(func.count())
            .select_from(TripStop)
            .where(TripStop.trip_id == trip.id)
        )
        if not stop_count:
            raise ValidationError(
                "Add at least one destination before sharing this trip"
            )

        if not trip.share_slug:
            base = slugify(trip.title)
            for _ in range(10):
                candidate = f"{base}-{secrets.token_hex(3)}"
                if not await self.repo.slug_exists(candidate):
                    trip.share_slug = candidate
                    break
            else:  # pragma: no cover - astronomically unlikely
                trip.share_slug = f"{base}-{secrets.token_hex(8)}"

        trip.is_public = True
        await self.db.commit()
        await self.db.refresh(trip)
        return trip

    async def disable_share(self, trip_id: uuid.UUID, user: User) -> None:
        trip = await self.get_owned(trip_id, user)
        # Clearing the slug means an old link cannot be revived by re-sharing.
        trip.is_public = False
        trip.share_slug = None
        await self.db.commit()
