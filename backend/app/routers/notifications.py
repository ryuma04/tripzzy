"""In-app notification endpoints."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Path, Query
from pydantic import BaseModel, ConfigDict

from app.core import responses
from app.core.deps import CurrentUser, DbSession, Pagination
from app.models.enums import NotificationType
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: NotificationType
    title: str
    body: str
    payload: dict | None = None
    link: str | None = None
    is_read: bool
    created_at: object


@router.get("", summary="Your notifications")
async def list_notifications(
    current_user: CurrentUser,
    db: DbSession,
    pagination: Pagination,
    unread_only: Annotated[bool, Query()] = False,
):
    items, total, unread = await NotificationService(db).list_for_user(
        current_user,
        offset=pagination.offset,
        limit=pagination.limit,
        unread_only=unread_only,
    )
    payload = {
        "items": [
            NotificationResponse.model_validate(n).model_dump() for n in items
        ],
        "pagination": responses.PaginationMeta.build(
            page=pagination.page, limit=pagination.limit, total=total
        ).model_dump(),
        "unread_count": unread,
    }
    return responses.success(payload, "Notifications fetched")


@router.put("/{notification_id}/read", summary="Mark one as read")
async def mark_read(
    notification_id: Annotated[uuid.UUID, Path()],
    current_user: CurrentUser,
    db: DbSession,
):
    notification = await NotificationService(db).mark_read(
        notification_id, current_user
    )
    return responses.success(
        NotificationResponse.model_validate(notification).model_dump(),
        "Notification marked read",
    )


@router.put("/read-all", summary="Mark every notification read")
async def mark_all_read(current_user: CurrentUser, db: DbSession):
    count = await NotificationService(db).mark_all_read(current_user)
    return responses.success({"updated": count}, "All notifications marked read")
