"""Detecting when an itinerary no longer holds together.

Every check here answers the same question from a different angle: *given
these stops, activities, transfers and booked components, what does not fit?*
That question is asked in two places and must give the same answer in both --
while a traveller edits their plan (as advisory warnings) and while the
adaptation engine costs a proposed change (as part of the impact report).
Duplicating the rules in both places is how the two drift apart, so they live
here once.

**Nothing here blocks.** A conflict is reported, never enforced. A traveller
who genuinely wants ninety minutes between a landing and a walking tour is
allowed to have it; being told is the product, being refused is not. The
database's own ``CHECK`` constraints already reject data that is *invalid*
(a stop that departs before it arrives); this module is about arrangements
that are merely *unwise*, which is a judgement and therefore advisory.

The one exception is ``BLOCKER`` severity, which the adaptation engine treats
as "this change cannot be applied as proposed" -- reserved for the two cases
where applying it would produce something incoherent rather than unpleasant:
a component with nowhere left to attach, and a date with no availability.
"""

import uuid
from dataclasses import asdict, dataclass, field
from datetime import date, time
from typing import Any, Iterable, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Booking,
    BookingItem,
    ItineraryActivity,
    Transport,
    Trip,
    TripStop,
    UserPreference,
)
from app.models.enums import (
    BookingItemStatus,
    ConflictSeverity,
    TravelPace,
)

# Minimum gap between arriving in a city and the first scheduled activity, and
# between the last activity and departing. Not a rule -- a courtesy margin,
# below which a plan is technically possible and practically miserable.
TRANSFER_BUFFER_MINUTES = 90

# How many activities in one day starts to look like too many, per stated
# pace. A traveller who said "relaxed" and then booked six things has either
# changed their mind or made a mistake, and either way is worth a nudge.
PACE_ACTIVITY_CEILING: dict[TravelPace, int] = {
    TravelPace.RELAXED: 3,
    TravelPace.BALANCED: 5,
    TravelPace.PACKED: 8,
}


@dataclass
class Conflict:
    """One problem, named well enough to act on.

    ``code`` is stable and machine-readable so the UI can branch on it;
    ``message`` is written for the traveller, not the developer. ``entity``
    and ``entity_id`` say what to highlight, which is what turns a warning
    into something a person can actually fix.
    """

    code: str
    severity: ConflictSeverity
    message: str
    entity: str | None = None
    entity_id: uuid.UUID | None = None
    on_date: date | None = None
    details: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["severity"] = self.severity.value
        data["entity_id"] = str(self.entity_id) if self.entity_id else None
        data["on_date"] = self.on_date.isoformat() if self.on_date else None
        return data


def _minutes(value: time) -> int:
    return value.hour * 60 + value.minute


def _overlaps(
    a_start: time | None, a_end: time | None, b_start: time | None, b_end: time | None
) -> bool:
    """Do two half-open time ranges collide?

    An activity with no times is treated as not colliding with anything: "some
    time on Tuesday" cannot be proven to clash with "14:00-16:00 on Tuesday",
    and guessing would produce warnings nobody can act on. An open-ended
    activity is given a nominal one-hour footprint, which is enough to catch
    two things booked at the same start time.
    """
    if a_start is None or b_start is None:
        return False
    a_from, b_from = _minutes(a_start), _minutes(b_start)
    a_to = _minutes(a_end) if a_end else a_from + 60
    b_to = _minutes(b_end) if b_end else b_from + 60
    return a_from < b_to and b_from < a_to


class ConflictService:
    """Runs the checks against a loaded trip.

    Loading is done once, eagerly, in :meth:`load`. The alternative -- lazy
    relationship access inside the checks -- issues a query per stop per check
    under async SQLAlchemy, where a lazy load raises rather than silently
    N+1ing. Loading up front is both faster and the only thing that works.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # -- loading -----------------------------------------------------------

    async def load(self, trip_id: uuid.UUID) -> Trip | None:
        return (
            await self.db.execute(
                select(Trip)
                .where(Trip.id == trip_id)
                .options(
                    selectinload(Trip.stops).selectinload(TripStop.activities),
                    selectinload(Trip.stops).selectinload(TripStop.accommodations),
                    selectinload(Trip.transports),
                )
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()

    async def _live_items(self, trip_id: uuid.UUID) -> list[BookingItem]:
        """Every component still committed on this trip, across bookings."""
        return list(
            (
                await self.db.execute(
                    select(BookingItem)
                    .join(Booking, BookingItem.booking_id == Booking.id)
                    .where(
                        Booking.trip_id == trip_id,
                        BookingItem.status.in_(
                            (
                                BookingItemStatus.PENDING,
                                BookingItemStatus.CONFIRMED,
                            )
                        ),
                    )
                    .order_by(BookingItem.service_date)
                )
            )
            .scalars()
            .all()
        )

    async def _pace(self, user_id: uuid.UUID) -> TravelPace | None:
        prefs = await self.db.scalar(
            select(UserPreference).where(UserPreference.user_id == user_id)
        )
        return prefs.pace if prefs else None

    # -- the checks --------------------------------------------------------

    @staticmethod
    def stop_conflicts(stops: Sequence[TripStop]) -> list[Conflict]:
        """Stops that overlap each other or fall outside the trip."""
        found: list[Conflict] = []
        ordered = sorted(stops, key=lambda s: (s.arrival_date, s.order_index))

        for earlier, later in zip(ordered, ordered[1:]):
            if later.arrival_date < earlier.departure_date:
                found.append(
                    Conflict(
                        code="STOP_OVERLAP",
                        severity=ConflictSeverity.WARNING,
                        message=(
                            f"{earlier.city_name} runs until "
                            f"{earlier.departure_date} but {later.city_name} "
                            f"starts on {later.arrival_date}."
                        ),
                        entity="trip_stop",
                        entity_id=later.id,
                        on_date=later.arrival_date,
                        details={"other_stop_id": str(earlier.id)},
                    )
                )
            # Same-day city changes are normal; a gap is a day unaccounted for.
            elif (later.arrival_date - earlier.departure_date).days > 1:
                gap = (later.arrival_date - earlier.departure_date).days - 1
                found.append(
                    Conflict(
                        code="ITINERARY_GAP",
                        severity=ConflictSeverity.INFO,
                        message=(
                            f"{gap} day(s) unplanned between leaving "
                            f"{earlier.city_name} and reaching {later.city_name}."
                        ),
                        entity="trip_stop",
                        entity_id=later.id,
                        on_date=earlier.departure_date,
                        details={"gap_days": gap},
                    )
                )
        return found

    @staticmethod
    def stops_within_trip(trip: Trip) -> list[Conflict]:
        found: list[Conflict] = []
        for stop in trip.stops:
            if stop.arrival_date < trip.start_date or stop.departure_date > trip.end_date:
                found.append(
                    Conflict(
                        code="STOP_OUTSIDE_TRIP",
                        severity=ConflictSeverity.BLOCKER,
                        message=(
                            f"{stop.city_name} ({stop.arrival_date} to "
                            f"{stop.departure_date}) falls outside the trip "
                            f"dates {trip.start_date} to {trip.end_date}."
                        ),
                        entity="trip_stop",
                        entity_id=stop.id,
                        on_date=stop.arrival_date,
                    )
                )
        return found

    @staticmethod
    def activity_conflicts(stops: Sequence[TripStop]) -> list[Conflict]:
        """Activities that clash with each other or sit outside their stop."""
        found: list[Conflict] = []

        for stop in stops:
            by_day: dict[date, list[ItineraryActivity]] = {}
            for activity in stop.activities:
                by_day.setdefault(activity.activity_date, []).append(activity)

                if not (
                    stop.arrival_date <= activity.activity_date <= stop.departure_date
                ):
                    found.append(
                        Conflict(
                            code="ACTIVITY_OUTSIDE_STOP",
                            severity=ConflictSeverity.BLOCKER,
                            message=(
                                f'"{activity.title}" is on '
                                f"{activity.activity_date}, but you are only in "
                                f"{stop.city_name} from {stop.arrival_date} to "
                                f"{stop.departure_date}."
                            ),
                            entity="itinerary_activity",
                            entity_id=activity.id,
                            on_date=activity.activity_date,
                            details={"stop_id": str(stop.id)},
                        )
                    )

            for day, entries in by_day.items():
                timed = sorted(
                    (a for a in entries if a.start_time is not None),
                    key=lambda a: a.start_time,  # type: ignore[arg-type,return-value]
                )
                for first, second in zip(timed, timed[1:]):
                    if _overlaps(
                        first.start_time,
                        first.end_time,
                        second.start_time,
                        second.end_time,
                    ):
                        found.append(
                            Conflict(
                                code="ACTIVITY_TIME_CLASH",
                                severity=ConflictSeverity.WARNING,
                                message=(
                                    f'"{first.title}" and "{second.title}" '
                                    f"overlap on {day}."
                                ),
                                entity="itinerary_activity",
                                entity_id=second.id,
                                on_date=day,
                                details={"other_activity_id": str(first.id)},
                            )
                        )
        return found

    @staticmethod
    def accommodation_conflicts(stops: Sequence[TripStop]) -> list[Conflict]:
        """Nights booked that no longer line up with the stop they belong to.

        This is the check that fires when a date shift moves a city but leaves
        the hotel behind, which is the single most common way an adapted
        itinerary quietly breaks.
        """
        found: list[Conflict] = []
        for stop in stops:
            for stay in stop.accommodations:
                if stay.check_in < stop.arrival_date or stay.check_out > stop.departure_date:
                    found.append(
                        Conflict(
                            code="ACCOMMODATION_DATE_MISMATCH",
                            severity=ConflictSeverity.WARNING,
                            message=(
                                f"{stay.name} is booked {stay.check_in} to "
                                f"{stay.check_out}, but {stop.city_name} runs "
                                f"{stop.arrival_date} to {stop.departure_date}."
                            ),
                            entity="accommodation",
                            entity_id=stay.id,
                            on_date=stay.check_in,
                            details={"stop_id": str(stop.id)},
                        )
                    )
        return found

    @staticmethod
    def transport_conflicts(
        transports: Sequence[Transport], stops: Sequence[TripStop]
    ) -> list[Conflict]:
        """Transfers that point at a stop that moved, or arrive too late.

        The dependency check the plan calls for: a leg is only meaningful
        relative to the stops it joins, so when a stop moves the leg is what
        breaks first and most silently.
        """
        found: list[Conflict] = []
        by_id = {s.id: s for s in stops}

        for leg in transports:
            destination = by_id.get(leg.destination_stop_id) if leg.destination_stop_id else None
            origin = by_id.get(leg.origin_stop_id) if leg.origin_stop_id else None

            if leg.destination_stop_id and destination is None:
                found.append(
                    Conflict(
                        code="TRANSPORT_ORPHANED",
                        severity=ConflictSeverity.BLOCKER,
                        message=(
                            f"A {leg.transport_type.value} leg points at a stop "
                            f"that is no longer on this trip."
                        ),
                        entity="transport",
                        entity_id=leg.id,
                        on_date=leg.departure_time.date(),
                    )
                )
                continue

            if destination is not None and leg.arrival_time.date() > destination.arrival_date:
                found.append(
                    Conflict(
                        code="TRANSPORT_ARRIVES_LATE",
                        severity=ConflictSeverity.WARNING,
                        message=(
                            f"The {leg.transport_type.value} to "
                            f"{destination.city_name} arrives "
                            f"{leg.arrival_time.date()}, after that stop begins "
                            f"on {destination.arrival_date}."
                        ),
                        entity="transport",
                        entity_id=leg.id,
                        on_date=leg.arrival_time.date(),
                        details={"stop_id": str(destination.id)},
                    )
                )

            if origin is not None and leg.departure_time.date() < origin.arrival_date:
                found.append(
                    Conflict(
                        code="TRANSPORT_DEPARTS_EARLY",
                        severity=ConflictSeverity.WARNING,
                        message=(
                            f"The {leg.transport_type.value} out of "
                            f"{origin.city_name} leaves "
                            f"{leg.departure_time.date()}, before you get there "
                            f"on {origin.arrival_date}."
                        ),
                        entity="transport",
                        entity_id=leg.id,
                        on_date=leg.departure_time.date(),
                        details={"stop_id": str(origin.id)},
                    )
                )

            # Landing and being somewhere else the same hour.
            if destination is not None and leg.arrival_time.date() == destination.arrival_date:
                arrival_minutes = leg.arrival_time.hour * 60 + leg.arrival_time.minute
                for activity in destination.activities:
                    if (
                        activity.activity_date == destination.arrival_date
                        and activity.start_time is not None
                        and _minutes(activity.start_time) - arrival_minutes
                        < TRANSFER_BUFFER_MINUTES
                    ):
                        found.append(
                            Conflict(
                                code="INSUFFICIENT_TRANSFER_TIME",
                                severity=ConflictSeverity.WARNING,
                                message=(
                                    f'"{activity.title}" starts '
                                    f"{activity.start_time.strftime('%H:%M')}, "
                                    f"less than {TRANSFER_BUFFER_MINUTES} minutes "
                                    f"after landing at "
                                    f"{leg.arrival_time.strftime('%H:%M')}."
                                ),
                                entity="itinerary_activity",
                                entity_id=activity.id,
                                on_date=activity.activity_date,
                                details={"transport_id": str(leg.id)},
                            )
                        )
        return found

    @staticmethod
    def booking_conflicts(
        items: Sequence[BookingItem], trip: Trip
    ) -> list[Conflict]:
        """Paid-for components that no longer match the plan they belong to.

        This is where a change gets expensive rather than merely inconvenient:
        every item listed here is money already committed against a date the
        itinerary has moved away from.
        """
        found: list[Conflict] = []
        stops_by_city = {
            (s.city_name or "").strip().lower(): s for s in trip.stops
        }

        for item in items:
            if not (trip.start_date <= item.service_date <= trip.end_date):
                found.append(
                    Conflict(
                        code="BOOKED_ITEM_OUTSIDE_TRIP",
                        severity=ConflictSeverity.BLOCKER,
                        message=(
                            f"{item.title} is booked for {item.service_date}, "
                            f"outside the trip dates {trip.start_date} to "
                            f"{trip.end_date}."
                        ),
                        entity="booking_item",
                        entity_id=item.id,
                        on_date=item.service_date,
                        details={"total_price": str(item.total_price)},
                    )
                )
                continue

            stop = stops_by_city.get((item.city or "").strip().lower())
            if item.city and stop is None:
                found.append(
                    Conflict(
                        code="BOOKED_ITEM_ORPHANED",
                        severity=ConflictSeverity.WARNING,
                        message=(
                            f"{item.title} is in {item.city}, which is no longer "
                            f"a stop on this trip."
                        ),
                        entity="booking_item",
                        entity_id=item.id,
                        on_date=item.service_date,
                        details={"total_price": str(item.total_price)},
                    )
                )
            elif stop is not None and not (
                stop.arrival_date <= item.service_date <= stop.departure_date
            ):
                found.append(
                    Conflict(
                        code="BOOKED_ITEM_DATE_MISMATCH",
                        severity=ConflictSeverity.WARNING,
                        message=(
                            f"{item.title} is booked for {item.service_date}, "
                            f"but you are in {stop.city_name} from "
                            f"{stop.arrival_date} to {stop.departure_date}."
                        ),
                        entity="booking_item",
                        entity_id=item.id,
                        on_date=item.service_date,
                        details={
                            "stop_id": str(stop.id),
                            "total_price": str(item.total_price),
                        },
                    )
                )
        return found

    @staticmethod
    def pace_conflicts(
        stops: Sequence[TripStop], pace: TravelPace | None
    ) -> list[Conflict]:
        """Days that contradict the traveller's own stated pace.

        Silent when no pace has been stated: an unstated preference is not the
        same as a preference for anything, and inventing a ceiling would
        produce warnings the traveller never asked for.
        """
        if pace is None:
            return []
        ceiling = PACE_ACTIVITY_CEILING[pace]
        found: list[Conflict] = []

        counts: dict[date, int] = {}
        for stop in stops:
            for activity in stop.activities:
                counts[activity.activity_date] = counts.get(activity.activity_date, 0) + 1

        for day, count in sorted(counts.items()):
            if count > ceiling:
                found.append(
                    Conflict(
                        code="PACE_EXCEEDED",
                        severity=ConflictSeverity.INFO,
                        message=(
                            f"{count} activities on {day}. You said you prefer a "
                            f"{pace.value} pace, which is nearer {ceiling} a day."
                        ),
                        on_date=day,
                        details={"count": count, "ceiling": ceiling},
                    )
                )
        return found

    # -- entry points ------------------------------------------------------

    async def check_trip(
        self, trip_id: uuid.UUID, *, include_bookings: bool = True
    ) -> list[Conflict]:
        """Every conflict on a trip as it currently stands."""
        trip = await self.load(trip_id)
        if trip is None:
            return []

        stops = list(trip.stops)
        found = [
            *self.stops_within_trip(trip),
            *self.stop_conflicts(stops),
            *self.activity_conflicts(stops),
            *self.accommodation_conflicts(stops),
            *self.transport_conflicts(list(trip.transports), stops),
            *self.pace_conflicts(stops, await self._pace(trip.user_id)),
        ]
        if include_bookings:
            found.extend(self.booking_conflicts(await self._live_items(trip.id), trip))
        return _ordered(found)

    # Codes the itinerary endpoints already detect for themselves, in their
    # own wording. Reporting them twice with two phrasings would read like two
    # separate problems.
    ALREADY_REPORTED_INLINE = frozenset({"STOP_OVERLAP", "ACTIVITY_TIME_CLASH"})

    async def dependency_warnings(self, trip_id: uuid.UUID) -> list[str]:
        """The advisories an itinerary edit should carry but cannot see itself.

        Moving one stop breaks things attached to *other* rows -- a transfer
        pointing at it, a hotel booked around it, a paid-for activity now
        outside the trip. Those are invisible to a stop-level validator, which
        is exactly why the checks live in one place and are called from the
        write paths rather than reimplemented inside each of them.
        """
        return [
            c.message
            for c in await self.check_trip(trip_id)
            if c.severity is not ConflictSeverity.INFO
            and c.code not in self.ALREADY_REPORTED_INLINE
        ]

    async def warnings_for(self, trip_id: uuid.UUID) -> list[str]:
        """The advisory strings the itinerary endpoints already return.

        Bookings are excluded: these fire on ordinary itinerary edits, where a
        commercial consequence is the adaptation engine's business to report
        properly rather than something to mention in passing.
        """
        return [
            c.message
            for c in await self.check_trip(trip_id, include_bookings=False)
            if c.severity is not ConflictSeverity.INFO
        ]


# Blockers first, then warnings, then notes -- the order somebody reading the
# list would want to deal with them in.
_SEVERITY_RANK = {
    ConflictSeverity.BLOCKER: 0,
    ConflictSeverity.WARNING: 1,
    ConflictSeverity.INFO: 2,
}


def _ordered(conflicts: Iterable[Conflict]) -> list[Conflict]:
    return sorted(
        conflicts,
        key=lambda c: (_SEVERITY_RANK[c.severity], c.on_date or date.max, c.code),
    )
