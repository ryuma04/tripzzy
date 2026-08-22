"""Admin dashboard and analytics (spec sections 18, 36).

Every method here is reached only through the ``require_admin`` dependency,
which enforces authentication *and* ``role == admin`` (spec section 18).
"""

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.models import (
    ActivityCatalog,
    Destination,
    Expense,
    ItineraryActivity,
    Trip,
    TripStop,
    User,
)
from app.models.enums import TripStatus, UserRole, UserStatus
from app.services.trip_service import compute_status


class AdminService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def dashboard(self) -> dict:
        """Headline counters for the admin landing screen."""
        now = datetime.now(timezone.utc)
        last_30 = now - timedelta(days=30)

        total_users = await self.db.scalar(select(func.count()).select_from(User))
        active_users = await self.db.scalar(
            select(func.count())
            .select_from(User)
            .where(User.status == UserStatus.ACTIVE)
        )
        new_users = await self.db.scalar(
            select(func.count()).select_from(User).where(User.created_at >= last_30)
        )

        alive = Trip.deleted_at.is_(None)
        total_trips = await self.db.scalar(
            select(func.count()).select_from(Trip).where(alive)
        )
        new_trips = await self.db.scalar(
            select(func.count())
            .select_from(Trip)
            .where(alive, Trip.created_at >= last_30)
        )
        public_trips = await self.db.scalar(
            select(func.count())
            .select_from(Trip)
            .where(alive, Trip.is_public.is_(True))
        )
        cloned_trips = await self.db.scalar(
            select(func.count())
            .select_from(Trip)
            .where(alive, Trip.cloned_from_trip_id.is_not(None))
        )

        total_stops = await self.db.scalar(
            select(func.count()).select_from(TripStop)
        )
        total_activities = await self.db.scalar(
            select(func.count()).select_from(ItineraryActivity)
        )
        total_destinations = await self.db.scalar(
            select(func.count()).select_from(Destination)
        )
        catalog_activities = await self.db.scalar(
            select(func.count()).select_from(ActivityCatalog)
        )

        avg_budget = await self.db.scalar(
            select(func.coalesce(func.avg(Trip.budget), 0)).where(alive)
        )
        total_expenses = await self.db.scalar(
            select(func.coalesce(func.sum(Expense.amount), 0))
        )

        # Status is derived, so it has to be recomputed rather than counted
        # off the stored column (refinement R3).
        rows = (
            await self.db.execute(
                select(Trip, func.count(TripStop.id))
                .outerjoin(TripStop, TripStop.trip_id == Trip.id)
                .where(alive)
                .group_by(Trip.id)
            )
        ).all()
        by_status = {s.value: 0 for s in TripStatus}
        today = date.today()
        for trip, stop_count in rows:
            by_status[compute_status(trip, stop_count, today).value] += 1

        return {
            "users": {
                "total": total_users,
                "active": active_users,
                "new_last_30_days": new_users,
            },
            "trips": {
                "total": total_trips,
                "new_last_30_days": new_trips,
                "public": public_trips,
                "cloned": cloned_trips,
                "by_status": by_status,
            },
            "content": {
                "destinations": total_destinations,
                "catalog_activities": catalog_activities,
                "trip_stops": total_stops,
                "scheduled_activities": total_activities,
            },
            "money": {
                "average_trip_budget": Decimal(str(avg_budget)).quantize(
                    Decimal("0.01")
                ),
                "total_recorded_expenses": Decimal(str(total_expenses)),
            },
        }

    async def get_user(self, user_id: uuid.UUID) -> dict:
        user = await self.db.get(User, user_id)
        if user is None:
            raise NotFoundError("User")

        trip_count = await self.db.scalar(
            select(func.count())
            .select_from(Trip)
            .where(Trip.user_id == user_id, Trip.deleted_at.is_(None))
        )
        public_count = await self.db.scalar(
            select(func.count())
            .select_from(Trip)
            .where(
                Trip.user_id == user_id,
                Trip.deleted_at.is_(None),
                Trip.is_public.is_(True),
            )
        )

        return {
            "id": user.id,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "email": user.email,
            "phone": user.phone,
            "city": user.city,
            "country": user.country,
            "role": user.role,
            "status": user.status,
            "is_email_verified": user.is_email_verified,
            "created_at": user.created_at,
            "trip_count": trip_count,
            "public_trip_count": public_count,
        }

    async def set_user_status(
        self, user_id: uuid.UUID, status: UserStatus, actor: User
    ) -> User:
        user = await self.db.get(User, user_id)
        if user is None:
            raise NotFoundError("User")

        # An admin locking themselves out would need database access to undo.
        if user.id == actor.id:
            raise ValidationError("You cannot change your own account status")

        # Guard against removing the last way into the admin panel.
        if user.role == UserRole.ADMIN and status != UserStatus.ACTIVE:
            remaining = await self.db.scalar(
                select(func.count())
                .select_from(User)
                .where(
                    User.role == UserRole.ADMIN,
                    User.status == UserStatus.ACTIVE,
                    User.id != user.id,
                )
            )
            if not remaining:
                raise ValidationError(
                    "This is the last active administrator and cannot be disabled"
                )

        user.status = status
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def list_trips(
        self,
        *,
        offset: int,
        limit: int,
        q: str | None = None,
        status: TripStatus | None = None,
    ) -> tuple[list[dict], int]:
        """Every user's trips, for moderation."""
        stmt = select(Trip, User).join(User, Trip.user_id == User.id).where(
            Trip.deleted_at.is_(None)
        )
        count_stmt = (
            select(func.count())
            .select_from(Trip)
            .where(Trip.deleted_at.is_(None))
        )

        if q:
            pattern = f"%{q.strip().lower()}%"
            stmt = stmt.where(func.lower(Trip.title).like(pattern))
            count_stmt = count_stmt.where(func.lower(Trip.title).like(pattern))
        if status is not None:
            stmt = stmt.where(Trip.status == status)
            count_stmt = count_stmt.where(Trip.status == status)

        total = (await self.db.execute(count_stmt)).scalar_one()
        rows = (
            await self.db.execute(
                stmt.order_by(Trip.created_at.desc()).offset(offset).limit(limit)
            )
        ).all()

        return (
            [
                {
                    "id": trip.id,
                    "title": trip.title,
                    "start_date": trip.start_date,
                    "end_date": trip.end_date,
                    "budget": trip.budget,
                    "currency": trip.currency,
                    "status": trip.status,
                    "is_public": trip.is_public,
                    "created_at": trip.created_at,
                    "owner_id": user.id,
                    "owner_name": f"{user.first_name} {user.last_name}",
                    "owner_email": user.email,
                }
                for trip, user in rows
            ],
            total,
        )

    # -- analytics (spec section 18) --------------------------------------

    async def trip_analytics(self, months: int = 12) -> dict:
        """Trips created per month, plus budget distribution."""
        since = date.today().replace(day=1) - timedelta(days=31 * months)

        rows = (
            await self.db.execute(
                select(
                    func.date_trunc("month", Trip.created_at).label("month"),
                    func.count(Trip.id),
                    func.coalesce(func.avg(Trip.budget), 0),
                )
                .where(Trip.deleted_at.is_(None), Trip.created_at >= since)
                .group_by("month")
                .order_by("month")
            )
        ).all()

        buckets = [
            ("under_10k", None, 10000),
            ("10k_to_25k", 10000, 25000),
            ("25k_to_50k", 25000, 50000),
            ("50k_to_100k", 50000, 100000),
            ("over_100k", 100000, None),
        ]
        distribution = []
        for label, low, high in buckets:
            stmt = select(func.count()).select_from(Trip).where(
                Trip.deleted_at.is_(None)
            )
            if low is not None:
                stmt = stmt.where(Trip.budget >= low)
            if high is not None:
                stmt = stmt.where(Trip.budget < high)
            distribution.append(
                {"bucket": label, "count": await self.db.scalar(stmt)}
            )

        # In PostgreSQL, date - date is already an integer day count, not an
        # interval, so extract() would fail here.
        avg_duration = await self.db.scalar(
            select(
                func.coalesce(
                    func.avg(Trip.end_date - Trip.start_date + 1), 0
                )
            ).where(Trip.deleted_at.is_(None))
        )

        return {
            "trips_per_month": [
                {
                    "month": month.date().isoformat() if month else None,
                    "count": count,
                    "average_budget": Decimal(str(avg)).quantize(Decimal("0.01")),
                }
                for month, count, avg in rows
            ],
            "budget_distribution": distribution,
            "average_duration_days": round(float(avg_duration), 1),
        }

    async def destination_analytics(self, limit: int = 20) -> dict:
        """Which destinations people actually put in their trips.

        Counts real ``trip_stops`` rather than the catalog's own popularity
        score, so this reflects behaviour rather than seed data.
        """
        rows = (
            await self.db.execute(
                select(
                    TripStop.city_name,
                    func.count(TripStop.id).label("uses"),
                    func.count(func.distinct(TripStop.trip_id)),
                )
                .group_by(TripStop.city_name)
                .order_by(func.count(TripStop.id).desc())
                .limit(limit)
            )
        ).all()

        unused = (
            (
                await self.db.execute(
                    select(Destination.name, Destination.country)
                    .outerjoin(
                        TripStop, TripStop.destination_id == Destination.id
                    )
                    .where(TripStop.id.is_(None))
                    .limit(limit)
                )
            )
            .all()
        )

        return {
            "most_visited": [
                {"city_name": city, "stop_count": uses, "trip_count": trips}
                for city, uses, trips in rows
            ],
            "never_used": [
                {"name": name, "country": country} for name, country in unused
            ],
        }

    async def activity_analytics(self, limit: int = 20) -> dict:
        by_category = (
            await self.db.execute(
                select(
                    ItineraryActivity.category,
                    func.count(ItineraryActivity.id),
                    func.coalesce(func.avg(ItineraryActivity.estimated_cost), 0),
                ).group_by(ItineraryActivity.category)
            )
        ).all()

        popular = (
            await self.db.execute(
                select(
                    ItineraryActivity.title,
                    func.count(ItineraryActivity.id).label("uses"),
                )
                .group_by(ItineraryActivity.title)
                .order_by(func.count(ItineraryActivity.id).desc())
                .limit(limit)
            )
        ).all()

        return {
            "by_category": [
                {
                    "category": category.value,
                    "count": count,
                    "average_cost": Decimal(str(avg)).quantize(Decimal("0.01")),
                }
                for category, count, avg in by_category
            ],
            "most_scheduled": [
                {"title": title, "count": count} for title, count in popular
            ],
        }
