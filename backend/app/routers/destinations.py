"""Destination search and detail (spec sections 6, 12)."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from app.core import responses
from app.core.deps import DbSession, Pagination
from app.core.exceptions import NotFoundError
from app.repositories.destination_repository import (
    ActivityRepository,
    DestinationRepository,
)
from app.schemas.destination import (
    ActivityCatalogResponse,
    DestinationDetail,
    DestinationSearchParams,
    DestinationSummary,
)

router = APIRouter(prefix="/destinations", tags=["destinations"])


def _activity_out(activity) -> dict:
    payload = ActivityCatalogResponse.model_validate(activity).model_dump()
    if activity.destination is not None:
        payload["destination_name"] = activity.destination.name
        payload["country"] = activity.destination.country
    return payload


@router.get("/search", summary="Search destinations")
async def search_destinations(
    db: DbSession,
    page: Pagination,
    params: Annotated[DestinationSearchParams, Depends()],
    sort_by: Literal["popularity", "name", "cost_index"] = "popularity",
    sort_order: Literal["asc", "desc"] = "desc",
):
    """Public on purpose: the landing page shows destinations before sign-in."""
    repo = DestinationRepository(db)
    rows, total = await repo.search(
        offset=page.offset,
        limit=page.limit,
        q=params.q,
        country=params.country,
        region=params.region,
        max_cost_index=params.max_cost_index,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    counts = await repo.activity_counts([d.id for d in rows])
    items = []
    for dest in rows:
        payload = DestinationSummary.model_validate(dest).model_dump()
        payload["activity_count"] = counts.get(dest.id, 0)
        items.append(payload)

    return responses.paginated(
        items, page=page.page, limit=page.limit, total=total
    )


@router.get("/regions", summary="Destinations grouped by region")
async def list_regions(db: DbSession):
    """Backs the landing page's regional selections (spec section 6)."""
    return responses.success(
        {"regions": await DestinationRepository(db).regions()}, "OK"
    )


@router.get("/{destination_id}", summary="Destination detail")
async def get_destination(destination_id: uuid.UUID, db: DbSession):
    repo = DestinationRepository(db)
    dest = await repo.get(destination_id)
    if dest is None:
        raise NotFoundError("Destination")

    activities = await ActivityRepository(db).top_for_destination(dest.id, limit=8)
    counts = await repo.activity_counts([dest.id])

    payload = DestinationDetail.model_validate(dest).model_dump()
    payload["activity_count"] = counts.get(dest.id, 0)
    payload["top_activities"] = [
        ActivityCatalogResponse.model_validate(a).model_dump() for a in activities
    ]
    return responses.success(payload, "OK")


@router.get(
    "/{destination_id}/activities",
    summary="Activities available at a destination",
)
async def destination_activities(
    destination_id: uuid.UUID,
    db: DbSession,
    page: Pagination,
):
    """Spec section 7: the suggestions shown while creating a trip.

    Dynamic, database-backed data -- this is the core requirement, distinct
    from the scored suggestions in section 37.
    """
    if await DestinationRepository(db).get(destination_id) is None:
        raise NotFoundError("Destination")

    rows, total = await ActivityRepository(db).search(
        offset=page.offset, limit=page.limit, destination_id=destination_id
    )
    return responses.paginated(
        [_activity_out(a) for a in rows],
        page=page.page,
        limit=page.limit,
        total=total,
    )
