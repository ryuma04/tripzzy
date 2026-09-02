"""In-app notifications.

Replaces the previous frontend-only approach, which wrote "notifications" to
the initiator's own ``localStorage``. That meant the person who *sent* a
notification was the only one who could ever see it -- everybody else got
nothing, while the UI reported the group had been notified.
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Sequence

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models import Notification, User
from app.models.enums import NotificationType


class NotificationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        *,
        user_id: uuid.UUID,
        type: NotificationType,
        title: str,
        body: str,
        payload: dict[str, Any] | None = None,
        link: str | None = None,
    ) -> Notification:
        notification = Notification(
            user_id=user_id,
            type=type,
            title=title[:160],
            body=body,
            payload=payload,
            link=link,
        )
        self.db.add(notification)
        return notification

    async def fan_out(
        self,
        *,
        user_ids: Sequence[uuid.UUID],
        type: NotificationType,
        title: str,
        body: str,
        payload: dict[str, Any] | None = None,
        link: str | None = None,
        exclude: uuid.UUID | None = None,
    ) -> int:
        """Notify several people at once, skipping ``exclude``.

        Used to tell a group about something one of them did; the actor does
        not need telling about their own action. Duplicates are collapsed, so
        a caller can pass a member list without pre-filtering it.
        """
        targets = {uid for uid in user_ids if uid is not None and uid != exclude}
        for uid in targets:
            await self.create(
                user_id=uid,
                type=type,
                title=title,
                body=body,
                payload=payload,
                link=link,
            )
        return len(targets)

    async def list_for_user(
        self,
        user: User,
        *,
        offset: int,
        limit: int,
        unread_only: bool = False,
    ) -> tuple[list[Notification], int, int]:
        """Return ``(items, total, unread_count)`` newest first."""
        base = select(Notification).where(Notification.user_id == user.id)
        count_stmt = (
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user.id)
        )
        if unread_only:
            base = base.where(Notification.is_read.is_(False))
            count_stmt = count_stmt.where(Notification.is_read.is_(False))

        total = (await self.db.execute(count_stmt)).scalar_one()
        unread = (
            await self.db.execute(
                select(func.count())
                .select_from(Notification)
                .where(
                    Notification.user_id == user.id,
                    Notification.is_read.is_(False),
                )
            )
        ).scalar_one()

        rows = (
            (
                await self.db.execute(
                    base.order_by(Notification.created_at.desc())
                    .offset(offset)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        return list(rows), total, unread

    async def mark_read(self, notification_id: uuid.UUID, user: User) -> Notification:
        notification = await self.db.get(Notification, notification_id)
        # Someone else's notification is reported as missing rather than
        # forbidden: its existence is not the caller's business.
        if notification is None or notification.user_id != user.id:
            raise NotFoundError("Notification")
        if not notification.is_read:
            notification.is_read = True
            notification.read_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(notification)
        return notification

    async def mark_all_read(self, user: User) -> int:
        result = await self.db.execute(
            update(Notification)
            .where(
                Notification.user_id == user.id,
                Notification.is_read.is_(False),
            )
            .values(is_read=True, read_at=datetime.now(timezone.utc))
        )
        await self.db.commit()
        return result.rowcount or 0
