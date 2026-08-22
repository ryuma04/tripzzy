"""Query layer for trips."""

import uuid
from decimal import Decimal

from sqlalchemy import Select, case, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import ItineraryActivity, Trip, TripStop
from app.models.enums import TripStatus


def status_expression():
    """Compute a trip's status in SQL (spec section 10, refinement R3).

    The stored ``trips.status`` column is only a cache, refreshed when a trip
    is read. Filtering on it directly is wrong: a trip whose dates have since
    passed, or which just gained its first stop, still carries a stale value
    until something reads it. Deriving the status in the query instead means
    ``?status=upcoming`` is always correct without a write.
    """
    stop_count = (
        select(func.count(TripStop.id))
        .where(TripStop.trip_id == Trip.id)
        .correlate(Trip)
        .scalar_subquery()
    )
    return case(
        (stop_count == 0, literal(TripStatus.DRAFT.value)),
        (func.current_date() < Trip.start_date, literal(TripStatus.UPCOMING.value)),
        (func.current_date() > Trip.end_date, literal(TripStatus.COMPLETED.value)),
        else_=literal(TripStatus.ONGOING.value),
    )

# Allowlist -- a client-supplied string is never interpolated into ORDER BY.
SORTABLE = {
    "created_at": Trip.created_at,
    "updated_at": Trip.updated_at,
    "start_date": Trip.start_date,
    "end_date": Trip.end_date,
    "title": Trip.title,
    "budget": Trip.budget,
}


class TripRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    @staticmethod
    def _alive(stmt: Select) -> Select:
        """Soft-deleted trips are invisible everywhere (refinement R8)."""
        return stmt.where(Trip.deleted_at.is_(None))

    async def get(self, trip_id: uuid.UUID) -> Trip | None:
        return await self.db.scalar(
            self._alive(select(Trip).where(Trip.id == trip_id))
        )

    async def get_with_stops(self, trip_id: uuid.UUID) -> Trip | None:
        return await self.db.scalar(
            self._alive(
                select(Trip)
                .where(Trip.id == trip_id)
                .options(selectinload(Trip.stops).selectinload(TripStop.activities))
            )
        )

    async def get_by_slug(self, slug: str) -> Trip | None:
        return await self.db.scalar(
            self._alive(
                select(Trip).where(
                    Trip.share_slug == slug, Trip.is_public.is_(True)
                )
            )
        )

    async def slug_exists(self, slug: str) -> bool:
        found = await self.db.scalar(select(Trip.id).where(Trip.share_slug == slug))
        return found is not None

    async def list_for_user(
        self,
        user_id: uuid.UUID,
        *,
        offset: int,
        limit: int,
        status: TripStatus | None = None,
        q: str | None = None,
        sort_by: str = "start_date",
        sort_order: str = "desc",
    ) -> tuple[list[Trip], int]:
        stmt = self._alive(select(Trip).where(Trip.user_id == user_id))
        count_stmt = self._alive(
            select(func.count()).select_from(Trip).where(Trip.user_id == user_id)
        )

        if status is not None:
            # Derived in SQL, never read from the cached column.
            condition = status_expression() == status.value
            stmt = stmt.where(condition)
            count_stmt = count_stmt.where(condition)

        if q:
            pattern = f"%{q.strip().lower()}%"
            condition = or_(
                func.lower(Trip.title).like(pattern),
                func.lower(func.coalesce(Trip.description, "")).like(pattern),
            )
            stmt = stmt.where(condition)
            count_stmt = count_stmt.where(condition)

        column = SORTABLE.get(sort_by, Trip.start_date)
        stmt = stmt.order_by(
            column.desc() if sort_order == "desc" else column.asc()
        )

        total = (await self.db.execute(count_stmt)).scalar_one()
        rows = (
            (await self.db.execute(stmt.offset(offset).limit(limit)))
            .scalars()
            .all()
        )
        return list(rows), total

    async def list_public(
        self,
        *,
        offset: int,
        limit: int,
        q: str | None = None,
        sort_by: str = "updated_at",
        sort_order: str = "desc",
    ) -> tuple[list[Trip], int]:
        """The community feed (spec section 16)."""
        stmt = self._alive(
            select(Trip)
            .where(Trip.is_public.is_(True))
            .options(selectinload(Trip.user))
        )
        count_stmt = self._alive(
            select(func.count())
            .select_from(Trip)
            .where(Trip.is_public.is_(True))
        )

        if q:
            pattern = f"%{q.strip().lower()}%"
            condition = or_(
                func.lower(Trip.title).like(pattern),
                func.lower(func.coalesce(Trip.description, "")).like(pattern),
            )
            stmt = stmt.where(condition)
            count_stmt = count_stmt.where(condition)

        column = SORTABLE.get(sort_by, Trip.updated_at)
        stmt = stmt.order_by(
            column.desc() if sort_order == "desc" else column.asc()
        )

        total = (await self.db.execute(count_stmt)).scalar_one()
        rows = (
            (await self.db.execute(stmt.offset(offset).limit(limit)))
            .scalars()
            .all()
        )
        return list(rows), total

    async def stats_for(
        self, trip_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, dict]:
        """Stop count, activity count and planned cost, in two queries.

        Batched deliberately: doing this per trip inside a list endpoint would
        be a textbook N+1.
        """
        if not trip_ids:
            return {}

        stop_rows = (
            await self.db.execute(
                select(TripStop.trip_id, func.count(TripStop.id))
                .where(TripStop.trip_id.in_(trip_ids))
                .group_by(TripStop.trip_id)
            )
        ).all()

        activity_rows = (
            await self.db.execute(
                select(
                    TripStop.trip_id,
                    func.count(ItineraryActivity.id),
                    func.coalesce(func.sum(ItineraryActivity.estimated_cost), 0),
                )
                .join(ItineraryActivity, ItineraryActivity.stop_id == TripStop.id)
                .where(TripStop.trip_id.in_(trip_ids))
                .group_by(TripStop.trip_id)
            )
        ).all()

        stats: dict[uuid.UUID, dict] = {
            tid: {"stop_count": 0, "activity_count": 0, "estimated_cost": Decimal("0")}
            for tid in trip_ids
        }
        for trip_id, count in stop_rows:
            stats[trip_id]["stop_count"] = count
        for trip_id, count, cost in activity_rows:
            stats[trip_id]["activity_count"] = count
            stats[trip_id]["estimated_cost"] = Decimal(str(cost))
        return stats

    async def cities_for(self, trip_id: uuid.UUID) -> list[str]:
        rows = (
            await self.db.execute(
                select(TripStop.city_name)
                .where(TripStop.trip_id == trip_id)
                .order_by(TripStop.order_index)
            )
        ).scalars().all()
        return list(rows)
