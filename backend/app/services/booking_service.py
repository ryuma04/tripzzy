"""Booking: turning a planned trip into a committed, paid-for tour.

The refund arithmetic here is not incidental. It is the same calculation the
adaptation engine needs in order to answer "what does this change cost?", so
it lives in one place and is called from both: cancelling an item and
replacing an item differ in what happens next, not in what the cancellation
is worth.
"""

import secrets
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.models import (
    Booking,
    BookingItem,
    Payment,
    ServiceAvailability,
    User,
    VendorService,
)
from app.models.enums import (
    BookingItemStatus,
    BookingStatus,
    NotificationType,
    PaymentKind,
    PaymentStatus,
)
from app.schemas.booking import BookingCreateRequest, BookingItemInput
from app.services.notification_service import NotificationService
from app.services.payment_gateway import SimulatedGateway
from app.services.trip_service import TripService

MONEY = Decimal("0.01")
ZERO = Decimal("0")

# Statuses that still represent a live commitment. Anything else is already
# cancelled or superseded and must not be counted, refunded or repriced.
LIVE_ITEM_STATUSES = (BookingItemStatus.PENDING, BookingItemStatus.CONFIRMED)


def refund_due(
    item: BookingItem, *, on: date | None = None
) -> tuple[Decimal, Decimal, str]:
    """What cancelling ``item`` returns, keeps, and why.

    Uses the terms snapshotted onto the item at booking time, not the vendor's
    current policy -- the traveller is owed what was agreed when they paid.

    Returns ``(refund, penalty, explanation)``.
    """
    today = on or date.today()
    total = Decimal(str(item.total_price))

    if item.status not in LIVE_ITEM_STATUSES:
        return ZERO, ZERO, "Already cancelled or replaced; nothing to refund."

    days_ahead = (item.service_date - today).days

    if days_ahead >= item.free_cancellation_days and item.free_cancellation_days > 0:
        return total, ZERO, (
            f"Free cancellation applies: {days_ahead} days before the service, "
            f"within the {item.free_cancellation_days}-day window."
        )

    penalty_pct = item.cancellation_penalty_pct
    if penalty_pct >= 100:
        return ZERO, total, "Non-refundable rate; the full amount is retained."

    penalty = (total * Decimal(penalty_pct) / 100).quantize(MONEY)
    refund = (total - penalty).quantize(MONEY)
    reason = (
        f"{penalty_pct}% penalty applies"
        + (
            f" ({days_ahead} days before the service, inside the "
            f"{item.free_cancellation_days}-day free window)."
            if item.free_cancellation_days
            else "."
        )
    )
    return refund, penalty, reason


def refundable_cash(paid: Decimal, refund: Decimal, penalty: Decimal) -> Decimal:
    """How much money can actually go back to the card.

    The penalty is charged against what the traveller *paid*, not against the
    catalogue price. Capping at ``min(refund, paid)`` -- which is what this
    used to do -- handed back the whole deposit on a penalised cancellation:
    a 20% deposit of 10,000 on a 50,000 tour with a 30% penalty is smaller
    than the 35,000 gross refund, so the cap never bit and the 15,000 penalty
    was silently waived. The penalty comes off the cash first.
    """
    return max(ZERO, min(refund, paid - penalty)).quantize(MONEY)


def retained_penalty(item: BookingItem) -> Decimal:
    """The cancellation fee this item was charged, as recorded at the time.

    Read from the snapshot rather than recomputed: ``refund_due`` answers
    "what would cancelling cost today", and a cancelled item has no today.
    """
    raw = (item.meta or {}).get("retained_penalty")
    return Decimal(str(raw)).quantize(MONEY) if raw is not None else ZERO


def record_penalty(item: BookingItem, penalty: Decimal) -> None:
    """Snapshot a cancellation fee onto the item.

    ``meta`` is reassigned rather than mutated in place: SQLAlchemy does not
    see an edited JSONB dict as dirty, so an in-place write never reaches the
    database.
    """
    item.meta = {
        **(item.meta or {}),
        "retained_penalty": str(penalty.quantize(MONEY)),
    }


class BookingService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.trips = TripService(db)
        self.notifications = NotificationService(db)
        self.gateway = SimulatedGateway()

    # -- helpers -----------------------------------------------------------

    @staticmethod
    def _reference() -> str:
        """Short, unambiguous, quotable over the phone.

        Crockford-ish alphabet: no I, O, 0 or 1, so a reference read aloud
        cannot come back transcribed wrongly.
        """
        alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
        return "TZ" + "".join(secrets.choice(alphabet) for _ in range(8))

    async def _load(self, booking_id: uuid.UUID) -> Booking:
        """Load a booking with its items and payments, always freshly.

        ``populate_existing`` is load-bearing. Without it, re-querying a
        booking the session has already seen returns the identity-mapped
        instance with its *previously* loaded collections, so a payment added
        moments earlier is invisible. That made every response one payment
        stale -- a booking paid in full still reported an outstanding balance
        and never advanced to ``confirmed``.
        """
        booking = (
            await self.db.execute(
                select(Booking)
                .where(Booking.id == booking_id)
                .options(
                    selectinload(Booking.items),
                    selectinload(Booking.payments),
                    selectinload(Booking.trip),
                )
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        if booking is None:
            raise NotFoundError("Booking")
        return booking

    async def get_owned(self, booking_id: uuid.UUID, user: User) -> Booking:
        booking = await self._load(booking_id)
        if booking.traveller_id != user.id and not user.is_admin:
            raise ForbiddenError("This booking belongs to someone else")
        return booking

    @staticmethod
    def cancellation_fees(booking: Booking) -> Decimal:
        """Penalties this booking has already earned and will not give back."""
        return sum(
            (
                retained_penalty(i)
                for i in booking.items
                if i.status == BookingItemStatus.CANCELLED
            ),
            ZERO,
        ).quantize(MONEY)

    def _recalculate(self, booking: Booking) -> None:
        """Refresh the stored totals from the live items.

        Cancelled and replaced items leave the *subtotal*: that figure is what
        is still owed for services, not the sum of everything ever attached.
        Retained cancellation fees are added back into the *total*, because
        that money was genuinely earned and is not going anywhere. Without
        them, cancelling a 10,000 component on a 50% penalty dropped the total
        by the full 10,000 while 5,000 of penalty money stayed captured, and
        the booking reported ``amount_paid`` greater than ``total`` -- an
        overpayment that never happened, and a fee the operator's ledger had
        nowhere to put.
        """
        subtotal = sum(
            (
                Decimal(str(i.total_price))
                for i in booking.items
                if i.status in LIVE_ITEM_STATUSES
            ),
            ZERO,
        )
        booking.subtotal = subtotal.quantize(MONEY)
        booking.total = max(
            ZERO,
            (
                subtotal
                - Decimal(str(booking.discount))
                + Decimal(str(booking.tax))
                + self.cancellation_fees(booking)
            ),
        ).quantize(MONEY)

    @staticmethod
    def amount_paid(booking: Booking) -> Decimal:
        """Net captured money: captures minus refunds."""
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
                if p.kind == PaymentKind.REFUND and p.status == PaymentStatus.CAPTURED
            ),
            ZERO,
        )
        return (captured - refunded).quantize(MONEY)

    # -- quoting -----------------------------------------------------------

    async def _price_item(
        self, spec: BookingItemInput
    ) -> tuple[VendorService | None, Decimal, dict]:
        """Resolve one requested component into a priced, checked line.

        Availability is verified here rather than at payment time: quoting a
        price for something that cannot be supplied is worse than refusing.
        """
        service: VendorService | None = None
        if spec.service_id is not None:
            service = (
                await self.db.execute(
                    select(VendorService)
                    .where(VendorService.id == spec.service_id)
                    .options(selectinload(VendorService.vendor))
                )
            ).scalar_one_or_none()
            if service is None:
                raise ValidationError(
                    "That service does not exist",
                    details={"service_id": str(spec.service_id)},
                )
            if not service.is_active:
                raise ConflictError(f"{service.name} is no longer offered")

        units = max(spec.units or 1, 1)
        quantity = max(spec.quantity or 1, 1)

        if service is None:
            # A free-form line: something the operator arranges off-catalogue.
            if spec.unit_price is None:
                raise ValidationError(
                    "A custom booking line needs an explicit unit_price"
                )
            unit_price = spec.unit_price
            snapshot = {
                "title": spec.title or "Custom arrangement",
                "vendor_name": None,
                "city": spec.city,
                "free_cancellation_days": 0,
                "cancellation_penalty_pct": 0,
            }
        else:
            avail = (
                await self.db.execute(
                    select(ServiceAvailability).where(
                        ServiceAvailability.service_id == service.id,
                        ServiceAvailability.on_date == spec.service_date,
                    )
                )
            ).scalar_one_or_none()

            if avail is not None:
                if avail.is_blocked:
                    raise ConflictError(
                        f"{service.name} is not available on {spec.service_date}"
                    )
                if avail.capacity_total - avail.capacity_booked < quantity:
                    raise ConflictError(
                        f"{service.name} has only "
                        f"{avail.capacity_total - avail.capacity_booked} left on "
                        f"{spec.service_date}; {quantity} requested"
                    )

            unit_price = Decimal(
                str(
                    avail.price_override
                    if avail is not None and avail.price_override is not None
                    else service.unit_price
                )
            )
            snapshot = {
                "title": spec.title or service.name,
                "vendor_name": service.vendor.name if service.vendor else None,
                "city": service.city or spec.city,
                "free_cancellation_days": service.free_cancellation_days,
                "cancellation_penalty_pct": service.cancellation_penalty_pct,
            }

        total = (unit_price * units * quantity).quantize(MONEY)
        return service, total, {**snapshot, "unit_price": unit_price}

    async def quote(
        self, trip_id: uuid.UUID, items: Sequence[BookingItemInput], user: User
    ) -> dict:
        """Price a set of components without committing to anything."""
        trip = await self.trips.get_owned(trip_id, user)
        lines = []
        subtotal = ZERO
        for spec in items:
            service, total, snap = await self._price_item(spec)
            subtotal += total
            lines.append(
                {
                    "service_id": service.id if service else None,
                    "component_type": spec.component_type,
                    "title": snap["title"],
                    "vendor_name": snap["vendor_name"],
                    "city": snap["city"],
                    "service_date": spec.service_date,
                    "quantity": max(spec.quantity or 1, 1),
                    "units": max(spec.units or 1, 1),
                    "unit_price": snap["unit_price"],
                    "total_price": total,
                    "free_cancellation_days": snap["free_cancellation_days"],
                    "cancellation_penalty_pct": snap["cancellation_penalty_pct"],
                }
            )
        return {
            "trip_id": trip.id,
            "currency": trip.currency or settings.DEFAULT_CURRENCY,
            "items": lines,
            "subtotal": subtotal.quantize(MONEY),
            "total": subtotal.quantize(MONEY),
        }

    # -- writes ------------------------------------------------------------

    async def create(
        self, trip_id: uuid.UUID, payload: BookingCreateRequest, user: User
    ) -> dict:
        trip = await self.trips.get_owned(trip_id, user)

        booking = Booking(
            trip_id=trip.id,
            traveller_id=user.id,
            operator_id=payload.operator_id,
            reference=self._reference(),
            status=BookingStatus.DRAFT,
            currency=trip.currency or settings.DEFAULT_CURRENCY,
            notes=payload.notes,
        )
        self.db.add(booking)
        await self.db.flush()

        for spec in payload.items:
            service, total, snap = await self._price_item(spec)
            self.db.add(
                BookingItem(
                    booking_id=booking.id,
                    service_id=service.id if service else None,
                    stop_id=spec.stop_id,
                    itinerary_activity_id=spec.itinerary_activity_id,
                    component_type=spec.component_type,
                    title=snap["title"][:200],
                    vendor_name=snap["vendor_name"],
                    city=snap["city"],
                    service_date=spec.service_date,
                    end_date=spec.end_date,
                    start_time=spec.start_time,
                    end_time=spec.end_time,
                    quantity=max(spec.quantity or 1, 1),
                    units=max(spec.units or 1, 1),
                    unit_price=snap["unit_price"],
                    total_price=total,
                    free_cancellation_days=snap["free_cancellation_days"],
                    cancellation_penalty_pct=snap["cancellation_penalty_pct"],
                    notes=spec.notes,
                )
            )

        await self.db.flush()
        booking = await self._load(booking.id)
        self._recalculate(booking)
        await self.db.commit()
        return self.serialise(await self._load(booking.id))

    async def pay(
        self,
        booking_id: uuid.UUID,
        user: User,
        *,
        amount: Decimal | None = None,
        method: str = "card",
        kind: PaymentKind = PaymentKind.FULL,
    ) -> dict:
        """Take a payment, walking the gateway's full state machine.

        A partial amount is a deposit: the booking stays
        ``pending_payment`` until the balance clears, which is what lets an
        operator hold a tour on a deposit.
        """
        # Lock the row before reading the balance. Without this, a double
        # click -- or two people in a group settling from two devices -- has
        # both requests read the same outstanding amount, both authorise, and
        # both capture. The traveller is charged twice for one booking and
        # ``amount_paid`` ends up at double the total.
        await self.db.execute(
            select(Booking.id).where(Booking.id == booking_id).with_for_update()
        )

        booking = await self.get_owned(booking_id, user)
        if booking.status == BookingStatus.CANCELLED:
            raise ConflictError("This booking has been cancelled")
        if not booking.items:
            raise ValidationError("There is nothing on this booking to pay for")

        outstanding = (
            Decimal(str(booking.total)) - self.amount_paid(booking)
        ).quantize(MONEY)
        if outstanding <= 0:
            raise ConflictError("This booking is already paid in full")

        charge = (amount if amount is not None else outstanding).quantize(MONEY)
        if charge <= 0:
            raise ValidationError("A payment has to be for more than zero")
        if charge > outstanding:
            raise ValidationError(
                f"That is more than the {booking.currency} {outstanding} outstanding"
            )

        # Inventory is checked when the booking is drafted, but a draft can
        # sit for hours before anyone pays. Re-check now, while refusing is
        # still free: declining here costs the traveller nothing, whereas
        # discovering it after ``capture`` means they have paid for a room the
        # vendor cannot supply.
        await self._assert_capacity(booking)

        payment = Payment(
            booking_id=booking.id,
            amount=charge,
            currency=booking.currency,
            kind=kind if charge == outstanding else PaymentKind.DEPOSIT,
            status=PaymentStatus.INITIATED,
            method=method,
        )
        self.db.add(payment)

        auth = self.gateway.authorize(charge, method)
        if not auth.approved:
            payment.status = PaymentStatus.FAILED
            payment.failure_reason = auth.failure_reason
            payment.gateway_reference = auth.reference
            booking.status = BookingStatus.PENDING_PAYMENT
            await self.db.commit()
            raise ConflictError(
                auth.failure_reason or "The payment was declined",
                details={"payment_id": str(payment.id)},
            )

        now = datetime.now(timezone.utc)
        payment.status = PaymentStatus.AUTHORIZED
        payment.authorized_at = now

        capture = self.gateway.capture(auth.reference)
        payment.status = PaymentStatus.CAPTURED
        payment.captured_at = now
        payment.gateway_reference = capture.reference

        await self.db.flush()
        booking = await self._load(booking.id)

        # Confirm only once the whole balance has cleared.
        if self.amount_paid(booking) >= Decimal(str(booking.total)):
            booking.status = BookingStatus.CONFIRMED
            booking.confirmed_at = now
            booking.placed_at = booking.placed_at or now
            for item in booking.items:
                if item.status == BookingItemStatus.PENDING:
                    item.status = BookingItemStatus.CONFIRMED
            await self._reserve_capacity(booking)
            await self.notifications.create(
                user_id=booking.traveller_id,
                type=NotificationType.SYSTEM,
                title=f"Booking {booking.reference} confirmed",
                body=(
                    f"Your tour is confirmed. {booking.currency} "
                    f"{booking.total} paid in full."
                ),
                payload={"booking_id": str(booking.id), "trip_id": str(booking.trip_id)},
                link=f"/trips/{booking.trip_id}",
            )
        else:
            booking.status = BookingStatus.PENDING_PAYMENT
            booking.placed_at = booking.placed_at or now

        await self.db.commit()
        return self.serialise(await self._load(booking.id))

    async def _assert_capacity(self, booking: Booking) -> None:
        """Refuse to take money for inventory that has since gone.

        The availability rows are locked as they are read, so two payments
        racing for the last seat serialise here rather than both clamping
        against ``capacity_total`` in ``_reserve_capacity`` and quietly
        overbooking the vendor.
        """
        for item in booking.items:
            if item.status not in LIVE_ITEM_STATUSES or item.service_id is None:
                continue
            avail = (
                await self.db.execute(
                    select(ServiceAvailability)
                    .where(
                        ServiceAvailability.service_id == item.service_id,
                        ServiceAvailability.on_date == item.service_date,
                    )
                    .with_for_update()
                )
            ).scalar_one_or_none()
            # No published limit for that date means there is no limit to hit.
            if avail is None:
                continue
            if avail.is_blocked:
                raise ConflictError(
                    f"{item.title} is no longer available on {item.service_date}. "
                    "Nothing has been charged."
                )
            remaining = avail.capacity_total - avail.capacity_booked
            if remaining < item.quantity:
                raise ConflictError(
                    f"{item.title} has only {max(0, remaining)} left on "
                    f"{item.service_date} but {item.quantity} are on this booking. "
                    "Nothing has been charged -- adjust or remove the component "
                    "and try again.",
                    details={
                        "item_id": str(item.id),
                        "requested": item.quantity,
                        "remaining": max(0, remaining),
                    },
                )

    async def _reserve_capacity(self, booking: Booking) -> None:
        """Consume published capacity for every confirmed item.

        Only touches dates an operator has actually published a limit for;
        a service with no row for the date has no limit to consume.
        """
        for item in booking.items:
            if item.status != BookingItemStatus.CONFIRMED or item.service_id is None:
                continue
            avail = (
                await self.db.execute(
                    select(ServiceAvailability).where(
                        ServiceAvailability.service_id == item.service_id,
                        ServiceAvailability.on_date == item.service_date,
                    )
                )
            ).scalar_one_or_none()
            if avail is None:
                continue
            avail.capacity_booked = min(
                avail.capacity_total, avail.capacity_booked + item.quantity
            )

    async def _release_capacity(self, item: BookingItem) -> None:
        """Hand a seat back to the pool when an item stops being live."""
        if item.service_id is None:
            return
        avail = (
            await self.db.execute(
                select(ServiceAvailability).where(
                    ServiceAvailability.service_id == item.service_id,
                    ServiceAvailability.on_date == item.service_date,
                )
            )
        ).scalar_one_or_none()
        if avail is not None:
            avail.capacity_booked = max(0, avail.capacity_booked - item.quantity)

    async def cancel_item(
        self, booking_id: uuid.UUID, item_id: uuid.UUID, user: User
    ) -> dict:
        """Cancel one component and refund what its terms allow."""
        await self.db.execute(
            select(Booking.id).where(Booking.id == booking_id).with_for_update()
        )
        booking = await self.get_owned(booking_id, user)
        item = next((i for i in booking.items if i.id == item_id), None)
        if item is None:
            raise NotFoundError("Booking item")
        if item.status not in LIVE_ITEM_STATUSES:
            raise ConflictError("That component is already cancelled or replaced")

        refund, penalty, reason = refund_due(item)
        paid = self.amount_paid(booking)
        refunded = await self._refund(
            booking, refundable_cash(paid, refund, penalty), what=item.title
        )

        # Only now is anything changed: the gateway has either returned the
        # money or raised, so the component is never left cancelled with the
        # refund still outstanding.
        item.status = BookingItemStatus.CANCELLED
        if paid > 0:
            record_penalty(item, penalty)

        await self._release_capacity(item)

        await self.db.flush()
        booking = await self._load(booking.id)
        self._recalculate(booking)

        if all(i.status not in LIVE_ITEM_STATUSES for i in booking.items):
            booking.status = BookingStatus.CANCELLED
            booking.cancelled_at = datetime.now(timezone.utc)

        await self.db.commit()
        payload = self.serialise(await self._load(booking.id))
        payload["cancellation"] = {
            "refunded": refunded,
            "penalty": penalty,
            "explanation": reason,
        }
        return payload

    async def _refund(
        self, booking: Booking, amount: Decimal, *, what: str
    ) -> Decimal:
        """Return money to the traveller, or refuse to proceed without it.

        A declined refund used to be recorded as a failed payment row and then
        ignored: the booking was cancelled, the seats released and the caller
        got a 200, while the traveller had lost the tour and never seen the
        money. The failed attempt is still written to the ledger -- support
        needs the gateway reference -- but it is committed on its own and the
        cancellation is abandoned, so nothing is given up in exchange for a
        refund that did not happen.
        """
        if amount <= 0:
            return ZERO

        result = self.gateway.refund("", amount)
        self.db.add(
            Payment(
                booking_id=booking.id,
                amount=amount,
                currency=booking.currency,
                kind=PaymentKind.REFUND,
                status=(
                    PaymentStatus.CAPTURED if result.approved else PaymentStatus.FAILED
                ),
                method="refund",
                gateway_reference=result.reference,
                refunded_at=datetime.now(timezone.utc),
            )
        )

        if not result.approved:
            # Persist the failed attempt, then stop: the item and the booking
            # are still untouched at this point.
            await self.db.commit()
            raise ConflictError(
                f"The refund of {booking.currency} {amount} for {what} was declined "
                "by the payment gateway, so nothing has been cancelled. The booking "
                "is unchanged. Please try again, or quote the gateway reference to "
                "support.",
                details={
                    "gateway_reference": result.reference,
                    "failure_reason": result.failure_reason,
                    "amount": str(amount),
                },
            )

        return amount

    async def cancel(self, booking_id: uuid.UUID, user: User) -> dict:
        """Cancel every live component, refunding each on its own terms."""
        await self.db.execute(
            select(Booking.id).where(Booking.id == booking_id).with_for_update()
        )
        booking = await self.get_owned(booking_id, user)
        live = [i for i in booking.items if i.status in LIVE_ITEM_STATUSES]
        if not live:
            raise ConflictError("This booking is already cancelled")

        total_refund = ZERO
        total_penalty = ZERO
        terms = []
        for item in live:
            refund, penalty, _ = refund_due(item)
            total_refund += refund
            total_penalty += penalty
            terms.append((item, penalty))

        paid = self.amount_paid(booking)
        total_penalty = total_penalty.quantize(MONEY)
        refundable = await self._refund(
            booking,
            refundable_cash(paid, total_refund, total_penalty),
            what=f"booking {booking.reference}",
        )

        for item, penalty in terms:
            item.status = BookingItemStatus.CANCELLED
            if paid > 0:
                record_penalty(item, penalty)
            # Cancelling the whole booking released no inventory at all, so a
            # cancelled tour went on consuming the vendor's capacity forever.
            await self._release_capacity(item)

        booking.status = BookingStatus.CANCELLED
        booking.cancelled_at = datetime.now(timezone.utc)
        await self.db.flush()
        booking = await self._load(booking.id)
        self._recalculate(booking)
        await self.db.commit()

        payload = self.serialise(await self._load(booking.id))
        payload["cancellation"] = {
            "refunded": refundable,
            "penalty": total_penalty,
            "explanation": (
                f"{len(live)} component(s) cancelled; "
                f"{booking.currency} {total_penalty} retained in penalties."
            ),
        }
        return payload

    # -- reads -------------------------------------------------------------

    def serialise(self, booking: Booking) -> dict:
        paid = self.amount_paid(booking)
        total = Decimal(str(booking.total))
        return {
            "id": booking.id,
            "reference": booking.reference,
            "trip_id": booking.trip_id,
            "trip_title": booking.trip.title if booking.trip else None,
            "traveller_id": booking.traveller_id,
            "operator_id": booking.operator_id,
            "status": booking.status,
            "currency": booking.currency,
            "subtotal": Decimal(str(booking.subtotal)),
            "discount": Decimal(str(booking.discount)),
            "tax": Decimal(str(booking.tax)),
            "total": total,
            "amount_paid": paid,
            "amount_outstanding": max(ZERO, total - paid).quantize(MONEY),
            "cancellation_fees": self.cancellation_fees(booking),
            "notes": booking.notes,
            "placed_at": booking.placed_at,
            "confirmed_at": booking.confirmed_at,
            "cancelled_at": booking.cancelled_at,
            "items": [
                {
                    "id": i.id,
                    "service_id": i.service_id,
                    "stop_id": i.stop_id,
                    "component_type": i.component_type,
                    "title": i.title,
                    "vendor_name": i.vendor_name,
                    "city": i.city,
                    "service_date": i.service_date,
                    "end_date": i.end_date,
                    "start_time": i.start_time,
                    "end_time": i.end_time,
                    "quantity": i.quantity,
                    "units": i.units,
                    "unit_price": Decimal(str(i.unit_price)),
                    "total_price": Decimal(str(i.total_price)),
                    "free_cancellation_days": i.free_cancellation_days,
                    "cancellation_penalty_pct": i.cancellation_penalty_pct,
                    "status": i.status,
                    "replaced_by_item_id": i.replaced_by_item_id,
                    "notes": i.notes,
                }
                for i in sorted(booking.items, key=lambda x: x.service_date)
            ],
            "payments": [
                {
                    "id": p.id,
                    "amount": Decimal(str(p.amount)),
                    "currency": p.currency,
                    "kind": p.kind,
                    "status": p.status,
                    "method": p.method,
                    "gateway_reference": p.gateway_reference,
                    "failure_reason": p.failure_reason,
                    "created_at": p.created_at,
                }
                for p in sorted(booking.payments, key=lambda x: x.created_at)
            ],
            "created_at": booking.created_at,
            "updated_at": booking.updated_at,
        }

    async def get(self, booking_id: uuid.UUID, user: User) -> dict:
        return self.serialise(await self.get_owned(booking_id, user))

    async def list_for_user(
        self, user: User, *, offset: int, limit: int
    ) -> tuple[list[dict], int]:
        total = (
            await self.db.execute(
                select(func.count())
                .select_from(Booking)
                .where(Booking.traveller_id == user.id)
            )
        ).scalar_one()
        rows = (
            (
                await self.db.execute(
                    select(Booking)
                    .where(Booking.traveller_id == user.id)
                    .options(
                        selectinload(Booking.items),
                        selectinload(Booking.payments),
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
        return [self.serialise(b) for b in rows], total
