"""Search over the destination and activity catalog (spec sections 6, 12).

Everything here reads PostgreSQL. The seed JSON is only ever a loader input,
never a runtime data source (spec sections 2.1 and 38).
"""

import uuid
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import ActivityCatalog, Destination
from app.models.enums import ActivityCategory

DESTINATION_SORTABLE = {
    "popularity": Destination.popularity_score,
    "name": Destination.name,
    "cost_index": Destination.cost_index,
}

ACTIVITY_SORTABLE = {
    "rating": ActivityCatalog.rating,
    "cost": ActivityCatalog.estimated_cost,
    "title": ActivityCatalog.title,
    "duration": ActivityCatalog.duration_minutes,
}


def escape_like(value: str) -> str:
    """Neutralise LIKE wildcards so a user searching for '100%' gets '100%'."""
    return (
        value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    )


class DestinationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get(self, destination_id: uuid.UUID) -> Destination | None:
        return await self.db.get(Destination, destination_id)

    async def search(
        self,
        *,
        offset: int,
        limit: int,
        q: str | None = None,
        country: str | None = None,
        region: str | None = None,
        max_cost_index: int | None = None,
        sort_by: str = "popularity",
        sort_order: str = "desc",
    ) -> tuple[list[Destination], int]:
        stmt = select(Destination)
        count_stmt = select(func.count()).select_from(Destination)

        conditions = []
        if q:
            pattern = f"%{escape_like(q.strip().lower())}%"
            conditions.append(
                or_(
                    func.lower(Destination.name).like(pattern, escape="\\"),
                    func.lower(Destination.country).like(pattern, escape="\\"),
                    func.lower(func.coalesce(Destination.region, "")).like(
                        pattern, escape="\\"
                    ),
                )
            )
        if country:
            conditions.append(
                func.lower(Destination.country) == country.strip().lower()
            )
        if region:
            conditions.append(
                func.lower(func.coalesce(Destination.region, ""))
                == region.strip().lower()
            )
        if max_cost_index is not None:
            conditions.append(Destination.cost_index <= max_cost_index)

        for c in conditions:
            stmt = stmt.where(c)
            count_stmt = count_stmt.where(c)

        column = DESTINATION_SORTABLE.get(sort_by, Destination.popularity_score)
        stmt = stmt.order_by(
            column.desc() if sort_order == "desc" else column.asc(),
            Destination.name.asc(),
        )

        total = (await self.db.execute(count_stmt)).scalar_one()
        rows = (
            (await self.db.execute(stmt.offset(offset).limit(limit)))
            .scalars()
            .all()
        )
        return list(rows), total

    async def regions(self) -> list[dict]:
        """Powers the landing page's regional selections (spec section 6)."""
        rows = (
            await self.db.execute(
                select(
                    Destination.region,
                    func.count(Destination.id),
                )
                .where(Destination.region.is_not(None))
                .group_by(Destination.region)
                .order_by(func.count(Destination.id).desc())
            )
        ).all()
        return [{"region": r, "destination_count": c} for r, c in rows]

    async def activity_counts(
        self, destination_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, int]:
        if not destination_ids:
            return {}
        rows = (
            await self.db.execute(
                select(
                    ActivityCatalog.destination_id, func.count(ActivityCatalog.id)
                )
                .where(
                    ActivityCatalog.destination_id.in_(destination_ids),
                    ActivityCatalog.is_active.is_(True),
                )
                .group_by(ActivityCatalog.destination_id)
            )
        ).all()
        return {dest_id: count for dest_id, count in rows}


class ActivityRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get(self, activity_id: uuid.UUID) -> ActivityCatalog | None:
        return await self.db.scalar(
            select(ActivityCatalog)
            .where(ActivityCatalog.id == activity_id)
            .options(selectinload(ActivityCatalog.destination))
        )

    async def search(
        self,
        *,
        offset: int,
        limit: int,
        q: str | None = None,
        city: str | None = None,
        destination_id: uuid.UUID | None = None,
        category: ActivityCategory | None = None,
        min_cost: Decimal | None = None,
        max_cost: Decimal | None = None,
        max_duration_minutes: int | None = None,
        min_rating: Decimal | None = None,
        sort_by: str = "rating",
        sort_order: str = "desc",
    ) -> tuple[list[ActivityCatalog], int]:
        stmt = (
            select(ActivityCatalog)
            .join(Destination, ActivityCatalog.destination_id == Destination.id)
            .options(selectinload(ActivityCatalog.destination))
        )
        count_stmt = (
            select(func.count())
            .select_from(ActivityCatalog)
            .join(Destination, ActivityCatalog.destination_id == Destination.id)
        )

        conditions = [ActivityCatalog.is_active.is_(True)]

        if q:
            pattern = f"%{escape_like(q.strip().lower())}%"
            conditions.append(
                or_(
                    func.lower(ActivityCatalog.title).like(pattern, escape="\\"),
                    func.lower(
                        func.coalesce(ActivityCatalog.description, "")
                    ).like(pattern, escape="\\"),
                )
            )
        if city:
            # "city" in the spec's example query is the destination name.
            conditions.append(func.lower(Destination.name) == city.strip().lower())
        if destination_id is not None:
            conditions.append(ActivityCatalog.destination_id == destination_id)
        if category is not None:
            conditions.append(ActivityCatalog.category == category)
        if min_cost is not None:
            conditions.append(ActivityCatalog.estimated_cost >= min_cost)
        if max_cost is not None:
            conditions.append(ActivityCatalog.estimated_cost <= max_cost)
        if max_duration_minutes is not None:
            conditions.append(
                or_(
                    ActivityCatalog.duration_minutes.is_(None),
                    ActivityCatalog.duration_minutes <= max_duration_minutes,
                )
            )
        if min_rating is not None:
            conditions.append(ActivityCatalog.rating >= min_rating)

        for c in conditions:
            stmt = stmt.where(c)
            count_stmt = count_stmt.where(c)

        column = ACTIVITY_SORTABLE.get(sort_by, ActivityCatalog.rating)
        order = (
            column.desc().nullslast()
            if sort_order == "desc"
            else column.asc().nullsfirst()
        )
        stmt = stmt.order_by(order, ActivityCatalog.title.asc())

        total = (await self.db.execute(count_stmt)).scalar_one()
        rows = (
            (await self.db.execute(stmt.offset(offset).limit(limit)))
            .scalars()
            .all()
        )
        return list(rows), total

    async def top_for_destination(
        self, destination_id: uuid.UUID, limit: int = 5
    ) -> list[ActivityCatalog]:
        rows = (
            (
                await self.db.execute(
                    select(ActivityCatalog)
                    .where(
                        ActivityCatalog.destination_id == destination_id,
                        ActivityCatalog.is_active.is_(True),
                    )
                    .order_by(ActivityCatalog.rating.desc().nullslast())
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        return list(rows)
