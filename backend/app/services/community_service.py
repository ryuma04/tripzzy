"""Public trips, the community feed and cloning (spec sections 16, 35)."""

import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.models import (
    Accommodation,
    ItineraryActivity,
    Transport,
    Trip,
    TripStop,
    User,
)
from app.models.enums import TripStatus
from app.repositories.trip_repository import TripRepository
from app.schemas.trip import CloneRequest
from app.services.trip_service import compute_status


class CommunityService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = TripRepository(db)

    # -- public read (no authentication, spec section 16) -----------------

    async def public_trip(self, slug: str) -> dict:
        """Render a shared trip for anyone holding the link.

        Exposes only what a reader needs: the itinerary and the owner's
        display name. Never the owner's email, phone, or recorded expenses --
        those are private even on a trip the owner chose to publish.
        """
        trip = await self.repo.get_by_slug(slug)
        if trip is None:
            raise NotFoundError("Shared trip")

        stops = (
            (
                await self.db.execute(
                    select(TripStop)
                    .where(TripStop.trip_id == trip.id)
                    .options(
                        selectinload(TripStop.activities),
                        selectinload(TripStop.accommodations),
                    )
                    .order_by(TripStop.order_index)
                )
            )
            .scalars()
            .all()
        )
        transports = (
            (
                await self.db.execute(
                    select(Transport)
                    .where(Transport.trip_id == trip.id)
                    .options(
                        selectinload(Transport.origin_stop),
                        selectinload(Transport.destination_stop),
                    )
                    .order_by(Transport.departure_time)
                )
            )
            .scalars()
            .all()
        )
        owner = await self.db.get(User, trip.user_id)

        estimated = Decimal("0")
        stop_payloads = []
        for stop in stops:
            activities = sorted(
                stop.activities, key=lambda a: (a.activity_date, a.order_index)
            )
            stop_cost = sum(
                (Decimal(str(a.estimated_cost)) for a in activities), Decimal("0")
            )
            stay_cost = sum(
                (Decimal(str(a.estimated_cost)) for a in stop.accommodations),
                Decimal("0"),
            )
            estimated += stop_cost + stay_cost

            stop_payloads.append(
                {
                    "id": str(stop.id),
                    "city_name": stop.city_name,
                    "country": stop.country,
                    "arrival_date": stop.arrival_date,
                    "departure_date": stop.departure_date,
                    "order_index": stop.order_index,
                    "nights": (stop.departure_date - stop.arrival_date).days,
                    "estimated_cost": stop_cost,
                    "activities": [
                        {
                            "id": str(a.id),
                            "title": a.title,
                            "description": a.description,
                            "activity_date": a.activity_date,
                            "start_time": a.start_time,
                            "end_time": a.end_time,
                            "estimated_cost": a.estimated_cost,
                            "category": a.category.value,
                            "order_index": a.order_index,
                        }
                        for a in activities
                    ],
                    "accommodations": [
                        {
                            "id": str(acc.id),
                            "name": acc.name,
                            "check_in": acc.check_in,
                            "check_out": acc.check_out,
                            "estimated_cost": acc.estimated_cost,
                        }
                        for acc in stop.accommodations
                    ],
                }
            )

        estimated += sum(
            (Decimal(str(t.cost)) for t in transports), Decimal("0")
        )

        return {
            "id": str(trip.id),
            "share_slug": trip.share_slug,
            "title": trip.title,
            "description": trip.description,
            "start_date": trip.start_date,
            "end_date": trip.end_date,
            "duration_days": trip.duration_days,
            "budget": trip.budget,
            "estimated_cost": estimated,
            "traveller_count": trip.traveller_count,
            "currency": trip.currency,
            "cover_image_url": trip.cover_image_url,
            "status": compute_status(trip, len(stops)).value,
            "owner": {
                "id": str(owner.id),
                "first_name": owner.first_name,
                "last_name": owner.last_name,
                "city": owner.city,
                "country": owner.country,
                "avatar_url": owner.avatar_url,
            }
            if owner
            else None,
            "cities": [s.city_name for s in stops],
            "stops": stop_payloads,
            "transport": [
                {
                    "id": str(t.id),
                    "transport_type": t.transport_type.value,
                    "origin_city": t.origin_stop.city_name if t.origin_stop else None,
                    "destination_city": (
                        t.destination_stop.city_name if t.destination_stop else None
                    ),
                    "departure_time": t.departure_time,
                    "arrival_time": t.arrival_time,
                    "cost": t.cost,
                }
                for t in transports
            ],
        }

    async def list_community(
        self, *, offset: int, limit: int, q: str | None = None, **kwargs
    ) -> tuple[list[dict], int]:
        trips, total = await self.repo.list_public(
            offset=offset, limit=limit, q=q, **kwargs
        )
        stats = await self.repo.stats_for([t.id for t in trips])

        items = []
        for trip in trips:
            s = stats.get(
                trip.id,
                {"stop_count": 0, "activity_count": 0, "estimated_cost": Decimal("0")},
            )
            cities = await self.repo.cities_for(trip.id)
            items.append(
                {
                    "id": str(trip.id),
                    "share_slug": trip.share_slug,
                    "title": trip.title,
                    "description": trip.description,
                    "start_date": trip.start_date,
                    "end_date": trip.end_date,
                    "duration_days": trip.duration_days,
                    "budget": trip.budget,
                    "estimated_cost": s["estimated_cost"],
                    "traveller_count": trip.traveller_count,
                    "currency": trip.currency,
                    "cover_image_url": trip.cover_image_url,
                    "stop_count": s["stop_count"],
                    "activity_count": s["activity_count"],
                    "cities": cities,
                    "owner": {
                        "id": str(trip.user.id),
                        "first_name": trip.user.first_name,
                        "last_name": trip.user.last_name,
                        "city": trip.user.city,
                        "country": trip.user.country,
                        "avatar_url": trip.user.avatar_url,
                    }
                    if trip.user
                    else None,
                }
            )
        return items, total

    # -- cloning (spec sections 16, 35) -----------------------------------

    async def clone(
        self, slug: str, payload: CloneRequest, user: User
    ) -> Trip:
        """Deep-copy a shared trip into the caller's account.

        Everything happens in one transaction (spec section 32) so a failure
        cannot leave a half-copied trip behind. The result is an *independent*
        copy: it is private, has no share slug, and editing it never touches
        the original.

        Expenses are deliberately not copied -- they are the original
        traveller's actual spending, not part of the plan being shared.
        """
        source = await self.repo.get_by_slug(slug)
        if source is None:
            raise NotFoundError("Shared trip")

        if source.user_id == user.id:
            raise ValidationError("This trip is already yours")

        # Rebasing keeps the itinerary's internal spacing while moving it to
        # whichever dates the cloner actually intends to travel.
        new_start = payload.start_date or source.start_date
        offset = new_start - source.start_date
        new_end = source.end_date + offset

        span = (new_end - new_start).days + 1
        if span > settings.MAX_TRIP_DAYS:
            raise ValidationError(
                f"A trip cannot be longer than {settings.MAX_TRIP_DAYS} days"
            )

        clone = Trip(
            user_id=user.id,
            title=payload.title or f"{source.title} (copy)",
            description=source.description,
            start_date=new_start,
            end_date=new_end,
            budget=source.budget,
            traveller_count=source.traveller_count,
            currency=source.currency,
            cover_image_url=source.cover_image_url,
            status=TripStatus.DRAFT,
            # An independent copy starts private, with its own future slug.
            is_public=False,
            share_slug=None,
            cloned_from_trip_id=source.id,
        )
        self.db.add(clone)
        await self.db.flush()

        stops = (
            (
                await self.db.execute(
                    select(TripStop)
                    .where(TripStop.trip_id == source.id)
                    .options(
                        selectinload(TripStop.activities),
                        selectinload(TripStop.accommodations),
                    )
                    .order_by(TripStop.order_index)
                )
            )
            .scalars()
            .all()
        )

        stop_id_map: dict[uuid.UUID, uuid.UUID] = {}
        for stop in stops:
            new_stop = TripStop(
                trip_id=clone.id,
                destination_id=stop.destination_id,
                city_name=stop.city_name,
                country=stop.country,
                arrival_date=stop.arrival_date + offset,
                departure_date=stop.departure_date + offset,
                order_index=stop.order_index,
                notes=stop.notes,
            )
            self.db.add(new_stop)
            await self.db.flush()
            stop_id_map[stop.id] = new_stop.id

            for activity in stop.activities:
                self.db.add(
                    ItineraryActivity(
                        stop_id=new_stop.id,
                        activity_id=activity.activity_id,
                        title=activity.title,
                        description=activity.description,
                        activity_date=activity.activity_date + offset,
                        start_time=activity.start_time,
                        end_time=activity.end_time,
                        estimated_cost=activity.estimated_cost,
                        category=activity.category,
                        order_index=activity.order_index,
                        notes=activity.notes,
                    )
                )

            for stay in stop.accommodations:
                self.db.add(
                    Accommodation(
                        stop_id=new_stop.id,
                        name=stay.name,
                        address=stay.address,
                        check_in=stay.check_in + offset,
                        check_out=stay.check_out + offset,
                        estimated_cost=stay.estimated_cost,
                        booking_url=stay.booking_url,
                        notes=stay.notes,
                    )
                )

        transports = (
            (
                await self.db.execute(
                    select(Transport).where(Transport.trip_id == source.id)
                )
            )
            .scalars()
            .all()
        )
        for leg in transports:
            self.db.add(
                Transport(
                    trip_id=clone.id,
                    # Remap onto the *cloned* stops; pointing at the original's
                    # stops would tie the two trips together.
                    origin_stop_id=stop_id_map.get(leg.origin_stop_id),
                    destination_stop_id=stop_id_map.get(leg.destination_stop_id),
                    transport_type=leg.transport_type,
                    provider=leg.provider,
                    departure_time=leg.departure_time + offset,
                    arrival_time=leg.arrival_time + offset,
                    cost=leg.cost,
                    notes=leg.notes,
                )
            )

        await self.db.commit()
        await self.db.refresh(clone)
        return clone
