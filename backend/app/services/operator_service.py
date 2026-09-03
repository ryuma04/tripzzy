"""The operator side: running personalised tours, not just selling them.

Everything here is scoped to one operator, resolved from the caller's
membership rather than passed in. That is the security boundary: an operator
can only ever see their own customers, vendors, bookings and departures, and
no endpoint takes an ``operator_id`` a caller could tamper with.
"""

import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.models import (
    Booking,
    BookingItem,
    Operator,
    OperatorMember,
    Payment,
    TourGroup,
    TourGroupMember,
    User,
    Vendor,
    VendorService,
)
from app.models.enums import (
    BookingItemStatus,
    BookingStatus,
    PaymentKind,
    PaymentStatus,
    TourGroupStatus,
)

ZERO = Decimal("0")
MONEY = Decimal("0.01")

# Bookings that represent live commercial commitments.
ACTIVE_BOOKINGS = (
    BookingStatus.PENDING_PAYMENT,
    BookingStatus.CONFIRMED,
    BookingStatus.IN_PROGRESS,
)


class OperatorService:
    def __init__(self, db: AsyncSession, membership: OperatorMember) -> None:
        self.db = db
        self.membership = membership
        self.operator_id = membership.operator_id

    # -- dashboard ---------------------------------------------------------

    async def dashboard(self) -> dict:
        """The numbers an operator needs on opening the console.

        Deliberately operational rather than vanity: what is departing soon,
        what money is outstanding, and what needs attention today.
        """
        today = date.today()
        soon = today + timedelta(days=14)

        booking_scope = Booking.operator_id == self.operator_id

        total_bookings = await self.db.scalar(
            select(func.count()).select_from(Booking).where(booking_scope)
        )
        active_bookings = await self.db.scalar(
            select(func.count())
            .select_from(Booking)
            .where(booking_scope, Booking.status.in_(ACTIVE_BOOKINGS))
        )
        awaiting_payment = await self.db.scalar(
            select(func.count())
            .select_from(Booking)
            .where(booking_scope, Booking.status == BookingStatus.PENDING_PAYMENT)
        )

        # Distinct customers, not bookings: repeat travellers count once.
        customers = await self.db.scalar(
            select(func.count(func.distinct(Booking.traveller_id)))
            .select_from(Booking)
            .where(booking_scope)
        )

        booked_value = await self.db.scalar(
            select(func.coalesce(func.sum(Booking.total), 0)).where(
                booking_scope, Booking.status.in_(ACTIVE_BOOKINGS)
            )
        )
        captured = await self.db.scalar(
            select(func.coalesce(func.sum(Payment.amount), 0))
            .select_from(Payment)
            .join(Booking, Payment.booking_id == Booking.id)
            .where(
                booking_scope,
                Payment.status == PaymentStatus.CAPTURED,
                Payment.kind != PaymentKind.REFUND,
            )
        )
        refunded = await self.db.scalar(
            select(func.coalesce(func.sum(Payment.amount), 0))
            .select_from(Payment)
            .join(Booking, Payment.booking_id == Booking.id)
            .where(
                booking_scope,
                Payment.status == PaymentStatus.CAPTURED,
                Payment.kind == PaymentKind.REFUND,
            )
        )

        departing_soon = await self.db.scalar(
            select(func.count())
            .select_from(TourGroup)
            .where(
                TourGroup.operator_id == self.operator_id,
                TourGroup.start_date.between(today, soon),
                TourGroup.status.notin_(
                    [TourGroupStatus.CANCELLED, TourGroupStatus.COMPLETED]
                ),
            )
        )
        unstaffed = await self.db.scalar(
            select(func.count())
            .select_from(TourGroup)
            .where(
                TourGroup.operator_id == self.operator_id,
                TourGroup.coordinator_id.is_(None),
                TourGroup.start_date >= today,
                TourGroup.status.notin_(
                    [TourGroupStatus.CANCELLED, TourGroupStatus.COMPLETED]
                ),
            )
        )

        vendors = await self.db.scalar(
            select(func.count())
            .select_from(Vendor)
            .where(Vendor.operator_id == self.operator_id, Vendor.is_active.is_(True))
        )
        services = await self.db.scalar(
            select(func.count())
            .select_from(VendorService)
            .join(Vendor, VendorService.vendor_id == Vendor.id)
            .where(Vendor.operator_id == self.operator_id)
        )
        coordinators = await self.db.scalar(
            select(func.count())
            .select_from(OperatorMember)
            .where(
                OperatorMember.operator_id == self.operator_id,
                OperatorMember.is_active.is_(True),
            )
        )

        booked = Decimal(str(booked_value or 0))
        collected = Decimal(str(captured or 0)) - Decimal(str(refunded or 0))

        return {
            "operator_id": self.operator_id,
            "bookings": {
                "total": total_bookings or 0,
                "active": active_bookings or 0,
                "awaiting_payment": awaiting_payment or 0,
                "customers": customers or 0,
            },
            "money": {
                "booked_value": booked.quantize(MONEY),
                "collected": collected.quantize(MONEY),
                "outstanding": max(ZERO, booked - collected).quantize(MONEY),
                "refunded": Decimal(str(refunded or 0)).quantize(MONEY),
            },
            "operations": {
                "departing_within_14_days": departing_soon or 0,
                # The single most actionable number here: a departure with
                # nobody assigned to run it.
                "unstaffed_departures": unstaffed or 0,
                "vendors": vendors or 0,
                "services": services or 0,
                "coordinators": coordinators or 0,
            },
        }

    # -- customers ---------------------------------------------------------

    async def customers(self, *, offset: int, limit: int, q: str | None = None) -> tuple[list[dict], int]:
        """Everyone who has booked with this operator, with their totals."""
        scope = [Booking.operator_id == self.operator_id]
        if q:
            pattern = f"%{q.strip().lower()}%"
            scope.append(
                func.lower(
                    User.first_name + " " + User.last_name + " " + User.email
                ).like(pattern)
            )

        base = (
            select(
                User.id,
                User.first_name,
                User.last_name,
                User.email,
                User.city,
                User.avatar_url,
                func.count(Booking.id).label("bookings"),
                func.coalesce(func.sum(Booking.total), 0).label("value"),
                func.max(Booking.created_at).label("last_booked"),
            )
            .select_from(Booking)
            .join(User, Booking.traveller_id == User.id)
            .where(*scope)
            .group_by(User.id)
        )

        total = (
            await self.db.execute(
                select(func.count()).select_from(base.subquery())
            )
        ).scalar_one()

        rows = (
            await self.db.execute(
                base.order_by(func.max(Booking.created_at).desc())
                .offset(offset)
                .limit(limit)
            )
        ).all()

        return [
            {
                "id": r.id,
                "first_name": r.first_name,
                "last_name": r.last_name,
                "email": r.email,
                "city": r.city,
                "avatar_url": r.avatar_url,
                "booking_count": r.bookings,
                "lifetime_value": Decimal(str(r.value)).quantize(MONEY),
                "last_booked_at": r.last_booked,
            }
            for r in rows
        ], total

    # -- bookings ----------------------------------------------------------

    async def bookings(
        self,
        *,
        offset: int,
        limit: int,
        status: BookingStatus | None = None,
        q: str | None = None,
    ) -> tuple[list[dict], int]:
        conditions = [Booking.operator_id == self.operator_id]
        if status is not None:
            conditions.append(Booking.status == status)
        if q:
            pattern = f"%{q.strip().lower()}%"
            conditions.append(
                or_(
                    func.lower(Booking.reference).like(pattern),
                    func.lower(User.first_name + " " + User.last_name).like(pattern),
                    func.lower(User.email).like(pattern),
                )
            )

        count_stmt = (
            select(func.count())
            .select_from(Booking)
            .join(User, Booking.traveller_id == User.id)
            .where(*conditions)
        )
        total = (await self.db.execute(count_stmt)).scalar_one()

        rows = (
            (
                await self.db.execute(
                    select(Booking)
                    .join(User, Booking.traveller_id == User.id)
                    .where(*conditions)
                    .options(
                        selectinload(Booking.items),
                        selectinload(Booking.payments),
                        selectinload(Booking.traveller),
                        selectinload(Booking.trip),
                    )
                    .order_by(Booking.created_at.desc())
                    .offset(offset)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )

        return [self._booking_row(b) for b in rows], total

    @staticmethod
    def _booking_row(booking: Booking) -> dict:
        captured = sum(
            (
                Decimal(str(p.amount))
                for p in booking.payments
                if p.status == PaymentStatus.CAPTURED and p.kind != PaymentKind.REFUND
            ),
            ZERO,
        )
        refunded = sum(
            (
                Decimal(str(p.amount))
                for p in booking.payments
                if p.status == PaymentStatus.CAPTURED and p.kind == PaymentKind.REFUND
            ),
            ZERO,
        )
        paid = (captured - refunded).quantize(MONEY)
        total = Decimal(str(booking.total))
        traveller = booking.traveller
        return {
            "id": booking.id,
            "reference": booking.reference,
            "status": booking.status,
            "trip_id": booking.trip_id,
            "trip_title": booking.trip.title if booking.trip else None,
            "traveller_id": booking.traveller_id,
            "traveller_name": (
                f"{traveller.first_name} {traveller.last_name}".strip()
                if traveller
                else None
            ),
            "traveller_email": traveller.email if traveller else None,
            "currency": booking.currency,
            "total": total,
            "amount_paid": paid,
            "amount_outstanding": max(ZERO, total - paid).quantize(MONEY),
            "item_count": len(
                [
                    i
                    for i in booking.items
                    if i.status
                    in (BookingItemStatus.PENDING, BookingItemStatus.CONFIRMED)
                ]
            ),
            "first_service_date": min(
                (i.service_date for i in booking.items), default=None
            ),
            "created_at": booking.created_at,
        }

    # -- schedule ----------------------------------------------------------

    async def schedule(self, *, start: date, days: int = 14) -> dict:
        """Every committed service in a date window, grouped by day.

        This is the operations board: what has to actually happen, and who it
        is for. Cancelled and replaced items are excluded, since nobody needs
        to staff those.
        """
        end = start + timedelta(days=days)

        rows = (
            (
                await self.db.execute(
                    select(BookingItem, Booking, User)
                    .join(Booking, BookingItem.booking_id == Booking.id)
                    .join(User, Booking.traveller_id == User.id)
                    .where(
                        Booking.operator_id == self.operator_id,
                        Booking.status.in_(ACTIVE_BOOKINGS),
                        BookingItem.status.in_(
                            [BookingItemStatus.PENDING, BookingItemStatus.CONFIRMED]
                        ),
                        BookingItem.service_date.between(start, end),
                    )
                    .order_by(BookingItem.service_date, BookingItem.start_time)
                )
            )
        ).all()

        by_day: dict[str, list[dict]] = {}
        for item, booking, traveller in rows:
            key = item.service_date.isoformat()
            by_day.setdefault(key, []).append(
                {
                    "item_id": item.id,
                    "booking_id": booking.id,
                    "booking_reference": booking.reference,
                    "component_type": item.component_type,
                    "title": item.title,
                    "vendor_name": item.vendor_name,
                    "city": item.city,
                    "start_time": item.start_time,
                    "end_time": item.end_time,
                    "quantity": item.quantity,
                    "traveller_name": (
                        f"{traveller.first_name} {traveller.last_name}".strip()
                    ),
                    "status": item.status,
                }
            )

        return {
            "start": start,
            "end": end,
            "days": [
                {"date": day, "events": events}
                for day, events in sorted(by_day.items())
            ],
            "total_events": sum(len(v) for v in by_day.values()),
        }

    # -- vendors -----------------------------------------------------------

    async def vendors(
        self, *, offset: int, limit: int, q: str | None = None
    ) -> tuple[list[dict], int]:
        conditions = [Vendor.operator_id == self.operator_id]
        if q:
            conditions.append(func.lower(Vendor.name).like(f"%{q.strip().lower()}%"))

        total = (
            await self.db.execute(
                select(func.count()).select_from(Vendor).where(*conditions)
            )
        ).scalar_one()

        rows = (
            (
                await self.db.execute(
                    select(
                        Vendor,
                        func.count(VendorService.id).label("service_count"),
                    )
                    .outerjoin(VendorService, VendorService.vendor_id == Vendor.id)
                    .where(*conditions)
                    .group_by(Vendor.id)
                    .order_by(Vendor.name)
                    .offset(offset)
                    .limit(limit)
                )
            )
        ).all()

        return [
            {
                "id": v.id,
                "name": v.name,
                "category": v.category,
                "city": v.city,
                "country": v.country,
                "contact_email": v.contact_email,
                "contact_phone": v.contact_phone,
                "rating": v.rating,
                "reliability_score": v.reliability_score,
                "is_active": v.is_active,
                "service_count": count,
            }
            for v, count in rows
        ], total

    async def vendor_services(
        self, vendor_id: uuid.UUID, *, offset: int, limit: int
    ) -> tuple[list[dict], int]:
        vendor = await self.db.get(Vendor, vendor_id)
        if vendor is None:
            raise NotFoundError("Vendor")
        # Scope check: a vendor belonging to another operator is not visible.
        if vendor.operator_id != self.operator_id:
            raise ForbiddenError("That vendor belongs to another operator")

        total = (
            await self.db.execute(
                select(func.count())
                .select_from(VendorService)
                .where(VendorService.vendor_id == vendor_id)
            )
        ).scalar_one()

        rows = (
            (
                await self.db.execute(
                    select(VendorService)
                    .where(VendorService.vendor_id == vendor_id)
                    .order_by(VendorService.unit_price)
                    .offset(offset)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        return [
            {
                "id": s.id,
                "name": s.name,
                "service_type": s.service_type,
                "comfort_tier": s.comfort_tier,
                "unit_price": Decimal(str(s.unit_price)),
                "unit_label": s.unit_label,
                "currency": s.currency,
                "city": s.city,
                "rating": s.rating,
                "free_cancellation_days": s.free_cancellation_days,
                "cancellation_penalty_pct": s.cancellation_penalty_pct,
                "is_active": s.is_active,
            }
            for s in rows
        ], total

    # -- coordinators ------------------------------------------------------

    async def coordinators(self) -> list[dict]:
        """The roster, with how many departures each person is running."""
        today = date.today()
        rows = (
            (
                await self.db.execute(
                    select(OperatorMember)
                    .where(OperatorMember.operator_id == self.operator_id)
                    .options(selectinload(OperatorMember.user))
                    .order_by(OperatorMember.role, OperatorMember.created_at)
                )
            )
            .scalars()
            .all()
        )

        load_rows = (
            await self.db.execute(
                select(TourGroup.coordinator_id, func.count(TourGroup.id))
                .where(
                    TourGroup.operator_id == self.operator_id,
                    TourGroup.end_date >= today,
                    TourGroup.status.notin_(
                        [TourGroupStatus.CANCELLED, TourGroupStatus.COMPLETED]
                    ),
                )
                .group_by(TourGroup.coordinator_id)
            )
        ).all()
        load = {cid: count for cid, count in load_rows if cid is not None}

        return [
            {
                "id": m.id,
                "user_id": m.user_id,
                "name": (
                    f"{m.user.first_name} {m.user.last_name}".strip()
                    if m.user
                    else None
                ),
                "email": m.user.email if m.user else None,
                "avatar_url": m.user.avatar_url if m.user else None,
                "role": m.role,
                "job_title": m.job_title,
                "is_active": m.is_active,
                "active_departures": load.get(m.id, 0),
            }
            for m in rows
        ]

    # -- tour groups -------------------------------------------------------

    async def _group(self, group_id: uuid.UUID) -> TourGroup:
        group = (
            await self.db.execute(
                select(TourGroup)
                .where(TourGroup.id == group_id)
                .options(
                    selectinload(TourGroup.members).selectinload(
                        TourGroupMember.traveller
                    ),
                    selectinload(TourGroup.coordinator).selectinload(
                        OperatorMember.user
                    ),
                )
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        if group is None:
            raise NotFoundError("Tour group")
        if group.operator_id != self.operator_id:
            raise ForbiddenError("That departure belongs to another operator")
        return group

    def _group_row(self, group: TourGroup) -> dict:
        seats_taken = sum(m.seats for m in group.members)
        coordinator = group.coordinator
        return {
            "id": group.id,
            "name": group.name,
            "destination": group.destination,
            "start_date": group.start_date,
            "end_date": group.end_date,
            "capacity": group.capacity,
            "seats_taken": seats_taken,
            "seats_left": max(0, group.capacity - seats_taken),
            "status": group.status,
            "coordinator_id": group.coordinator_id,
            "coordinator_name": (
                f"{coordinator.user.first_name} {coordinator.user.last_name}".strip()
                if coordinator and coordinator.user
                else None
            ),
            "notes": group.notes,
            "members": [
                {
                    "id": m.id,
                    "booking_id": m.booking_id,
                    "traveller_id": m.traveller_id,
                    "traveller_name": (
                        f"{m.traveller.first_name} {m.traveller.last_name}".strip()
                        if m.traveller
                        else None
                    ),
                    "seats": m.seats,
                }
                for m in group.members
            ],
            "created_at": group.created_at,
        }

    async def tour_groups(
        self, *, offset: int, limit: int, status: TourGroupStatus | None = None
    ) -> tuple[list[dict], int]:
        conditions = [TourGroup.operator_id == self.operator_id]
        if status is not None:
            conditions.append(TourGroup.status == status)

        total = (
            await self.db.execute(
                select(func.count()).select_from(TourGroup).where(*conditions)
            )
        ).scalar_one()

        rows = (
            (
                await self.db.execute(
                    select(TourGroup)
                    .where(*conditions)
                    .options(
                        selectinload(TourGroup.members).selectinload(
                            TourGroupMember.traveller
                        ),
                        selectinload(TourGroup.coordinator).selectinload(
                            OperatorMember.user
                        ),
                    )
                    .order_by(TourGroup.start_date)
                    .offset(offset)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        return [self._group_row(g) for g in rows], total

    async def create_tour_group(self, payload) -> dict:
        if payload.coordinator_id is not None:
            await self._assert_own_member(payload.coordinator_id)

        group = TourGroup(
            operator_id=self.operator_id,
            name=payload.name,
            destination=payload.destination,
            start_date=payload.start_date,
            end_date=payload.end_date,
            capacity=payload.capacity,
            coordinator_id=payload.coordinator_id,
            notes=payload.notes,
        )
        self.db.add(group)
        await self.db.commit()
        return self._group_row(await self._group(group.id))

    async def _assert_own_member(self, member_id: uuid.UUID) -> OperatorMember:
        member = await self.db.get(OperatorMember, member_id)
        if member is None:
            raise NotFoundError("Operator member")
        if member.operator_id != self.operator_id:
            raise ForbiddenError("That person is not on your roster")
        if not member.is_active:
            raise ConflictError("That person is no longer active")
        return member

    async def assign_coordinator(
        self, group_id: uuid.UUID, coordinator_id: uuid.UUID | None
    ) -> dict:
        group = await self._group(group_id)
        if coordinator_id is not None:
            await self._assert_own_member(coordinator_id)
        group.coordinator_id = coordinator_id
        await self.db.commit()
        return self._group_row(await self._group(group_id))

    async def set_group_status(
        self, group_id: uuid.UUID, status: TourGroupStatus
    ) -> dict:
        group = await self._group(group_id)
        group.status = status
        await self.db.commit()
        return self._group_row(await self._group(group_id))

    async def add_booking_to_group(
        self, group_id: uuid.UUID, booking_id: uuid.UUID, seats: int
    ) -> dict:
        group = await self._group(group_id)

        booking = await self.db.get(Booking, booking_id)
        if booking is None:
            raise NotFoundError("Booking")
        if booking.operator_id != self.operator_id:
            raise ForbiddenError("That booking belongs to another operator")

        if any(m.booking_id == booking_id for m in group.members):
            raise ConflictError("That booking is already on this departure")

        taken = sum(m.seats for m in group.members)
        if taken + seats > group.capacity:
            raise ConflictError(
                f"Only {group.capacity - taken} seat(s) left on this departure; "
                f"{seats} requested"
            )

        self.db.add(
            TourGroupMember(
                tour_group_id=group.id,
                booking_id=booking.id,
                traveller_id=booking.traveller_id,
                seats=seats,
            )
        )
        await self.db.flush()

        group = await self._group(group_id)
        # A departure that has just filled says so, rather than waiting for
        # somebody to notice.
        if sum(m.seats for m in group.members) >= group.capacity:
            group.status = TourGroupStatus.FULL
        await self.db.commit()
        return self._group_row(await self._group(group_id))

    async def remove_booking_from_group(
        self, group_id: uuid.UUID, member_id: uuid.UUID
    ) -> dict:
        group = await self._group(group_id)
        member = next((m for m in group.members if m.id == member_id), None)
        if member is None:
            raise NotFoundError("Departure member")
        await self.db.delete(member)
        await self.db.flush()

        group = await self._group(group_id)
        if group.status == TourGroupStatus.FULL:
            group.status = TourGroupStatus.CONFIRMED
        await self.db.commit()
        return self._group_row(await self._group(group_id))

    # -- payments ----------------------------------------------------------

    async def payments(
        self, *, offset: int, limit: int
    ) -> tuple[list[dict], int, dict]:
        """The money ledger, newest first, with running totals."""
        scope = Booking.operator_id == self.operator_id

        total = (
            await self.db.execute(
                select(func.count())
                .select_from(Payment)
                .join(Booking, Payment.booking_id == Booking.id)
                .where(scope)
            )
        ).scalar_one()

        rows = (
            await self.db.execute(
                select(Payment, Booking, User)
                .join(Booking, Payment.booking_id == Booking.id)
                .join(User, Booking.traveller_id == User.id)
                .where(scope)
                .order_by(Payment.created_at.desc())
                .offset(offset)
                .limit(limit)
            )
        ).all()

        captured = await self.db.scalar(
            select(func.coalesce(func.sum(Payment.amount), 0))
            .select_from(Payment)
            .join(Booking, Payment.booking_id == Booking.id)
            .where(
                scope,
                Payment.status == PaymentStatus.CAPTURED,
                Payment.kind != PaymentKind.REFUND,
            )
        )
        refunded = await self.db.scalar(
            select(func.coalesce(func.sum(Payment.amount), 0))
            .select_from(Payment)
            .join(Booking, Payment.booking_id == Booking.id)
            .where(
                scope,
                Payment.status == PaymentStatus.CAPTURED,
                Payment.kind == PaymentKind.REFUND,
            )
        )

        items = [
            {
                "id": p.id,
                "booking_id": b.id,
                "booking_reference": b.reference,
                "traveller_name": f"{u.first_name} {u.last_name}".strip(),
                "amount": Decimal(str(p.amount)),
                "currency": p.currency,
                "kind": p.kind,
                "status": p.status,
                "method": p.method,
                "gateway_reference": p.gateway_reference,
                "failure_reason": p.failure_reason,
                "created_at": p.created_at,
            }
            for p, b, u in rows
        ]
        totals = {
            "captured": Decimal(str(captured or 0)).quantize(MONEY),
            "refunded": Decimal(str(refunded or 0)).quantize(MONEY),
            "net": (
                Decimal(str(captured or 0)) - Decimal(str(refunded or 0))
            ).quantize(MONEY),
        }
        return items, total, totals

    # -- profile -----------------------------------------------------------

    async def profile(self) -> dict:
        operator = await self.db.get(Operator, self.operator_id)
        if operator is None:
            raise NotFoundError("Operator")
        return {
            "id": operator.id,
            "name": operator.name,
            "slug": operator.slug,
            "description": operator.description,
            "logo_url": operator.logo_url,
            "contact_email": operator.contact_email,
            "contact_phone": operator.contact_phone,
            "city": operator.city,
            "country": operator.country,
            "rating": operator.rating,
            "your_role": self.membership.role,
            "your_job_title": self.membership.job_title,
        }
