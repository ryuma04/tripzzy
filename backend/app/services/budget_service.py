"""Budget summary and calendar events (spec sections 14, 17)."""

import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Accommodation,
    Expense,
    ItineraryActivity,
    Transport,
    TripStop,
    User,
)
from app.models.enums import ExpenseCategory
from app.services.trip_service import TripService

ZERO = Decimal("0")


class BudgetService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.trips = TripService(db)

    async def budget(self, trip_id: uuid.UUID, user: User) -> dict:
        """Spec section 14.

        Reports two different things side by side, because they answer
        different questions:

        * **planned** -- the sum of estimates already in the itinerary
          (activities, transport, accommodation);
        * **actual** -- what the user has recorded actually spending.

        ``remaining`` is measured against actual spend, since that is what is
        really gone.
        """
        trip = await self.trips.get_owned(trip_id, user)

        planned_activities = await self.db.scalar(
            select(func.coalesce(func.sum(ItineraryActivity.estimated_cost), 0))
            .select_from(ItineraryActivity)
            .join(TripStop, ItineraryActivity.stop_id == TripStop.id)
            .where(TripStop.trip_id == trip_id)
        )
        planned_transport = await self.db.scalar(
            select(func.coalesce(func.sum(Transport.cost), 0)).where(
                Transport.trip_id == trip_id
            )
        )
        planned_accommodation = await self.db.scalar(
            select(func.coalesce(func.sum(Accommodation.estimated_cost), 0))
            .select_from(Accommodation)
            .join(TripStop, Accommodation.stop_id == TripStop.id)
            .where(TripStop.trip_id == trip_id)
        )

        planned = {
            "activities": Decimal(str(planned_activities)),
            "transport": Decimal(str(planned_transport)),
            "accommodation": Decimal(str(planned_accommodation)),
        }
        planned["meals"] = ZERO
        planned["miscellaneous"] = ZERO
        planned_total = sum(planned.values(), ZERO)

        # Actual spend, bucketed into the five categories from section 14.
        spent_rows = (
            await self.db.execute(
                select(Expense.category, func.coalesce(func.sum(Expense.amount), 0))
                .where(Expense.trip_id == trip_id)
                .group_by(Expense.category)
            )
        ).all()
        actual = {c.value: ZERO for c in ExpenseCategory}
        for category, amount in spent_rows:
            actual[category.value] = Decimal(str(amount))
        actual_total = sum(actual.values(), ZERO)

        budget = Decimal(str(trip.budget))
        travellers = max(trip.traveller_count, 1)

        return {
            "trip_id": trip.id,
            "currency": trip.currency,
            "total_budget": budget,
            "estimated_cost": planned_total,
            "actual_cost": actual_total,
            "remaining": budget - actual_total,
            "remaining_against_estimate": budget - planned_total,
            "over_budget": actual_total > budget,
            "percent_used": (
                float((actual_total / budget * 100).quantize(Decimal("0.01")))
                if budget > 0
                else 0.0
            ),
            "per_traveller": {
                "budget": (budget / travellers).quantize(Decimal("0.01")),
                "estimated": (planned_total / travellers).quantize(Decimal("0.01")),
                "actual": (actual_total / travellers).quantize(Decimal("0.01")),
            },
            "breakdown": [
                {
                    "category": category,
                    "estimated": planned.get(category, ZERO),
                    "actual": actual.get(category, ZERO),
                }
                for category in [c.value for c in ExpenseCategory]
            ],
        }

    async def calendar(
        self,
        trip_id: uuid.UUID,
        user: User,
        *,
        month: int | None = None,
        year: int | None = None,
    ) -> dict:
        """Spec section 17.

        Flattens three different kinds of thing -- scheduled activities,
        transport legs and accommodation check-in/check-out -- into one
        ``events`` list keyed by date, which is what a calendar view needs.
        """
        trip = await self.trips.get_owned(trip_id, user)

        stops = (
            (
                await self.db.execute(
                    select(TripStop)
                    .where(TripStop.trip_id == trip_id)
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

        events: list[dict] = []

        for stop in stops:
            for activity in stop.activities:
                events.append(
                    {
                        "id": str(activity.id),
                        "type": "activity",
                        "date": activity.activity_date,
                        "start_time": activity.start_time,
                        "end_time": activity.end_time,
                        "title": activity.title,
                        "city": stop.city_name,
                        "stop_id": str(stop.id),
                        "cost": activity.estimated_cost,
                        "category": activity.category.value,
                    }
                )

            for stay in stop.accommodations:
                events.append(
                    {
                        "id": f"{stay.id}:in",
                        "type": "accommodation_check_in",
                        "date": stay.check_in,
                        "start_time": None,
                        "end_time": None,
                        "title": f"Check in: {stay.name}",
                        "city": stop.city_name,
                        "stop_id": str(stop.id),
                        "cost": stay.estimated_cost,
                        "category": "accommodation",
                    }
                )
                events.append(
                    {
                        "id": f"{stay.id}:out",
                        "type": "accommodation_check_out",
                        "date": stay.check_out,
                        "start_time": None,
                        "end_time": None,
                        "title": f"Check out: {stay.name}",
                        "city": stop.city_name,
                        "stop_id": str(stop.id),
                        "cost": ZERO,
                        "category": "accommodation",
                    }
                )

        transports = (
            (
                await self.db.execute(
                    select(Transport)
                    .where(Transport.trip_id == trip_id)
                    .options(
                        selectinload(Transport.origin_stop),
                        selectinload(Transport.destination_stop),
                    )
                )
            )
            .scalars()
            .all()
        )
        for leg in transports:
            origin = leg.origin_stop.city_name if leg.origin_stop else "?"
            destination = (
                leg.destination_stop.city_name if leg.destination_stop else "?"
            )
            events.append(
                {
                    "id": str(leg.id),
                    "type": "transport",
                    "date": leg.departure_time.date(),
                    "start_time": leg.departure_time.time(),
                    "end_time": leg.arrival_time.time(),
                    "title": f"{leg.transport_type.value.title()}: "
                    f"{origin} to {destination}",
                    "city": origin,
                    "stop_id": str(leg.origin_stop_id) if leg.origin_stop_id else None,
                    "cost": leg.cost,
                    "category": "transport",
                }
            )

        if month is not None and year is not None:
            events = [
                e
                for e in events
                if e["date"].month == month and e["date"].year == year
            ]

        # Undated-time events sort first within a day, which reads correctly
        # in a day column.
        events.sort(key=lambda e: (e["date"], e["start_time"] is not None, e["start_time"]))

        by_date: dict[str, int] = {}
        for event in events:
            key = event["date"].isoformat()
            by_date[key] = by_date.get(key, 0) + 1

        return {
            "trip_id": trip.id,
            "title": trip.title,
            "start_date": trip.start_date,
            "end_date": trip.end_date,
            "events": events,
            "event_counts_by_date": by_date,
        }

    async def user_calendar(
        self, user: User, *, start: date | None = None, end: date | None = None
    ) -> dict:
        """Every scheduled activity across all of the user's trips.

        Backs the standalone calendar screen (spec section 17), which is not
        scoped to a single trip.
        """
        from app.models import Trip  # local import avoids a cycle

        window_start = start or date.today() - timedelta(days=30)
        window_end = end or date.today() + timedelta(days=180)

        events: list[dict] = []

        # 1. Activities
        activity_rows = (
            await self.db.execute(
                select(
                    ItineraryActivity,
                    TripStop.city_name,
                    Trip.id,
                    Trip.title,
                )
                .join(TripStop, ItineraryActivity.stop_id == TripStop.id)
                .join(Trip, TripStop.trip_id == Trip.id)
                .where(
                    Trip.user_id == user.id,
                    Trip.deleted_at.is_(None),
                    ItineraryActivity.activity_date >= window_start,
                    ItineraryActivity.activity_date <= window_end,
                )
            )
        ).all()
        for activity, city, trip_id, trip_title in activity_rows:
            events.append(
                {
                    "id": f"act_{activity.id}",
                    "type": "activity",
                    "date": activity.activity_date,
                    "start_time": activity.start_time,
                    "end_time": activity.end_time,
                    "title": activity.title,
                    "city": city,
                    "trip_id": str(trip_id),
                    "trip_title": trip_title,
                    "cost": activity.estimated_cost,
                }
            )

        # 2. Stops (Arrival)
        stop_rows = (
            await self.db.execute(
                select(TripStop, Trip.id, Trip.title)
                .join(Trip, TripStop.trip_id == Trip.id)
                .where(
                    Trip.user_id == user.id,
                    Trip.deleted_at.is_(None),
                )
            )
        ).all()
        for stop, trip_id, trip_title in stop_rows:
            if window_start <= stop.arrival_date <= window_end:
                events.append(
                    {
                        "id": f"stop_arr_{stop.id}",
                        "type": "stop",
                        "date": stop.arrival_date,
                        "start_time": None,
                        "end_time": None,
                        "title": f"Arrive in {stop.city_name}",
                        "city": stop.city_name,
                        "trip_id": str(trip_id),
                        "trip_title": trip_title,
                        "cost": Decimal("0"),
                    }
                )

        # 3. Accommodations (Check-in)
        acc_rows = (
            await self.db.execute(
                select(Accommodation, TripStop.city_name, Trip.id, Trip.title)
                .join(TripStop, Accommodation.stop_id == TripStop.id)
                .join(Trip, TripStop.trip_id == Trip.id)
                .where(
                    Trip.user_id == user.id,
                    Trip.deleted_at.is_(None),
                    Accommodation.check_in >= window_start,
                    Accommodation.check_in <= window_end,
                )
            )
        ).all()
        for acc, city, trip_id, trip_title in acc_rows:
            events.append(
                {
                    "id": f"acc_{acc.id}",
                    "type": "accommodation",
                    "date": acc.check_in,
                    "start_time": None,
                    "end_time": None,
                    "title": f"Check-in: {acc.name}",
                    "city": city,
                    "trip_id": str(trip_id),
                    "trip_title": trip_title,
                    "cost": acc.estimated_cost,
                }
            )

        # 4. Transports
        transport_rows = (
            await self.db.execute(
                select(Transport, Trip.id, Trip.title)
                .options(
                    selectinload(Transport.origin_stop),
                    selectinload(Transport.destination_stop),
                )
                .join(Trip, Transport.trip_id == Trip.id)
                .where(
                    Trip.user_id == user.id,
                    Trip.deleted_at.is_(None),
                )
            )
        ).all()
        for trans, trip_id, trip_title in transport_rows:
            dep_date = trans.departure_time.date()
            if window_start <= dep_date <= window_end:
                orig = trans.origin_stop.city_name if trans.origin_stop else "Departure"
                dest = trans.destination_stop.city_name if trans.destination_stop else "Arrival"
                mode = trans.transport_type.value.upper() if hasattr(trans.transport_type, "value") else str(trans.transport_type).upper()
                events.append(
                    {
                        "id": f"trans_{trans.id}",
                        "type": "transport",
                        "date": dep_date,
                        "start_time": trans.departure_time.time(),
                        "end_time": trans.arrival_time.time(),
                        "title": f"{mode}: {orig} → {dest}",
                        "city": orig,
                        "trip_id": str(trip_id),
                        "trip_title": trip_title,
                        "cost": trans.cost,
                    }
                )

        events.sort(
            key=lambda e: (
                e["date"],
                0 if e["start_time"] is None else 1,
                str(e["start_time"] or ""),
            )
        )

        return {
            "start": window_start,
            "end": window_end,
            "events": events,
        }
