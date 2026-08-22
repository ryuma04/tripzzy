"""Community feed and public share links (spec sections 16, 35)."""

from typing import Annotated, Literal

from fastapi import APIRouter, Query

from app.core import responses
from app.core.deps import CurrentUser, DbSession, OptionalUser, Pagination
from app.schemas.trip import CloneRequest, TripDetail
from app.services.community_service import CommunityService
from app.services.trip_service import TripService

community_router = APIRouter(prefix="/community", tags=["community"])
public_router = APIRouter(prefix="/public", tags=["public"])


@community_router.get("/trips", summary="Browse publicly shared trips")
async def list_community_trips(
    db: DbSession,
    page: Pagination,
    q: Annotated[str | None, Query(max_length=100)] = None,
    sort_by: Literal["updated_at", "created_at", "start_date", "budget", "title"] = "updated_at",
    sort_order: Literal["asc", "desc"] = "desc",
):
    """Public: browsing the community does not require an account."""
    items, total = await CommunityService(db).list_community(
        offset=page.offset,
        limit=page.limit,
        q=q,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return responses.paginated(
        items, page=page.page, limit=page.limit, total=total
    )


@public_router.get("/trips/{share_slug}", summary="View a shared trip")
async def get_public_trip(
    share_slug: str, db: DbSession, current_user: OptionalUser
):
    """No authentication required (spec section 16).

    When the caller *is* signed in, the response also says whether they may
    clone it -- so the UI can show the right action without a second request.
    """
    data = await CommunityService(db).public_trip(share_slug)
    data["viewer"] = {
        "is_authenticated": current_user is not None,
        "is_owner": (
            current_user is not None
            and data.get("owner")
            and str(current_user.id) == data["owner"]["id"]
        ),
    }
    data["viewer"]["can_clone"] = (
        current_user is not None and not data["viewer"]["is_owner"]
    )
    return responses.success(data, "OK")


@public_router.post(
    "/trips/{share_slug}/clone",
    summary="Clone a shared trip into your account",
    status_code=201,
)
async def clone_public_trip(
    share_slug: str,
    payload: CloneRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Produces an independent copy (spec section 16)."""
    clone = await CommunityService(db).clone(share_slug, payload, current_user)

    detail = await TripService(db).detail(clone.id, current_user)
    return responses.success(
        TripDetail(**detail).model_dump(),
        "Trip cloned successfully",
        status_code=201,
    )
