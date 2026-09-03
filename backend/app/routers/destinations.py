"""Destination search and detail (spec sections 6, 12)."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.core import responses
from app.core.deps import CurrentUser, DbSession, Pagination
from app.core.exceptions import NotFoundError
from app.models import Destination, SavedDestination
from app.repositories.destination_repository import (
    ActivityRepository,
    DestinationRepository,
)
from app.schemas.destination import (
    ActivityCatalogResponse,
    DestinationDetail,
    DestinationFromPlaceRequest,
    DestinationSearchParams,
    DestinationSummary,
)

router = APIRouter(prefix="/destinations", tags=["destinations"])


@router.get("/saved", summary="List your saved destinations")
async def list_saved_destinations(current_user: CurrentUser, db: DbSession):
    """Retrieve all destinations bookmarked by the authenticated user."""
    stmt = (
        select(Destination)
        .join(SavedDestination, SavedDestination.destination_id == Destination.id)
        .where(SavedDestination.user_id == current_user.id)
        .order_by(SavedDestination.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    repo = DestinationRepository(db)
    counts = await repo.activity_counts([d.id for d in rows])
    items = []
    for dest in rows:
        payload = DestinationSummary.model_validate(dest).model_dump()
        payload["activity_count"] = counts.get(dest.id, 0)
        items.append(payload)
    return responses.success({"items": items, "count": len(items)}, "OK")


@router.post("/from-place", summary="Register or find destination from Google Place")
async def find_or_create_destination_from_place(
    payload: DestinationFromPlaceRequest,
    db: DbSession,
):
    """Finds an existing destination or dynamically creates a new one from a Google Place."""
    repo = DestinationRepository(db)
    dest = await repo.find_or_create(
        name=payload.name,
        country=payload.country,
        region=payload.region,
        description=payload.description,
        latitude=payload.latitude,
        longitude=payload.longitude,
        image_url=payload.image_url,
    )
    return responses.success(
        DestinationSummary.model_validate(dest).model_dump(),
        "Destination resolved successfully",
    )



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


@router.post("/{destination_id}/save", summary="Bookmark a destination")
async def save_destination(
    destination_id: uuid.UUID, current_user: CurrentUser, db: DbSession
):
    """Bookmark a destination to personal saved list."""
    dest = await DestinationRepository(db).get(destination_id)
    if dest is None:
        raise NotFoundError("Destination")

    existing = await db.get(SavedDestination, (current_user.id, destination_id))
    if existing is None:
        saved = SavedDestination(user_id=current_user.id, destination_id=destination_id)
        db.add(saved)
        await db.commit()

    return responses.success(
        {"saved": True, "destination_id": str(destination_id)},
        "Destination bookmarked",
    )


@router.delete("/{destination_id}/save", summary="Remove bookmark from a destination")
async def unsave_destination(
    destination_id: uuid.UUID, current_user: CurrentUser, db: DbSession
):
    """Remove a destination from personal bookmarks."""
    existing = await db.get(SavedDestination, (current_user.id, destination_id))
    if existing is not None:
        await db.delete(existing)
        await db.commit()

    return responses.success(
        {"saved": False, "destination_id": str(destination_id)},
        "Bookmark removed",
    )
