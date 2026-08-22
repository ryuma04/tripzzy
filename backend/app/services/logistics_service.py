"""Transport, accommodation and expenses (spec sections 15, 19, 20, 31)."""

import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.models import Accommodation, Expense, Transport, Trip, TripStop, User
from app.schemas.logistics import (
    AccommodationCreateRequest,
    AccommodationUpdateRequest,
    ExpenseCreateRequest,
    ExpenseUpdateRequest,
    TransportCreateRequest,
    TransportUpdateRequest,
)
from app.services.itinerary_service import ItineraryService
from app.services.trip_service import TripService

# Spec section 15's example dates an expense on a trip day, but travel spills
# over at the edges (an airport taxi the night before). One day of slack on
# each side accepts that without letting an unrelated date through.
EXPENSE_DATE_GRACE = timedelta(days=1)


class LogisticsService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.trips = TripService(db)
        self.itinerary = ItineraryService(db)

    # -- transport ---------------------------------------------------------

    @staticmethod
    def transport_out(t: Transport) -> dict:
        return {
            "id": t.id,
            "trip_id": t.trip_id,
            "origin_stop_id": t.origin_stop_id,
            "destination_stop_id": t.destination_stop_id,
            "origin_city": t.origin_stop.city_name if t.origin_stop else None,
            "destination_city": (
                t.destination_stop.city_name if t.destination_stop else None
            ),
            "transport_type": t.transport_type,
            "provider": t.provider,
            "departure_time": t.departure_time,
            "arrival_time": t.arrival_time,
            "cost": t.cost,
            "booking_ref": t.booking_ref,
            "notes": t.notes,
            "duration_minutes": int(
                (t.arrival_time - t.departure_time).total_seconds() // 60
            ),
        }

    async def _validate_transport_stops(
        self,
        trip: Trip,
        origin_stop_id: uuid.UUID | None,
        destination_stop_id: uuid.UUID | None,
    ) -> None:
        """Both stops must belong to *this* trip.

        Without this check a user could reference a stop from someone else's
        trip and leak its existence, or silently corrupt their own itinerary.
        """
        for label, stop_id in (
            ("origin_stop_id", origin_stop_id),
            ("destination_stop_id", destination_stop_id),
        ):
            if stop_id is None:
                continue
            stop = await self.db.get(TripStop, stop_id)
            if stop is None or stop.trip_id != trip.id:
                raise ValidationError(
                    "That stop does not belong to this trip",
                    details={"fields": {label: "Unknown stop for this trip"}},
                )

    @staticmethod
    def _validate_transport_window(
        trip: Trip, departure: datetime, arrival: datetime
    ) -> None:
        """Keep the leg inside the trip's own dates."""
        trip_start = datetime.combine(trip.start_date, time.min, tzinfo=timezone.utc)
        trip_end = datetime.combine(trip.end_date, time.max, tzinfo=timezone.utc)

        problems = {}
        if departure < trip_start:
            problems["departure_time"] = (
                f"Cannot be before the trip starts ({trip.start_date.isoformat()})"
            )
        if arrival > trip_end:
            problems["arrival_time"] = (
                f"Cannot be after the trip ends ({trip.end_date.isoformat()})"
            )
        if problems:
            raise ValidationError(
                "The transport times fall outside the trip",
                details={"fields": problems},
            )

    async def list_transport(self, trip_id: uuid.UUID, user: User) -> list[dict]:
        await self.trips.get_owned(trip_id, user)
        rows = (
            (
                await self.db.execute(
                    select(Transport)
                    .where(Transport.trip_id == trip_id)
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
        return [self.transport_out(t) for t in rows]

    async def add_transport(
        self, trip_id: uuid.UUID, payload: TransportCreateRequest, user: User
    ) -> dict:
        trip = await self.trips.get_owned(trip_id, user)
        await self._validate_transport_stops(
            trip, payload.origin_stop_id, payload.destination_stop_id
        )
        self._validate_transport_window(
            trip, payload.departure_time, payload.arrival_time
        )

        transport = Transport(trip_id=trip_id, **payload.model_dump())
        self.db.add(transport)
        await self.db.commit()
        await self.db.refresh(transport, ["origin_stop", "destination_stop"])
        return self.transport_out(transport)

    async def get_owned_transport(
        self, transport_id: uuid.UUID, user: User
    ) -> Transport:
        transport = await self.db.scalar(
            select(Transport)
            .where(Transport.id == transport_id)
            .options(
                selectinload(Transport.trip),
                selectinload(Transport.origin_stop),
                selectinload(Transport.destination_stop),
            )
        )
        if (
            transport is None
            or transport.trip is None
            or transport.trip.deleted_at is not None
        ):
            raise NotFoundError("Transport")
        if transport.trip.user_id != user.id and not user.is_admin:
            raise ForbiddenError("You do not have access to this transport")
        return transport

    async def update_transport(
        self, transport_id: uuid.UUID, payload: TransportUpdateRequest, user: User
    ) -> dict:
        transport = await self.get_owned_transport(transport_id, user)
        changes = payload.model_dump(exclude_unset=True)

        departure = changes.get("departure_time", transport.departure_time)
        arrival = changes.get("arrival_time", transport.arrival_time)
        if departure >= arrival:
            raise ValidationError(
                "Arrival time must be later than departure time",
                details={"fields": {"arrival_time": "Must be after departure"}},
            )

        origin = changes.get("origin_stop_id", transport.origin_stop_id)
        destination = changes.get(
            "destination_stop_id", transport.destination_stop_id
        )
        if origin is not None and origin == destination:
            raise ValidationError(
                "Origin and destination stops must be different",
                details={
                    "fields": {"destination_stop_id": "Must differ from the origin"}
                },
            )

        await self._validate_transport_stops(transport.trip, origin, destination)
        self._validate_transport_window(transport.trip, departure, arrival)

        for field, value in changes.items():
            setattr(transport, field, value)

        await self.db.commit()
        await self.db.refresh(transport, ["origin_stop", "destination_stop"])
        return self.transport_out(transport)

    async def delete_transport(self, transport_id: uuid.UUID, user: User) -> None:
        transport = await self.get_owned_transport(transport_id, user)
        await self.db.delete(transport)
        await self.db.commit()

    # -- accommodation -----------------------------------------------------

    @staticmethod
    def accommodation_out(a: Accommodation) -> dict:
        return {
            "id": a.id,
            "stop_id": a.stop_id,
            "name": a.name,
            "address": a.address,
            "check_in": a.check_in,
            "check_out": a.check_out,
            "estimated_cost": a.estimated_cost,
            "booking_url": a.booking_url,
            "notes": a.notes,
            "nights": (a.check_out - a.check_in).days,
        }

    @staticmethod
    def _validate_stay_window(
        stop: TripStop, check_in: date, check_out: date
    ) -> None:
        """A stay must sit inside the stop it is attached to."""
        problems = {}
        if check_in < stop.arrival_date:
            problems["check_in"] = (
                f"Cannot be before arriving in {stop.city_name} "
                f"({stop.arrival_date.isoformat()})"
            )
        if check_out > stop.departure_date:
            problems["check_out"] = (
                f"Cannot be after leaving {stop.city_name} "
                f"({stop.departure_date.isoformat()})"
            )
        if problems:
            raise ValidationError(
                "The stay falls outside this stop's dates",
                details={"fields": problems},
            )

    async def list_accommodations(
        self, stop_id: uuid.UUID, user: User
    ) -> list[dict]:
        await self.itinerary.get_owned_stop(stop_id, user)
        rows = (
            (
                await self.db.execute(
                    select(Accommodation)
                    .where(Accommodation.stop_id == stop_id)
                    .order_by(Accommodation.check_in)
                )
            )
            .scalars()
            .all()
        )
        return [self.accommodation_out(a) for a in rows]

    async def add_accommodation(
        self, stop_id: uuid.UUID, payload: AccommodationCreateRequest, user: User
    ) -> dict:
        stop = await self.itinerary.get_owned_stop(stop_id, user)
        self._validate_stay_window(stop, payload.check_in, payload.check_out)

        accommodation = Accommodation(stop_id=stop_id, **payload.model_dump())
        self.db.add(accommodation)
        await self.db.commit()
        await self.db.refresh(accommodation)
        return self.accommodation_out(accommodation)

    async def get_owned_accommodation(
        self, accommodation_id: uuid.UUID, user: User
    ) -> Accommodation:
        row = await self.db.scalar(
            select(Accommodation)
            .where(Accommodation.id == accommodation_id)
            .options(selectinload(Accommodation.stop).selectinload(TripStop.trip))
        )
        if (
            row is None
            or row.stop is None
            or row.stop.trip is None
            or row.stop.trip.deleted_at is not None
        ):
            raise NotFoundError("Accommodation")
        if row.stop.trip.user_id != user.id and not user.is_admin:
            raise ForbiddenError("You do not have access to this accommodation")
        return row

    async def update_accommodation(
        self,
        accommodation_id: uuid.UUID,
        payload: AccommodationUpdateRequest,
        user: User,
    ) -> dict:
        row = await self.get_owned_accommodation(accommodation_id, user)
        changes = payload.model_dump(exclude_unset=True)

        check_in = changes.get("check_in", row.check_in)
        check_out = changes.get("check_out", row.check_out)
        if check_in > check_out:
            raise ValidationError(
                "Check-out cannot be earlier than check-in",
                details={"fields": {"check_out": "Must be on or after check-in"}},
            )
        self._validate_stay_window(row.stop, check_in, check_out)

        for field, value in changes.items():
            setattr(row, field, value)

        await self.db.commit()
        await self.db.refresh(row)
        return self.accommodation_out(row)

    async def delete_accommodation(
        self, accommodation_id: uuid.UUID, user: User
    ) -> None:
        row = await self.get_owned_accommodation(accommodation_id, user)
        await self.db.delete(row)
        await self.db.commit()

    # -- expenses (spec section 15) ---------------------------------------

    async def _validate_expense(
        self, trip: Trip, expense_date: date, stop_id: uuid.UUID | None
    ) -> None:
        earliest = trip.start_date - EXPENSE_DATE_GRACE
        latest = trip.end_date + EXPENSE_DATE_GRACE
        if not (earliest <= expense_date <= latest):
            raise ValidationError(
                "The expense date is outside the trip",
                details={
                    "fields": {
                        "date": (
                            f"Must be between {earliest.isoformat()} and "
                            f"{latest.isoformat()}"
                        )
                    }
                },
            )
        if stop_id is not None:
            stop = await self.db.get(TripStop, stop_id)
            if stop is None or stop.trip_id != trip.id:
                raise ValidationError(
                    "That stop does not belong to this trip",
                    details={"fields": {"stop_id": "Unknown stop for this trip"}},
                )

    async def list_expenses(
        self,
        trip_id: uuid.UUID,
        user: User,
        *,
        offset: int = 0,
        limit: int = 100,
        category=None,
    ) -> tuple[list[Expense], int, Decimal]:
        await self.trips.get_owned(trip_id, user)

        stmt = select(Expense).where(Expense.trip_id == trip_id)
        if category is not None:
            stmt = stmt.where(Expense.category == category)

        rows = (
            (
                await self.db.execute(
                    stmt.order_by(Expense.expense_date.desc(), Expense.created_at.desc())
                    .offset(offset)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )

        all_rows = (await self.db.execute(stmt)).scalars().all()
        total_amount = sum(
            (Decimal(str(e.amount)) for e in all_rows), Decimal("0")
        )
        return list(rows), len(all_rows), total_amount

    async def add_expense(
        self, trip_id: uuid.UUID, payload: ExpenseCreateRequest, user: User
    ) -> Expense:
        trip = await self.trips.get_owned(trip_id, user)
        await self._validate_expense(trip, payload.date, payload.stop_id)

        expense = Expense(
            trip_id=trip_id,
            stop_id=payload.stop_id,
            category=payload.category,
            title=payload.title,
            amount=payload.amount,
            expense_date=payload.date,
            notes=payload.notes,
        )
        self.db.add(expense)
        await self.db.commit()
        await self.db.refresh(expense)
        return expense

    async def get_owned_expense(self, expense_id: uuid.UUID, user: User) -> Expense:
        expense = await self.db.scalar(
            select(Expense)
            .where(Expense.id == expense_id)
            .options(selectinload(Expense.trip))
        )
        if (
            expense is None
            or expense.trip is None
            or expense.trip.deleted_at is not None
        ):
            raise NotFoundError("Expense")
        if expense.trip.user_id != user.id and not user.is_admin:
            raise ForbiddenError("You do not have access to this expense")
        return expense

    async def update_expense(
        self, expense_id: uuid.UUID, payload: ExpenseUpdateRequest, user: User
    ) -> Expense:
        expense = await self.get_owned_expense(expense_id, user)
        changes = payload.model_dump(exclude_unset=True)

        new_date = changes.pop("date", expense.expense_date)
        new_stop = changes.get("stop_id", expense.stop_id)
        await self._validate_expense(expense.trip, new_date, new_stop)

        expense.expense_date = new_date
        for field, value in changes.items():
            setattr(expense, field, value)

        await self.db.commit()
        await self.db.refresh(expense)
        return expense

    async def delete_expense(self, expense_id: uuid.UUID, user: User) -> None:
        expense = await self.get_owned_expense(expense_id, user)
        await self.db.delete(expense)
        await self.db.commit()
