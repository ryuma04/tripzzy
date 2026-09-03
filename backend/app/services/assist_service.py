"""Assist: a traveller mid-tour with a question, and someone to answer it.

The thread reaches the coordinator actually running the departure, because a
question about tomorrow's pickup is useless to a head office. Where no
coordinator is available -- out of hours, unassigned, or simply not yet -- an
AI concierge answers from the trip's real data rather than leaving the
traveller staring at nothing.

The concierge is bounded on purpose:

* it is **labelled**, always. ``AssistSender.AI`` is a distinct sender, not a
  flag on a coordinator message, and the UI says so. A traveller is entitled to
  know whether a person answered them;
* it answers from **facts this module hands it** -- the trip, the stops, the
  booked components -- assembled here and stored on the message, so a wrong
  answer can be diagnosed instead of guessed at;
* it never decides anything. It cannot cancel, rebook or refund; when a
  question needs that, it says so and the thread stays open for a human.

A thread with an AI reply is still ``OPEN``, never ``RESOLVED``. Only a person
closes a conversation.
"""

import logging
import uuid
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.models import (
    AssistMessage,
    AssistThread,
    Booking,
    BookingItem,
    OperatorMember,
    Trip,
    TripStop,
    User,
    Vendor,
    VendorService,
)
from app.models.enums import (
    AssistSender,
    AssistThreadStatus,
    BookingItemStatus,
    BookingStatus,
    NotificationType,
)
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)

LIVE_ITEMS = (BookingItemStatus.PENDING, BookingItemStatus.CONFIRMED)


class AssistService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.notifications = NotificationService(db)

    # -- loading -----------------------------------------------------------

    async def _thread(self, thread_id: uuid.UUID) -> AssistThread:
        thread = (
            await self.db.execute(
                select(AssistThread)
                .where(AssistThread.id == thread_id)
                .options(
                    selectinload(AssistThread.messages),
                    selectinload(AssistThread.trip),
                    selectinload(AssistThread.traveller),
                    selectinload(AssistThread.assigned_member).selectinload(
                        OperatorMember.user
                    ),
                )
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        if thread is None:
            raise NotFoundError("Conversation")
        return thread

    async def get_for_traveller(
        self, thread_id: uuid.UUID, user: User
    ) -> AssistThread:
        thread = await self._thread(thread_id)
        if thread.traveller_id != user.id and not user.is_admin:
            raise ForbiddenError("This conversation belongs to someone else")
        return thread

    async def get_for_operator(
        self, thread_id: uuid.UUID, membership: OperatorMember
    ) -> AssistThread:
        thread = await self._thread(thread_id)
        if thread.operator_id != membership.operator_id:
            # Reported as missing: whether another operator has such a thread
            # is not this caller's business.
            raise NotFoundError("Conversation")
        return thread

    # -- context for the concierge ----------------------------------------

    async def _trip_facts(self, trip: Trip) -> dict[str, Any]:
        """Everything the concierge is allowed to know, and nothing else.

        Assembled from the database rather than left to the model to recall,
        and stored on the reply so an answer can be checked against what it was
        actually told.
        """
        stops = (
            (
                await self.db.execute(
                    select(TripStop)
                    .where(TripStop.trip_id == trip.id)
                    .order_by(TripStop.order_index)
                )
            )
            .scalars()
            .all()
        )
        items = (
            (
                await self.db.execute(
                    select(BookingItem)
                    .join(Booking, BookingItem.booking_id == Booking.id)
                    .where(
                        Booking.trip_id == trip.id,
                        Booking.status != BookingStatus.CANCELLED,
                        BookingItem.status.in_(LIVE_ITEMS),
                    )
                    .order_by(BookingItem.service_date)
                )
            )
            .scalars()
            .all()
        )
        today = date.today()
        return {
            "trip_title": trip.title,
            "dates": f"{trip.start_date} to {trip.end_date}",
            "today": today.isoformat(),
            "travellers": trip.traveller_count,
            "currency": trip.currency,
            "stops": [
                {
                    "city": s.city_name,
                    "from": s.arrival_date.isoformat(),
                    "to": s.departure_date.isoformat(),
                }
                for s in stops
            ],
            "booked": [
                {
                    "what": i.title,
                    "type": i.component_type.value,
                    "vendor": i.vendor_name,
                    "city": i.city,
                    "date": i.service_date.isoformat(),
                    "status": i.status.value,
                }
                for i in items
            ],
        }

    async def _concierge_reply(
        self, thread: AssistThread, question: str
    ) -> AssistMessage | None:
        """Answer from trip facts, or stay quiet.

        Returns ``None`` when the model is unreachable. Silence is the right
        failure here: a fabricated answer about somebody's accommodation is
        worse than no answer, and the thread is already queued for a human.
        """
        from app.services.ai_service import AIService  # noqa: PLC0415

        facts = await self._trip_facts(thread.trip)
        try:
            answer = await AIService().answer_traveller(
                question=question,
                facts=facts,
                history=[
                    {"sender": m.sender.value, "body": m.body}
                    for m in thread.messages[-6:]
                ],
            )
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Concierge reply failed for thread %s: %s", thread.id, exc)
            return None

        if not answer:
            return None

        message = AssistMessage(
            thread_id=thread.id,
            sender_id=None,
            sender=AssistSender.AI,
            sender_name="Tripzyy Concierge",
            body=answer,
            context=facts,
        )
        self.db.add(message)
        return message

    # -- writes ------------------------------------------------------------

    async def open_thread(
        self,
        trip_id: uuid.UUID,
        user: User,
        *,
        subject: str,
        body: str,
        ask_concierge: bool = True,
    ) -> AssistThread:
        """Start a conversation about one trip."""
        trip = await self.db.get(Trip, trip_id)
        if trip is None or trip.deleted_at is not None:
            raise NotFoundError("Trip")
        if trip.user_id != user.id and not user.is_admin:
            raise ForbiddenError("This trip belongs to someone else")

        # Route to whoever is actually running this tour: the operator on the
        # booking, and the coordinator on its departure if there is one.
        booking = (
            await self.db.execute(
                select(Booking)
                .where(
                    Booking.trip_id == trip.id,
                    Booking.status != BookingStatus.CANCELLED,
                )
                .order_by(Booking.created_at)
                .limit(1)
            )
        ).scalar_one_or_none()

        operator_id = booking.operator_id if booking else None
        if operator_id is None and booking is not None:
            operator_id = await self._operator_behind(booking.id)

        now = datetime.now(timezone.utc)
        thread = AssistThread(
            trip_id=trip.id,
            traveller_id=user.id,
            booking_id=booking.id if booking else None,
            operator_id=operator_id,
            subject=subject[:160],
            status=AssistThreadStatus.OPEN,
            last_message_at=now,
        )
        self.db.add(thread)
        await self.db.flush()

        self.db.add(
            AssistMessage(
                thread_id=thread.id,
                sender_id=user.id,
                sender=AssistSender.TRAVELLER,
                sender_name=user.full_name,
                body=body,
            )
        )
        await self.db.flush()

        thread = await self._thread(thread.id)
        if ask_concierge:
            await self._concierge_reply(thread, body)

        await self._notify_staff(thread, user, body)
        await self.db.commit()
        return await self._thread(thread.id)

    async def _operator_behind(self, booking_id: uuid.UUID) -> uuid.UUID | None:
        """Whose catalogue this booking draws on.

        Same reasoning as the adaptation engine: a self-booked tour still holds
        an operator's inventory, and that operator is who can actually help.
        """
        return await self.db.scalar(
            select(Vendor.operator_id)
            .join(VendorService, VendorService.vendor_id == Vendor.id)
            .join(BookingItem, BookingItem.service_id == VendorService.id)
            .where(BookingItem.booking_id == booking_id)
            .limit(1)
        )

    async def reply_as_traveller(
        self, thread_id: uuid.UUID, user: User, body: str, *, ask_concierge: bool = False
    ) -> AssistThread:
        thread = await self.get_for_traveller(thread_id, user)
        if thread.status is AssistThreadStatus.CLOSED:
            raise ConflictError("This conversation has been closed")

        self.db.add(
            AssistMessage(
                thread_id=thread.id,
                sender_id=user.id,
                sender=AssistSender.TRAVELLER,
                sender_name=user.full_name,
                body=body,
            )
        )
        # A traveller replying puts the ball back with staff.
        thread.status = AssistThreadStatus.OPEN
        thread.last_message_at = datetime.now(timezone.utc)
        await self.db.flush()

        if ask_concierge:
            await self._concierge_reply(await self._thread(thread.id), body)

        await self._notify_staff(thread, user, body)
        await self.db.commit()
        return await self._thread(thread.id)

    async def reply_as_staff(
        self,
        thread_id: uuid.UUID,
        membership: OperatorMember,
        body: str,
        *,
        resolve: bool = False,
    ) -> AssistThread:
        thread = await self.get_for_operator(thread_id, membership)
        if thread.status is AssistThreadStatus.CLOSED:
            raise ConflictError("This conversation has been closed")

        staff = await self.db.get(User, membership.user_id)
        self.db.add(
            AssistMessage(
                thread_id=thread.id,
                sender_id=membership.user_id,
                sender=AssistSender.COORDINATOR,
                sender_name=staff.full_name if staff else None,
                body=body,
            )
        )
        now = datetime.now(timezone.utc)
        thread.last_message_at = now
        # Answering claims the thread, so a queue does not show it to everyone.
        thread.assigned_member_id = thread.assigned_member_id or membership.id
        if resolve:
            thread.status = AssistThreadStatus.RESOLVED
            thread.resolved_at = now
        else:
            thread.status = AssistThreadStatus.WAITING

        await self.notifications.create(
            user_id=thread.traveller_id,
            type=NotificationType.ASSIST_REPLY,
            title=f"Reply on “{thread.subject}”",
            body=body[:280],
            payload={"thread_id": str(thread.id), "trip_id": str(thread.trip_id)},
            link=f"/trips/{thread.trip_id}",
        )
        await self.db.commit()
        return await self._thread(thread.id)

    async def set_status(
        self,
        thread_id: uuid.UUID,
        membership: OperatorMember,
        status: AssistThreadStatus,
    ) -> AssistThread:
        thread = await self.get_for_operator(thread_id, membership)
        thread.status = status
        thread.resolved_at = (
            datetime.now(timezone.utc)
            if status in (AssistThreadStatus.RESOLVED, AssistThreadStatus.CLOSED)
            else None
        )
        await self.db.commit()
        return await self._thread(thread.id)

    async def assign(
        self,
        thread_id: uuid.UUID,
        membership: OperatorMember,
        member_id: uuid.UUID | None,
    ) -> AssistThread:
        thread = await self.get_for_operator(thread_id, membership)
        if member_id is not None:
            target = await self.db.get(OperatorMember, member_id)
            if target is None or target.operator_id != membership.operator_id:
                raise NotFoundError("Team member")
        thread.assigned_member_id = member_id
        await self.db.commit()
        return await self._thread(thread.id)

    async def _notify_staff(
        self, thread: AssistThread, actor: User, body: str
    ) -> None:
        if thread.operator_id is None:
            return
        recipients = list(
            (
                await self.db.execute(
                    select(OperatorMember.user_id).where(
                        OperatorMember.operator_id == thread.operator_id,
                        OperatorMember.is_active.is_(True),
                    )
                )
            )
            .scalars()
            .all()
        )
        await self.notifications.fan_out(
            user_ids=recipients,
            type=NotificationType.ASSIST_REPLY,
            title=f"{actor.full_name}: {thread.subject}",
            body=body[:280],
            payload={"thread_id": str(thread.id), "trip_id": str(thread.trip_id)},
            link="/operator?tab=assist",
            exclude=actor.id,
        )

    # -- reads -------------------------------------------------------------

    async def list_for_traveller(
        self, user: User, *, offset: int, limit: int, trip_id: uuid.UUID | None = None
    ) -> tuple[list[AssistThread], int]:
        where = [AssistThread.traveller_id == user.id]
        if trip_id is not None:
            where.append(AssistThread.trip_id == trip_id)
        return await self._page(where, offset=offset, limit=limit)

    async def list_for_operator(
        self,
        membership: OperatorMember,
        *,
        offset: int,
        limit: int,
        status: AssistThreadStatus | None = None,
        mine_only: bool = False,
    ) -> tuple[list[AssistThread], int]:
        where = [AssistThread.operator_id == membership.operator_id]
        if status is not None:
            where.append(AssistThread.status == status)
        if mine_only:
            # Unassigned threads count as mine-to-pick-up; a queue that hid
            # them would leave new questions invisible to everybody.
            where.append(
                or_(
                    AssistThread.assigned_member_id == membership.id,
                    AssistThread.assigned_member_id.is_(None),
                )
            )
        return await self._page(where, offset=offset, limit=limit)

    async def _page(
        self, where: list, *, offset: int, limit: int
    ) -> tuple[list[AssistThread], int]:
        total = (
            await self.db.execute(
                select(func.count()).select_from(AssistThread).where(*where)
            )
        ).scalar_one()
        rows = (
            (
                await self.db.execute(
                    select(AssistThread)
                    .where(*where)
                    .options(
                        selectinload(AssistThread.messages),
                        selectinload(AssistThread.trip),
                        selectinload(AssistThread.traveller),
                        selectinload(AssistThread.assigned_member).selectinload(
                            OperatorMember.user
                        ),
                    )
                    # Open first, then most recently spoken in: a queue is a
                    # to-do list, and a resolved thread is history.
                    .order_by(
                        AssistThread.status.in_(
                            (AssistThreadStatus.RESOLVED, AssistThreadStatus.CLOSED)
                        ),
                        AssistThread.last_message_at.desc().nullslast(),
                    )
                    .offset(offset)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        return list(rows), total

    @staticmethod
    def serialise(thread: AssistThread, *, include_messages: bool = True) -> dict:
        assigned = thread.assigned_member
        payload = {
            "id": thread.id,
            "trip_id": thread.trip_id,
            "trip_title": thread.trip.title if thread.trip else None,
            "traveller_id": thread.traveller_id,
            "traveller_name": (
                thread.traveller.full_name if thread.traveller else None
            ),
            "booking_id": thread.booking_id,
            "operator_id": thread.operator_id,
            "assigned_member_id": thread.assigned_member_id,
            "assigned_member_name": (
                assigned.user.full_name if assigned and assigned.user else None
            ),
            "subject": thread.subject,
            "status": thread.status,
            "message_count": len(thread.messages),
            "last_message_at": thread.last_message_at,
            "resolved_at": thread.resolved_at,
            "created_at": thread.created_at,
            "updated_at": thread.updated_at,
        }
        if include_messages:
            payload["messages"] = [
                {
                    "id": m.id,
                    "sender": m.sender,
                    "sender_id": m.sender_id,
                    "sender_name": m.sender_name,
                    "body": m.body,
                    "created_at": m.created_at,
                }
                for m in sorted(thread.messages, key=lambda x: x.created_at)
            ]
        return payload
