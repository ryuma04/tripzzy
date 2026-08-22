"""Stops and itinerary activities (spec sections 8, 9, 13, 31).

The ownership chain is the important part: an activity belongs to a stop,
which belongs to a trip, which belongs to a user. Every mutation walks that
chain server-side (spec section 24) rather than trusting an id from the
client.
"""

import uuid
from datetime import date, time as dt_time, timedelta
from decimal import Decimal

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.models import (
    ActivityCatalog,
    Destination,
    ItineraryActivity,
    Trip,
    TripStop,
    User,
)
from app.schemas.stop import (
    ItineraryActivityCreateRequest,
    ItineraryActivityUpdateRequest,
    StopCreateRequest,
    StopUpdateRequest,
)
from app.services.trip_service import TripService

# Defers the unique (parent_id, order_index) checks to COMMIT. Without this,
# renumbering rows one at a time trips the constraint mid-loop even though the
# final state is perfectly valid.
DEFER_CONSTRAINTS = text("SET CONSTRAINTS ALL DEFERRED")


class ItineraryService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.trips = TripService(db)

    # -- ownership chain ---------------------------------------------------

    async def get_owned_stop(self, stop_id: uuid.UUID, user: User) -> TripStop:
        """Resolve a stop through its trip to the calling user."""
        stop = await self.db.scalar(
            select(TripStop)
            .where(TripStop.id == stop_id)
            .options(
                selectinload(TripStop.trip),
                selectinload(TripStop.destination),
                selectinload(TripStop.activities),
            )
        )
        if stop is None or stop.trip is None or stop.trip.deleted_at is not None:
            raise NotFoundError("Stop")
        if stop.trip.user_id != user.id and not user.is_admin:
            raise ForbiddenError("You do not have access to this stop")
        return stop

    async def get_owned_activity(
        self, activity_id: uuid.UUID, user: User
    ) -> ItineraryActivity:
        activity = await self.db.scalar(
            select(ItineraryActivity)
            .where(ItineraryActivity.id == activity_id)
            .options(
                selectinload(ItineraryActivity.stop).selectinload(TripStop.trip)
            )
        )
        if (
            activity is None
            or activity.stop is None
            or activity.stop.trip is None
            or activity.stop.trip.deleted_at is not None
        ):
            raise NotFoundError("Activity")
        if activity.stop.trip.user_id != user.id and not user.is_admin:
            raise ForbiddenError("You do not have access to this activity")
        return activity

    # -- validation --------------------------------------------------------

    @staticmethod
    def _check_stop_within_trip(
        trip: Trip, arrival: date, departure: date
    ) -> None:
        """Spec section 31.

        trip.start_date <= stop.arrival_date and
        stop.departure_date <= trip.end_date.
        """
        problems: dict[str, str] = {}
        if arrival < trip.start_date:
            problems["arrival_date"] = (
                f"Cannot be before the trip starts ({trip.start_date.isoformat()})"
            )
        if departure > trip.end_date:
            problems["departure_date"] = (
                f"Cannot be after the trip ends ({trip.end_date.isoformat()})"
            )
        if arrival > departure:
            problems["departure_date"] = "Cannot be earlier than the arrival date"
        if problems:
            raise ValidationError(
                "The stop's dates fall outside the trip",
                details={"fields": problems},
            )

    async def _overlap_warnings(
        self, trip_id: uuid.UUID, exclude_stop_id: uuid.UUID | None = None
    ) -> list[str]:
        """Refinement R6.

        Overlapping stops are a plausible mistake but not invalid -- a user
        may genuinely day-trip back to a previous city. Report, do not block.
        """
        stmt = select(TripStop).where(TripStop.trip_id == trip_id)
        if exclude_stop_id is not None:
            stmt = stmt.where(TripStop.id != exclude_stop_id)
        stops = (
            (await self.db.execute(stmt.order_by(TripStop.arrival_date)))
            .scalars()
            .all()
        )

        warnings = []
        for a, b in zip(stops, stops[1:]):
            if b.arrival_date < a.departure_date:
                warnings.append(
                    f"{a.city_name} and {b.city_name} have overlapping dates"
                )
        return warnings

    # -- stops -------------------------------------------------------------

    async def list_stops(self, trip_id: uuid.UUID, user: User) -> list[dict]:
        await self.trips.get_owned(trip_id, user)
        stops = (
            (
                await self.db.execute(
                    select(TripStop)
                    .where(TripStop.trip_id == trip_id)
                    .options(
                        selectinload(TripStop.activities),
                        selectinload(TripStop.destination),
                    )
                    .order_by(TripStop.order_index)
                )
            )
            .scalars()
            .all()
        )
        return [self.stop_out(s, include_activities=True) for s in stops]

    @staticmethod
    def stop_out(stop: TripStop, *, include_activities: bool = False) -> dict:
        activities = list(stop.activities or [])
        dest_payload = None
        if stop.destination is not None:
            dest_payload = {
                "id": stop.destination.id,
                "name": stop.destination.name,
                "country": stop.destination.country,
                "region": stop.destination.region,
                "description": stop.destination.description,
                "cost_index": stop.destination.cost_index,
                "popularity_score": stop.destination.popularity_score,
                "image_url": stop.destination.image_url,
                "latitude": float(stop.destination.latitude) if stop.destination.latitude is not None else None,
                "longitude": float(stop.destination.longitude) if stop.destination.longitude is not None else None,
            }

        payload = {
            "id": stop.id,
            "trip_id": stop.trip_id,
            "destination_id": stop.destination_id,
            "destination": dest_payload,
            "city_name": stop.city_name,
            "country": stop.country,
            "arrival_date": stop.arrival_date,
            "departure_date": stop.departure_date,
            "order_index": stop.order_index,
            "notes": stop.notes,
            "nights": (stop.departure_date - stop.arrival_date).days,
            "activity_count": len(activities),
            "estimated_cost": sum(
                (Decimal(str(a.estimated_cost)) for a in activities),
                Decimal("0"),
            ),
        }
        if include_activities:
            payload["activities"] = sorted(
                activities, key=lambda a: (a.activity_date, a.order_index)
            )
        return payload

    async def add_stop(
        self, trip_id: uuid.UUID, payload: StopCreateRequest, user: User
    ) -> tuple[dict, list[str]]:
        trip = await self.trips.get_owned(trip_id, user)
        self._check_stop_within_trip(
            trip, payload.arrival_date, payload.departure_date
        )

        resolved_city_name = payload.city_name
        resolved_country = payload.country

        if payload.destination_id is not None:
            dest = await self.db.get(Destination, payload.destination_id)
            if dest is None:
                raise ValidationError(
                    "That destination does not exist",
                    details={"fields": {"destination_id": "Unknown destination"}},
                )
            if not resolved_city_name:
                resolved_city_name = dest.name
            if not resolved_country:
                resolved_country = dest.country

        if not resolved_city_name:
            raise ValidationError(
                "City name is required",
                details={"fields": {"city_name": "City name must be provided or linked to a destination"}},
            )

        if payload.order_index is None:
            next_index = await self.db.scalar(
                select(func.coalesce(func.max(TripStop.order_index), -1) + 1).where(
                    TripStop.trip_id == trip_id
                )
            )
        else:
            next_index = payload.order_index
            # Make room: shift everything at or after the requested slot.
            await self.db.execute(
                TripStop.__table__.update()
                .where(
                    TripStop.trip_id == trip_id,
                    TripStop.order_index >= next_index,
                )
                .values(order_index=TripStop.order_index + 1)
            )

        stop = TripStop(
            trip_id=trip_id,
            destination_id=payload.destination_id,
            city_name=resolved_city_name,
            country=resolved_country,
            arrival_date=payload.arrival_date,
            departure_date=payload.departure_date,
            order_index=next_index,
            notes=payload.notes,
        )
        self.db.add(stop)
        await self.db.flush()

        warnings = await self._overlap_warnings(trip_id)
        await self.db.commit()
        await self.db.refresh(stop, ["activities", "destination"])
        return self.stop_out(stop, include_activities=True), warnings

    async def update_stop(
        self, stop_id: uuid.UUID, payload: StopUpdateRequest, user: User
    ) -> tuple[dict, list[str]]:
        stop = await self.get_owned_stop(stop_id, user)
        changes = payload.model_dump(exclude_unset=True)

        new_arrival = changes.get("arrival_date", stop.arrival_date)
        new_departure = changes.get("departure_date", stop.departure_date)
        self._check_stop_within_trip(stop.trip, new_arrival, new_departure)

        if "destination_id" in changes and changes["destination_id"] is not None:
            if await self.db.get(Destination, changes["destination_id"]) is None:
                raise ValidationError(
                    "That destination does not exist",
                    details={"fields": {"destination_id": "Unknown destination"}},
                )

        # Narrowing a stop's window can strand its own activities.
        if new_arrival != stop.arrival_date or new_departure != stop.departure_date:
            stranded = (
                (
                    await self.db.execute(
                        select(ItineraryActivity).where(
                            ItineraryActivity.stop_id == stop.id,
                            (ItineraryActivity.activity_date < new_arrival)
                            | (ItineraryActivity.activity_date > new_departure),
                        )
                    )
                )
                .scalars()
                .all()
            )
            if stranded:
                raise ValidationError(
                    "Some activities would fall outside the stop's new dates",
                    details={
                        "stranded_activities": [
                            {
                                "id": str(a.id),
                                "title": a.title,
                                "activity_date": a.activity_date.isoformat(),
                            }
                            for a in stranded
                        ]
                    },
                )

        for field, value in changes.items():
            setattr(stop, field, value)

        warnings = await self._overlap_warnings(stop.trip_id)
        await self.db.commit()
        await self.db.refresh(stop, ["activities"])
        return self.stop_out(stop, include_activities=True), warnings

    async def delete_stop(self, stop_id: uuid.UUID, user: User) -> None:
        stop = await self.get_owned_stop(stop_id, user)
        trip_id, removed_index = stop.trip_id, stop.order_index

        await self.db.delete(stop)
        await self.db.flush()

        # Close the gap so order_index stays contiguous.
        await self.db.execute(
            TripStop.__table__.update()
            .where(TripStop.trip_id == trip_id, TripStop.order_index > removed_index)
            .values(order_index=TripStop.order_index - 1)
        )
        await self.db.commit()

    async def reorder_stops(
        self, trip_id: uuid.UUID, ordered_ids: list[str], user: User
    ) -> list[dict]:
        """Apply a new stop order in one transaction.

        The client sends the complete ordering, which is verified to be an
        exact permutation of the trip's stops -- a partial or stale list is
        rejected rather than silently producing gaps. The unique constraint on
        (trip_id, order_index) is DEFERRABLE, so the renumbering can pass
        through transient collisions and is only checked at COMMIT.
        """
        await self.trips.get_owned(trip_id, user)

        stops = (
            (
                await self.db.execute(
                    select(TripStop).where(TripStop.trip_id == trip_id)
                )
            )
            .scalars()
            .all()
        )
        existing = {str(s.id): s for s in stops}

        if set(ordered_ids) != set(existing):
            raise ValidationError(
                "The ordering must list every stop in this trip exactly once",
                details={
                    "expected_count": len(existing),
                    "received_count": len(ordered_ids),
                    "unknown_ids": sorted(set(ordered_ids) - set(existing)),
                    "missing_ids": sorted(set(existing) - set(ordered_ids)),
                },
            )

        await self.db.execute(DEFER_CONSTRAINTS)
        for position, stop_id in enumerate(ordered_ids):
            existing[stop_id].order_index = position

        await self.db.commit()
        return await self.list_stops(trip_id, user)

    # -- activities --------------------------------------------------------

    async def add_activity(
        self,
        stop_id: uuid.UUID,
        payload: ItineraryActivityCreateRequest,
        user: User,
    ) -> tuple[dict, list[str]]:
        stop = await self.get_owned_stop(stop_id, user)

        # Spec section 31: the activity must fall inside its stop's window.
        if not (stop.arrival_date <= payload.activity_date <= stop.departure_date):
            raise ValidationError(
                "The activity date is outside this stop's dates",
                details={
                    "fields": {
                        "activity_date": (
                            f"Must be between {stop.arrival_date.isoformat()} "
                            f"and {stop.departure_date.isoformat()}"
                        )
                    }
                },
            )

        if payload.activity_id is not None:
            if await self.db.get(ActivityCatalog, payload.activity_id) is None:
                raise ValidationError(
                    "That catalog activity does not exist",
                    details={"fields": {"activity_id": "Unknown activity"}},
                )

        if payload.order_index is None:
            next_index = await self.db.scalar(
                select(
                    func.coalesce(func.max(ItineraryActivity.order_index), -1) + 1
                ).where(ItineraryActivity.stop_id == stop_id)
            )
        else:
            next_index = payload.order_index
            await self.db.execute(
                ItineraryActivity.__table__.update()
                .where(
                    ItineraryActivity.stop_id == stop_id,
                    ItineraryActivity.order_index >= next_index,
                )
                .values(order_index=ItineraryActivity.order_index + 1)
            )

        activity = ItineraryActivity(
            stop_id=stop_id,
            activity_id=payload.activity_id,
            title=payload.title,
            description=payload.description,
            activity_date=payload.activity_date,
            start_time=payload.start_time,
            end_time=payload.end_time,
            estimated_cost=payload.estimated_cost,
            category=payload.category,
            order_index=next_index,
            notes=payload.notes,
        )
        self.db.add(activity)
        await self.db.flush()

        warnings = await self._time_clash_warnings(stop_id, payload.activity_date)
        await self.db.commit()
        await self.db.refresh(activity)
        return activity, warnings

    async def _time_clash_warnings(
        self, stop_id: uuid.UUID, on_date: date
    ) -> list[str]:
        """Refinement R6: same-day time overlaps are flagged, not blocked."""
        rows = (
            (
                await self.db.execute(
                    select(ItineraryActivity)
                    .where(
                        ItineraryActivity.stop_id == stop_id,
                        ItineraryActivity.activity_date == on_date,
                        ItineraryActivity.start_time.is_not(None),
                        ItineraryActivity.end_time.is_not(None),
                    )
                    .order_by(ItineraryActivity.start_time)
                )
            )
            .scalars()
            .all()
        )

        warnings = []
        for a, b in zip(rows, rows[1:]):
            if b.start_time < a.end_time:
                warnings.append(
                    f"'{a.title}' and '{b.title}' overlap on "
                    f"{on_date.isoformat()}"
                )
        return warnings

    async def update_activity(
        self,
        activity_id: uuid.UUID,
        payload: ItineraryActivityUpdateRequest,
        user: User,
    ) -> tuple[dict, list[str]]:
        activity = await self.get_owned_activity(activity_id, user)
        stop = activity.stop
        changes = payload.model_dump(exclude_unset=True)

        new_date = changes.get("activity_date", activity.activity_date)
        if not (stop.arrival_date <= new_date <= stop.departure_date):
            raise ValidationError(
                "The activity date is outside this stop's dates",
                details={
                    "fields": {
                        "activity_date": (
                            f"Must be between {stop.arrival_date.isoformat()} "
                            f"and {stop.departure_date.isoformat()}"
                        )
                    }
                },
            )

        # Re-check the time range against whichever value was not sent.
        new_start = changes.get("start_time", activity.start_time)
        new_end = changes.get("end_time", activity.end_time)
        if new_end is not None and new_start is None:
            raise ValidationError(
                "An end time requires a start time",
                details={"fields": {"start_time": "Required when an end time is set"}},
            )
        if new_start is not None and new_end is not None and new_start >= new_end:
            raise ValidationError(
                "End time must be later than start time",
                details={"fields": {"end_time": "Must be after the start time"}},
            )

        for field, value in changes.items():
            setattr(activity, field, value)

        warnings = await self._time_clash_warnings(stop.id, new_date)
        await self.db.commit()
        await self.db.refresh(activity)
        return activity, warnings

    async def delete_activity(self, activity_id: uuid.UUID, user: User) -> None:
        activity = await self.get_owned_activity(activity_id, user)
        stop_id, removed_index = activity.stop_id, activity.order_index

        await self.db.delete(activity)
        await self.db.flush()
        await self.db.execute(
            ItineraryActivity.__table__.update()
            .where(
                ItineraryActivity.stop_id == stop_id,
                ItineraryActivity.order_index > removed_index,
            )
            .values(order_index=ItineraryActivity.order_index - 1)
        )
        await self.db.commit()

    async def reorder_activities(
        self, stop_id: uuid.UUID, ordered_ids: list[str], user: User
    ) -> list[ItineraryActivity]:
        await self.get_owned_stop(stop_id, user)

        rows = (
            (
                await self.db.execute(
                    select(ItineraryActivity).where(
                        ItineraryActivity.stop_id == stop_id
                    )
                )
            )
            .scalars()
            .all()
        )
        existing = {str(a.id): a for a in rows}

        if set(ordered_ids) != set(existing):
            raise ValidationError(
                "The ordering must list every activity in this stop exactly once",
                details={
                    "expected_count": len(existing),
                    "received_count": len(ordered_ids),
                    "unknown_ids": sorted(set(ordered_ids) - set(existing)),
                    "missing_ids": sorted(set(existing) - set(ordered_ids)),
                },
            )

        await self.db.execute(DEFER_CONSTRAINTS)
        for position, activity_id in enumerate(ordered_ids):
            existing[activity_id].order_index = position

        await self.db.commit()
        return sorted(existing.values(), key=lambda a: a.order_index)

    # -- itinerary view (spec section 13) ---------------------------------

    async def itinerary(self, trip_id: uuid.UUID, user: User) -> dict:
        """Activities grouped by day, across every stop."""
        trip = await self.trips.get_owned(trip_id, user)
        stops = (
            (
                await self.db.execute(
                    select(TripStop)
                    .where(TripStop.trip_id == trip_id)
                    .options(selectinload(TripStop.activities))
                    .order_by(TripStop.order_index)
                )
            )
            .scalars()
            .all()
        )

        # Which stop covers a given day. Later stops win on overlap, matching
        # the order the traveller actually moves through them.
        stop_for_day: dict[date, TripStop] = {}
        for stop in stops:
            cursor = stop.arrival_date
            while cursor <= stop.departure_date:
                stop_for_day[cursor] = stop
                cursor += timedelta(days=1)

        by_day: dict[date, list[ItineraryActivity]] = {}
        for stop in stops:
            for activity in stop.activities:
                by_day.setdefault(activity.activity_date, []).append(activity)

        days = []
        cursor = trip.start_date
        day_number = 1
        while cursor <= trip.end_date:
            activities = sorted(
                by_day.get(cursor, []),
                key=lambda a: (a.start_time or dt_time.min, a.order_index),
            )
            stop = stop_for_day.get(cursor)
            days.append(
                {
                    "date": cursor,
                    "day_number": day_number,
                    "city_name": stop.city_name if stop else None,
                    "stop_id": stop.id if stop else None,
                    "activities": activities,
                    "estimated_cost": sum(
                        (Decimal(str(a.estimated_cost)) for a in activities),
                        Decimal("0"),
                    ),
                }
            )
            cursor += timedelta(days=1)
            day_number += 1

        return {
            "trip_id": trip.id,
            "title": trip.title,
            "start_date": trip.start_date,
            "end_date": trip.end_date,
            "days": days,
            "stops": [self.stop_out(s) for s in stops],
        }
