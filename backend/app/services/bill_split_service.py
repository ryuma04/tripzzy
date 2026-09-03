"""Bill splitting: dividing a trip's spend among the people who travelled.

The whole feature previously lived in the browser -- shares were computed in a
React component and "saved" to ``localStorage``, so nothing survived a change
of device and no other member ever saw the split they were part of. This is
the server-side replacement.
"""

import uuid
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.models import BillSplit, BillSplitMember, Expense, User
from app.models.enums import (
    BillSplitStatus,
    NotificationType,
    SplitMemberStatus,
)
from app.schemas.billing import BillSplitCreateRequest
from app.services.notification_service import NotificationService
from app.services.trip_service import TripService

CENT = Decimal("0.01")


def divide_evenly(total: Decimal, count: int) -> list[Decimal]:
    """Split ``total`` into ``count`` shares that sum back to exactly ``total``.

    Currency does not divide evenly, and the leftover has to go somewhere.
    Working in integer paise and handing one extra unit to each of the first
    ``remainder`` members keeps every share within a paisa of every other and
    guarantees the shares re-add to the total.

    The frontend previously did this two different ways at once: the table gave
    the whole remainder to the initiator while the header printed
    ``round(total / n)``, so for 40000 across 3 people the rows read
    13334/13333/13333 and the summary above them claimed "13,333 each".
    """
    if count < 1:
        raise ValidationError("A split needs at least one member")

    paise = int((total * 100).to_integral_value(rounding=ROUND_HALF_UP))
    base, remainder = divmod(paise, count)
    return [
        (Decimal(base + (1 if i < remainder else 0)) / 100).quantize(CENT)
        for i in range(count)
    ]


class BillSplitService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.trips = TripService(db)
        self.notifications = NotificationService(db)

    # -- helpers -----------------------------------------------------------

    async def _actual_spend(self, trip_id: uuid.UUID) -> Decimal:
        """What the trip has actually cost, from recorded expenses."""
        total = await self.db.scalar(
            select(func.coalesce(func.sum(Expense.amount), 0)).where(
                Expense.trip_id == trip_id
            )
        )
        return Decimal(str(total or 0))

    async def _load(self, split_id: uuid.UUID) -> BillSplit:
        split = (
            await self.db.execute(
                select(BillSplit)
                .where(BillSplit.id == split_id)
                .options(
                    selectinload(BillSplit.members),
                    selectinload(BillSplit.trip),
                    selectinload(BillSplit.created_by),
                )
            )
        ).scalar_one_or_none()
        if split is None:
            raise NotFoundError("Bill split")
        return split

    @staticmethod
    def _may_view(split: BillSplit, user: User) -> bool:
        """Creator and participants can see a split; nobody else can."""
        if split.created_by_id == user.id or user.is_admin:
            return True
        return any(m.user_id == user.id for m in split.members)

    def _serialise(self, split: BillSplit) -> dict:
        settled = sum(
            (m.share_amount for m in split.members if m.status == SplitMemberStatus.PAID),
            Decimal("0"),
        )
        creator = split.created_by
        return {
            "id": split.id,
            "trip_id": split.trip_id,
            "trip_title": split.trip.title if split.trip else None,
            "created_by_id": split.created_by_id,
            "created_by_name": (
                f"{creator.first_name} {creator.last_name}".strip()
                if creator
                else None
            ),
            "total_amount": Decimal(str(split.total_amount)),
            "currency": split.currency,
            "member_count": split.member_count,
            "split_method": split.split_method,
            "is_group": split.is_group,
            "status": split.status,
            "note": split.note,
            "members": [
                {
                    "id": m.id,
                    "user_id": m.user_id,
                    "display_name": m.display_name,
                    "email": m.email,
                    "avatar_url": m.avatar_url,
                    "share_amount": Decimal(str(m.share_amount)),
                    "status": m.status,
                    "is_payer": m.is_payer,
                    "order_index": m.order_index,
                }
                for m in sorted(split.members, key=lambda m: m.order_index)
            ],
            "settled_amount": settled,
            "outstanding_amount": Decimal(str(split.total_amount)) - settled,
            "created_at": split.created_at,
            "updated_at": split.updated_at,
        }

    # -- writes ------------------------------------------------------------

    async def create(
        self, trip_id: uuid.UUID, payload: BillSplitCreateRequest, user: User
    ) -> dict:
        trip = await self.trips.get_owned(trip_id, user)

        # Default to what the trip actually cost. The frontend used to read
        # the *budget* here while labelling it "calculated from verified
        # receipts", so every split was struck against the planned figure
        # rather than the real one.
        total = payload.total_amount
        if total is None:
            total = await self._actual_spend(trip_id)
            if total <= 0:
                raise ValidationError(
                    "This trip has no recorded expenses yet, so there is "
                    "nothing to split. Add expenses first, or pass an "
                    "explicit total_amount."
                )

        members_in = payload.members
        if payload.split_method == "equal":
            shares = divide_evenly(total, len(members_in))
        else:
            shares = [m.share_amount or Decimal("0") for m in members_in]

        # Resolve the referenced accounts in one query rather than per member.
        user_ids = [m.user_id for m in members_in if m.user_id is not None]
        users_by_id: dict[uuid.UUID, User] = {}
        if user_ids:
            rows = (
                (await self.db.execute(select(User).where(User.id.in_(user_ids))))
                .scalars()
                .all()
            )
            users_by_id = {u.id: u for u in rows}
            missing = set(user_ids) - set(users_by_id)
            if missing:
                raise ValidationError(
                    "Some members refer to accounts that do not exist",
                    details={"user_ids": [str(m) for m in sorted(missing, key=str)]},
                )

        split = BillSplit(
            trip_id=trip.id,
            created_by_id=user.id,
            total_amount=total,
            currency=payload.currency or trip.currency or settings.DEFAULT_CURRENCY,
            member_count=len(members_in),
            split_method=payload.split_method,
            is_group=payload.is_group,
            note=payload.note,
            status=BillSplitStatus.PENDING,
        )
        self.db.add(split)
        await self.db.flush()

        has_explicit_payer = any(m.is_payer for m in members_in)
        for index, (member_in, share) in enumerate(zip(members_in, shares)):
            account = (
                users_by_id.get(member_in.user_id) if member_in.user_id else None
            )
            display_name = (
                (member_in.display_name or "").strip()
                or (f"{account.first_name} {account.last_name}".strip() if account else "")
            )
            is_payer = member_in.is_payer
            # Whoever raised the split settled the bill unless told otherwise.
            if not has_explicit_payer and account is not None and account.id == user.id:
                is_payer = True

            self.db.add(
                BillSplitMember(
                    split_id=split.id,
                    user_id=member_in.user_id,
                    display_name=display_name or "Traveller",
                    email=member_in.email or (account.email if account else None),
                    avatar_url=account.avatar_url if account else None,
                    share_amount=share,
                    # The payer fronted the money, so their own share is
                    # already settled by definition.
                    status=(
                        SplitMemberStatus.PAID if is_payer else SplitMemberStatus.PENDING
                    ),
                    is_payer=is_payer,
                    order_index=index,
                )
            )

        await self.db.flush()
        split = await self._load(split.id)

        await self.notifications.fan_out(
            user_ids=[m.user_id for m in split.members if m.user_id],
            type=NotificationType.BILL_SPLIT,
            title=f"You were added to a bill split for {trip.title}",
            body=(
                f"{user.first_name} split {split.currency} {total} "
                f"across {split.member_count} people."
            ),
            payload={"trip_id": str(trip.id), "split_id": str(split.id)},
            link=f"/trips/{trip.id}",
            exclude=user.id,
        )

        await self.db.commit()
        split = await self._load(split.id)
        return self._serialise(split)

    async def set_member_status(
        self,
        split_id: uuid.UUID,
        member_id: uuid.UUID,
        status: SplitMemberStatus,
        user: User,
    ) -> dict:
        """Mark one member paid / owing.

        Either the split's creator (who is owed the money and knows when it
        arrived) or the member themselves may change this.
        """
        split = await self._load(split_id)
        member = next((m for m in split.members if m.id == member_id), None)
        if member is None:
            raise NotFoundError("Split member")

        is_creator = split.created_by_id == user.id
        is_self = member.user_id is not None and member.user_id == user.id
        if not (is_creator or is_self or user.is_admin):
            raise ForbiddenError(
                "Only the person who raised this split, or the member "
                "themselves, can change a share's status"
            )

        member.status = status
        await self.db.flush()

        # The split as a whole is settled once nothing is outstanding.
        split = await self._load(split_id)
        all_paid = all(m.status == SplitMemberStatus.PAID for m in split.members)
        newly_settled = all_paid and split.status != BillSplitStatus.SETTLED
        split.status = (
            BillSplitStatus.SETTLED if all_paid else BillSplitStatus.PENDING
        )

        if newly_settled:
            await self.notifications.fan_out(
                user_ids=[m.user_id for m in split.members if m.user_id],
                type=NotificationType.BILL_SPLIT_SETTLED,
                title=f"Bill split settled: {split.trip.title if split.trip else 'trip'}",
                body="Everyone has paid their share. This split is now closed.",
                payload={"trip_id": str(split.trip_id), "split_id": str(split.id)},
                link=f"/trips/{split.trip_id}",
            )

        await self.db.commit()
        split = await self._load(split_id)
        return self._serialise(split)

    async def delete(self, split_id: uuid.UUID, user: User) -> None:
        split = await self._load(split_id)
        if split.created_by_id != user.id and not user.is_admin:
            raise ForbiddenError(
                "Only the person who raised this split can delete it"
            )
        await self.db.delete(split)
        await self.db.commit()

    # -- reads -------------------------------------------------------------

    async def get(self, split_id: uuid.UUID, user: User) -> dict:
        split = await self._load(split_id)
        if not self._may_view(split, user):
            raise ForbiddenError("This bill split is not shared with you")
        return self._serialise(split)

    async def list_for_trip(self, trip_id: uuid.UUID, user: User) -> list[dict]:
        await self.trips.get_owned(trip_id, user)
        rows = (
            (
                await self.db.execute(
                    select(BillSplit)
                    .where(BillSplit.trip_id == trip_id)
                    .options(
                        selectinload(BillSplit.members),
                        selectinload(BillSplit.trip),
                        selectinload(BillSplit.created_by),
                    )
                    .order_by(BillSplit.created_at.desc())
                )
            )
            .scalars()
            .all()
        )
        return [self._serialise(s) for s in rows]

    async def list_for_user(
        self, user: User, *, offset: int, limit: int
    ) -> tuple[list[dict], int]:
        """Every split the caller raised or is a participant in."""
        involved = or_(
            BillSplit.created_by_id == user.id,
            BillSplit.id.in_(
                select(BillSplitMember.split_id).where(
                    BillSplitMember.user_id == user.id
                )
            ),
        )
        total = (
            await self.db.execute(
                select(func.count()).select_from(BillSplit).where(involved)
            )
        ).scalar_one()

        rows = (
            (
                await self.db.execute(
                    select(BillSplit)
                    .where(involved)
                    .options(
                        selectinload(BillSplit.members),
                        selectinload(BillSplit.trip),
                        selectinload(BillSplit.created_by),
                    )
                    .order_by(BillSplit.created_at.desc())
                    .offset(offset)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        return [self._serialise(s) for s in rows], total
