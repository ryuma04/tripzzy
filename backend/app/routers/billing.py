"""Bill split endpoints.

Splits hang off a trip for creation and listing, but are addressed directly
once they exist -- a member who is not the trip owner still needs to read and
settle their own share, and cannot reach it through ``/trips/{id}``.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Path

from app.core import responses
from app.core.deps import CurrentUser, DbSession, Pagination
from app.schemas.billing import (
    BillSplitCreateRequest,
    BillSplitResponse,
    MemberStatusUpdateRequest,
)
from app.services.bill_split_service import BillSplitService

trip_splits_router = APIRouter(prefix="/trips", tags=["bill-splits"])
splits_router = APIRouter(prefix="/bill-splits", tags=["bill-splits"])


@trip_splits_router.post(
    "/{trip_id}/bill-splits", summary="Split a trip's bill", status_code=201
)
async def create_bill_split(
    trip_id: Annotated[uuid.UUID, Path()],
    payload: BillSplitCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Divide a trip's spend among its travellers.

    ``total_amount`` may be omitted, in which case the trip's recorded
    expenses are used.
    """
    split = await BillSplitService(db).create(trip_id, payload, current_user)
    return responses.success(
        BillSplitResponse(**split).model_dump(),
        "Bill split created",
        status_code=201,
    )


@trip_splits_router.get("/{trip_id}/bill-splits", summary="Splits for a trip")
async def list_trip_bill_splits(
    trip_id: Annotated[uuid.UUID, Path()],
    current_user: CurrentUser,
    db: DbSession,
):
    splits = await BillSplitService(db).list_for_trip(trip_id, current_user)
    return responses.success(
        [BillSplitResponse(**s).model_dump() for s in splits],
        "Bill splits fetched",
    )


@splits_router.get("", summary="Every split you are part of")
async def list_my_bill_splits(
    current_user: CurrentUser,
    db: DbSession,
    pagination: Pagination,
):
    items, total = await BillSplitService(db).list_for_user(
        current_user, offset=pagination.offset, limit=pagination.limit
    )
    return responses.paginated(
        [BillSplitResponse(**s).model_dump() for s in items],
        page=pagination.page,
        limit=pagination.limit,
        total=total,
    )


@splits_router.get("/{split_id}", summary="Bill split detail")
async def get_bill_split(
    split_id: Annotated[uuid.UUID, Path()],
    current_user: CurrentUser,
    db: DbSession,
):
    split = await BillSplitService(db).get(split_id, current_user)
    return responses.success(
        BillSplitResponse(**split).model_dump(), "Bill split fetched"
    )


@splits_router.put(
    "/{split_id}/members/{member_id}", summary="Update one member's status"
)
async def update_member_status(
    split_id: Annotated[uuid.UUID, Path()],
    member_id: Annotated[uuid.UUID, Path()],
    payload: MemberStatusUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Mark a share paid or outstanding.

    The split flips to ``settled`` automatically once no member is left owing.
    """
    split = await BillSplitService(db).set_member_status(
        split_id, member_id, payload.status, current_user
    )
    return responses.success(
        BillSplitResponse(**split).model_dump(), "Member status updated"
    )


@splits_router.delete("/{split_id}", summary="Delete a bill split")
async def delete_bill_split(
    split_id: Annotated[uuid.UUID, Path()],
    current_user: CurrentUser,
    db: DbSession,
):
    await BillSplitService(db).delete(split_id, current_user)
    return responses.success(None, "Bill split deleted")
