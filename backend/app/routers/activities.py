"""Activity-catalog search and detail (spec section 12)."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends

from app.core import responses
from app.core.deps import DbSession, Pagination
from app.core.exceptions import NotFoundError
from app.repositories.destination_repository import ActivityRepository
from app.schemas.destination import ActivityCatalogResponse, ActivitySearchParams

router = APIRouter(prefix="/activities", tags=["activities"])


def _activity_out(activity) -> dict:
    payload = ActivityCatalogResponse.model_validate(activity).model_dump()
    if activity.destination is not None:
        payload["destination_name"] = activity.destination.name
        payload["country"] = activity.destination.country
    return payload


@router.get("/search", summary="Search activities")
async def search_activities(
    db: DbSession,
    page: Pagination,
    params: Annotated[ActivitySearchParams, Depends()],
    sort_by: Literal["rating", "cost", "title", "duration"] = "rating",
    sort_order: Literal["asc", "desc"] = "desc",
):
    """Spec section 12: ?city=goa&category=adventure&min_cost=0&max_cost=5000

    ``min_cost > max_cost`` is rejected by the params model rather than
    silently returning nothing.
    """
    rows, total = await ActivityRepository(db).search(
        offset=page.offset,
        limit=page.limit,
        q=params.q,
        city=params.city,
        destination_id=params.destination_id,
        category=params.category,
        min_cost=params.min_cost,
        max_cost=params.max_cost,
        max_duration_minutes=params.max_duration_minutes,
        min_rating=params.min_rating,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return responses.paginated(
        [_activity_out(a) for a in rows],
        page=page.page,
        limit=page.limit,
        total=total,
    )


@router.get("/{activity_id}", summary="Activity detail")
async def get_activity(activity_id: uuid.UUID, db: DbSession):
    activity = await ActivityRepository(db).get(activity_id)
    if activity is None:
        raise NotFoundError("Activity")
    return responses.success(_activity_out(activity), "OK")
