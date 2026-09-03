"""Assist conversations and reviews, from the traveller's side.

Opening a thread hangs off a trip, because every useful answer depends on trip
context. Reviews address their subject directly — a vendor is rated as a
vendor, not as a footnote to whichever trip happened to include it.

The operator's half of assist lives in ``routers/operator.py``, scoped to the
caller's own operator.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Path, Query

from app.core import responses
from app.core.deps import CurrentUser, DbSession, Pagination
from app.models.enums import ReviewSubject
from app.schemas.engagement import (
    AssistThreadResponse,
    MessageRequest,
    ReviewCreateRequest,
    ReviewResponse,
    ReviewUpdateRequest,
    ReviewableItem,
    ThreadOpenRequest,
)
from app.services.assist_service import AssistService
from app.services.review_service import ReviewService

trip_assist_router = APIRouter(prefix="/trips", tags=["assist"])
assist_router = APIRouter(prefix="/assist", tags=["assist"])
reviews_router = APIRouter(prefix="/reviews", tags=["reviews"])


# --------------------------------------------------------------------------
# Assist
# --------------------------------------------------------------------------

@trip_assist_router.post(
    "/{trip_id}/assist", summary="Ask for help on a trip", status_code=201
)
async def open_thread(
    trip_id: Annotated[uuid.UUID, Path()],
    payload: ThreadOpenRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Start a conversation with the people running your tour.

    It is routed to the operator behind the booking and their coordinators. By
    default the AI concierge also answers immediately from your trip's own
    data — labelled as the concierge, never as a person, and it cannot change
    anything. The thread stays open for a human either way.
    """
    thread = await AssistService(db).open_thread(
        trip_id,
        current_user,
        subject=payload.subject,
        body=payload.body,
        ask_concierge=payload.ask_concierge,
    )
    return responses.success(
        AssistThreadResponse(**AssistService.serialise(thread)).model_dump(),
        "Conversation started",
        status_code=201,
    )


@assist_router.get("", summary="Your conversations")
async def list_threads(
    current_user: CurrentUser,
    db: DbSession,
    pagination: Pagination,
    trip_id: Annotated[uuid.UUID | None, Query()] = None,
):
    items, total = await AssistService(db).list_for_traveller(
        current_user,
        offset=pagination.offset,
        limit=pagination.limit,
        trip_id=trip_id,
    )
    return responses.paginated(
        [
            AssistThreadResponse(
                **AssistService.serialise(t, include_messages=False)
            ).model_dump()
            for t in items
        ],
        page=pagination.page,
        limit=pagination.limit,
        total=total,
    )


@assist_router.get("/{thread_id}", summary="One conversation in full")
async def get_thread(
    thread_id: Annotated[uuid.UUID, Path()],
    current_user: CurrentUser,
    db: DbSession,
):
    thread = await AssistService(db).get_for_traveller(thread_id, current_user)
    return responses.success(
        AssistThreadResponse(**AssistService.serialise(thread)).model_dump(), "OK"
    )


@assist_router.post("/{thread_id}/messages", summary="Reply", status_code=201)
async def reply(
    thread_id: Annotated[uuid.UUID, Path()],
    payload: MessageRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    thread = await AssistService(db).reply_as_traveller(
        thread_id,
        current_user,
        payload.body,
        ask_concierge=payload.ask_concierge,
    )
    return responses.success(
        AssistThreadResponse(**AssistService.serialise(thread)).model_dump(),
        "Message sent",
        status_code=201,
    )


# --------------------------------------------------------------------------
# Reviews
# --------------------------------------------------------------------------

@reviews_router.post("", summary="Review something you travelled on", status_code=201)
async def create_review(
    payload: ReviewCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Rate a service, vendor, operator or your own trip.

    Refused unless you hold a booking that actually contains it. This rating is
    written back onto the row the component ranker reads, so an unverifiable
    one would not merely be noise — it would change what the next traveller is
    recommended.
    """
    review = await ReviewService(db).create(
        current_user,
        subject=payload.subject,
        target_id=payload.target_id,
        rating=payload.rating,
        title=payload.title,
        body=payload.body,
    )
    return responses.success(
        ReviewResponse(**ReviewService.serialise(review)).model_dump(),
        "Thanks — your review is live",
        status_code=201,
    )


@reviews_router.get("/pending", summary="What you could still review")
async def pending_reviews(current_user: CurrentUser, db: DbSession):
    """Components from tours you actually took, that you have not yet rated."""
    rows = await ReviewService(db).reviewable(current_user)
    return responses.success(
        [ReviewableItem(**r).model_dump() for r in rows], "OK"
    )


@reviews_router.get("/mine", summary="Reviews you have written")
async def my_reviews(
    current_user: CurrentUser, db: DbSession, pagination: Pagination
):
    items, total = await ReviewService(db).list_by_author(
        current_user, offset=pagination.offset, limit=pagination.limit
    )
    return responses.paginated(
        [ReviewResponse(**ReviewService.serialise(r)).model_dump() for r in items],
        page=pagination.page,
        limit=pagination.limit,
        total=total,
    )


@reviews_router.get(
    "/{subject}/{target_id}", summary="Reviews of one thing, with its rating"
)
async def list_reviews(
    subject: Annotated[ReviewSubject, Path()],
    target_id: Annotated[uuid.UUID, Path()],
    db: DbSession,
    pagination: Pagination,
):
    """Public. The summary carries the distribution as well as the average."""
    items, total, summary = await ReviewService(db).list_for(
        subject, target_id, offset=pagination.offset, limit=pagination.limit
    )
    payload = {
        "items": [
            ReviewResponse(**ReviewService.serialise(r)).model_dump() for r in items
        ],
        "pagination": responses.PaginationMeta.build(
            page=pagination.page, limit=pagination.limit, total=total
        ).model_dump(),
        "summary": summary,
    }
    return responses.success(payload, "OK")


@reviews_router.put("/{review_id}", summary="Edit your review")
async def update_review(
    review_id: Annotated[uuid.UUID, Path()],
    payload: ReviewUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    review = await ReviewService(db).update(
        review_id,
        current_user,
        rating=payload.rating,
        title=payload.title,
        body=payload.body,
    )
    return responses.success(
        ReviewResponse(**ReviewService.serialise(review)).model_dump(),
        "Review updated",
    )


@reviews_router.delete("/{review_id}", summary="Delete your review")
async def delete_review(
    review_id: Annotated[uuid.UUID, Path()],
    current_user: CurrentUser,
    db: DbSession,
):
    """Removing it also recomputes the aggregate it was contributing to."""
    await ReviewService(db).delete(review_id, current_user)
    return responses.success(None, "Review deleted")
