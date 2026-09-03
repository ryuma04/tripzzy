"""Dynamic tour management: costing a change before anybody commits to it.

This is the differentiator. Everything else in the platform describes a tour
that is going to plan; this describes what happens when it is not.

The shape of the answer is always the same, whatever went wrong. A proposed
change is turned into an **impact report**: what it costs, what it breaks,
whether the replacement is actually available, how well it fits what the
traveller asked for, and what the alternatives are. The report is deterministic
and every figure in it is traceable to a row -- a snapshotted cancellation
policy, a published price override, a capacity count. The AI layer narrates
that report; it never produces it. When a model and this module disagree about
a number, this module is right.

Three properties are load-bearing:

**Assessment never writes.** ``assess`` simulates the proposed state in memory
to run the conflict checks against it, then discards the simulation. A
traveller previewing "what if I move this to Thursday" must not move anything.

**The report is snapshotted at submission.** Prices and availability move
between a traveller submitting and an operator reviewing. The stored report is
what was agreed; the live one is only ever a preview.

**Application is one transaction.** A change that cancels a hotel, books a
replacement, refunds the difference and rewrites the itinerary either does all
of it or none of it. A half-applied change is worse than a rejected one --
it leaves a traveller with no bed and no refund.
"""

import logging
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Sequence

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.models import (
    Booking,
    BookingItem,
    ChangeRequest,
    Disruption,
    OperatorMember,
    Payment,
    ServiceAvailability,
    Trip,
    User,
    Vendor,
    VendorService,
)
from app.models.enums import (
    BookingItemStatus,
    BookingStatus,
    ChangeRequestStatus,
    ChangeRequestType,
    ConflictSeverity,
    DisruptionSeverity,
    DisruptionStatus,
    DisruptionType,
    NotificationType,
    PaymentKind,
    PaymentStatus,
)
from app.services.booking_service import (
    LIVE_ITEM_STATUSES,
    MONEY,
    ZERO,
    BookingService,
    refund_due,
)
from app.services.conflict_service import Conflict, ConflictService, _ordered
from app.services.inventory_service import InventoryService
from app.services.notification_service import NotificationService
from app.services.payment_gateway import SimulatedGateway

logger = logging.getLogger(__name__)

# A disruption at this severity makes the affected components unusable rather
# than merely risky, so the engine proposes replacing them instead of asking.
FORCING_SEVERITIES = (DisruptionSeverity.HIGH, DisruptionSeverity.CRITICAL)


# ---------------------------------------------------------------------------
# The report
# ---------------------------------------------------------------------------


@dataclass
class AffectedItem:
    """One booked component and what the change does to it.

    ``action`` is the engine's decision, not a request: ``reprice`` means the
    same service on a different date at a different rate, ``replace`` means a
    different service entirely, and ``cancel`` means the slot goes away. They
    cost different amounts and read differently in the report, so they are
    named rather than inferred from the numbers.
    """

    item_id: uuid.UUID
    title: str
    component_type: str
    service_date: date
    action: str
    original_cost: Decimal
    refund: Decimal
    penalty: Decimal
    replacement_cost: Decimal
    new_date: date | None = None
    new_service_id: uuid.UUID | None = None
    new_title: str | None = None
    note: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "item_id": str(self.item_id),
            "title": self.title,
            "component_type": self.component_type,
            "service_date": self.service_date.isoformat(),
            "action": self.action,
            "original_cost": str(self.original_cost),
            "refund": str(self.refund),
            "penalty": str(self.penalty),
            "replacement_cost": str(self.replacement_cost),
            "new_date": self.new_date.isoformat() if self.new_date else None,
            "new_service_id": str(self.new_service_id) if self.new_service_id else None,
            "new_title": self.new_title,
            "note": self.note,
        }


@dataclass
class ImpactReport:
    """What a change costs, breaks, and can be done about.

    Deliberately a plain dataclass rather than a Pydantic model: it is built
    by the engine, stored verbatim as JSONB, and read back by both the API and
    the console. Keeping it dumb means the stored form and the live form are
    the same object, and a report written six weeks ago still parses.
    """

    change_type: ChangeRequestType
    currency: str
    feasible: bool = True
    summary: str = ""
    refund_total: Decimal = ZERO
    penalty_total: Decimal = ZERO
    replacement_total: Decimal = ZERO
    original_total: Decimal = ZERO
    affected: list[AffectedItem] = field(default_factory=list)
    conflicts: list[Conflict] = field(default_factory=list)
    availability: list[dict[str, Any]] = field(default_factory=list)
    alternatives: list[dict[str, Any]] = field(default_factory=list)
    preference_fit: dict[str, Any] | None = None
    blockers: list[str] = field(default_factory=list)

    @property
    def net_delta(self) -> Decimal:
        """What the traveller is out of pocket, net of anything returned.

        Penalties are not added on top: a penalty is the part of the original
        price that is *not* refunded, so counting it separately would charge
        the traveller for it twice.
        """
        return (self.replacement_total - self.refund_total).quantize(MONEY)

    def as_dict(self) -> dict[str, Any]:
        """The report as JSON-safe primitives.

        Coerced through ``_jsonable`` on the way out because the ranked
        alternatives arrive from the inventory ranker carrying live UUIDs and
        Decimals, and this dict is written straight into a JSONB column. Money
        becomes a string rather than a float, as it does everywhere else here.
        """
        delta = self.net_delta
        return _jsonable({
            "change_type": self.change_type.value,
            "currency": self.currency,
            "feasible": self.feasible,
            "summary": self.summary,
            "cost": {
                "original_total": str(self.original_total),
                "refund_total": str(self.refund_total),
                "penalty_total": str(self.penalty_total),
                "replacement_total": str(self.replacement_total),
                "net_delta": str(delta),
                "direction": (
                    "increase" if delta > 0 else "decrease" if delta < 0 else "none"
                ),
            },
            "affected_items": [a.as_dict() for a in self.affected],
            "conflicts": [c.as_dict() for c in self.conflicts],
            "availability": self.availability,
            "alternatives": self.alternatives,
            "preference_fit": self.preference_fit,
            "blockers": self.blockers,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        })


# ---------------------------------------------------------------------------
# The engine
# ---------------------------------------------------------------------------


class AdaptationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.conflicts = ConflictService(db)
        self.inventory = InventoryService(db)
        self.notifications = NotificationService(db)
        self.bookings = BookingService(db)
        self.gateway = SimulatedGateway()

    # -- loading -----------------------------------------------------------

    async def _trip(self, trip_id: uuid.UUID, user: User) -> Trip:
        trip = await self.conflicts.load(trip_id)
        if trip is None or trip.deleted_at is not None:
            raise NotFoundError("Trip")
        if trip.user_id != user.id and not user.is_admin:
            raise ForbiddenError("This trip belongs to someone else")
        return trip

    async def _live_items(self, trip_id: uuid.UUID) -> list[BookingItem]:
        return list(
            (
                await self.db.execute(
                    select(BookingItem)
                    .join(Booking, BookingItem.booking_id == Booking.id)
                    .where(
                        Booking.trip_id == trip_id,
                        Booking.status != BookingStatus.CANCELLED,
                        BookingItem.status.in_(LIVE_ITEM_STATUSES),
                    )
                    .options(selectinload(BookingItem.booking))
                    .order_by(BookingItem.service_date)
                )
            )
            .scalars()
            .all()
        )

    async def _item(self, item_id: uuid.UUID, trip: Trip) -> BookingItem:
        item = (
            await self.db.execute(
                select(BookingItem)
                .join(Booking, BookingItem.booking_id == Booking.id)
                .where(BookingItem.id == item_id, Booking.trip_id == trip.id)
                .options(
                    selectinload(BookingItem.booking),
                    selectinload(BookingItem.service),
                )
            )
        ).scalar_one_or_none()
        if item is None:
            raise NotFoundError("Booking item")
        return item

    async def _service(self, service_id: uuid.UUID) -> VendorService:
        service = (
            await self.db.execute(
                select(VendorService)
                .where(VendorService.id == service_id)
                .options(selectinload(VendorService.vendor))
            )
        ).scalar_one_or_none()
        if service is None:
            raise ValidationError(
                "That service does not exist", details={"service_id": str(service_id)}
            )
        return service

    async def _operator_for_item(self, item: BookingItem) -> uuid.UUID | None:
        """Who has to decide on a change to this component.

        A booking placed directly by a traveller carries no ``operator_id``,
        but its components still came out of some operator's catalogue -- and
        that operator is the one who has to honour or refuse the change. So
        when the booking does not name one, it is derived from the vendor
        behind the service. Without this, a self-booked tour raises change
        requests that land in nobody's queue.
        """
        if item.service_id is None:
            return None
        return await self.db.scalar(
            select(Vendor.operator_id)
            .join(VendorService, VendorService.vendor_id == Vendor.id)
            .where(VendorService.id == item.service_id)
        )

    async def _availability(
        self, service_id: uuid.UUID, on_date: date
    ) -> ServiceAvailability | None:
        return (
            await self.db.execute(
                select(ServiceAvailability).where(
                    ServiceAvailability.service_id == service_id,
                    ServiceAvailability.on_date == on_date,
                )
            )
        ).scalar_one_or_none()

    # -- pricing -----------------------------------------------------------

    async def _price_on(
        self,
        service: VendorService,
        on_date: date,
        *,
        quantity: int,
        units: int,
    ) -> tuple[Decimal, Decimal, dict[str, Any]]:
        """Price one service on one date, and say whether it can be had.

        Returns ``(unit_price, total, availability_note)``. The note is what
        goes into the report's availability section: a missing availability row
        is *not* scarcity -- it means the operator publishes no limit for that
        date, which is the ordinary case.
        """
        avail = await self._availability(service.id, on_date)
        unit_price = Decimal(str(service.unit_price))
        seats_left: int | None = None
        available = True
        reason: str | None = None

        if avail is not None:
            if avail.price_override is not None:
                unit_price = Decimal(str(avail.price_override))
            seats_left = avail.capacity_total - avail.capacity_booked
            if avail.is_blocked:
                available = False
                reason = f"{service.name} is closed on {on_date}."
            elif seats_left < quantity:
                available = False
                reason = (
                    f"{service.name} has {seats_left} left on {on_date}; "
                    f"{quantity} needed."
                )

        total = (unit_price * max(quantity, 1) * max(units, 1)).quantize(MONEY)
        note = {
            "service_id": str(service.id),
            "name": service.name,
            "on_date": on_date.isoformat(),
            "available": available,
            "seats_left": seats_left,
            "unit_price": str(unit_price),
            "reason": reason,
        }
        return unit_price, total, note

    # -- simulation --------------------------------------------------------

    async def _conflicts_after_shift(
        self, trip: Trip, shift: int, items: Sequence[BookingItem]
    ) -> list[Conflict]:
        """Run the conflict checks against the *shifted* itinerary.

        The trip is moved in memory, checked, and put back. ``no_autoflush``
        is what makes that safe: without it, any query issued during the checks
        would flush the pending date changes to the database, and a preview
        would silently become an edit. ``expire_all`` then discards the
        in-memory mutation so nothing downstream sees a trip that never moved.
        """
        delta = timedelta(days=shift)
        try:
            with self.db.no_autoflush:
                trip.start_date += delta
                trip.end_date += delta
                for stop in trip.stops:
                    stop.arrival_date += delta
                    stop.departure_date += delta
                    for activity in stop.activities:
                        activity.activity_date += delta
                    for stay in stop.accommodations:
                        stay.check_in += delta
                        stay.check_out += delta
                for leg in trip.transports:
                    leg.departure_time += delta
                    leg.arrival_time += delta

                stops = list(trip.stops)
                found = [
                    *self.conflicts.stop_conflicts(stops),
                    *self.conflicts.activity_conflicts(stops),
                    *self.conflicts.accommodation_conflicts(stops),
                    *self.conflicts.transport_conflicts(list(trip.transports), stops),
                ]
                # The booked components have not moved with the itinerary yet;
                # that is precisely the breakage worth reporting, and it is
                # what the replacement lines in the report are paying to fix.
                found.extend(
                    self.conflicts.booking_conflicts(
                        [i for i in items if i.service_date < trip.start_date
                         or i.service_date > trip.end_date],
                        trip,
                    )
                )
                return _ordered(found)
        finally:
            self.db.expire_all()

    # -- assessment --------------------------------------------------------

    async def assess(
        self, trip_id: uuid.UUID, proposal: dict[str, Any], change_type: ChangeRequestType, user: User
    ) -> ImpactReport:
        """Cost a proposed change without changing anything."""
        trip = await self._trip(trip_id, user)
        currency = trip.currency or "INR"

        handlers = {
            ChangeRequestType.DATE_SHIFT: self._assess_date_shift,
            ChangeRequestType.REPLACE_COMPONENT: self._assess_replace,
            ChangeRequestType.CANCEL_COMPONENT: self._assess_cancel,
            ChangeRequestType.ADD_COMPONENT: self._assess_add,
            ChangeRequestType.PARTY_SIZE: self._assess_party_size,
        }
        report = await handlers[change_type](trip, proposal, user, currency)
        report.blockers = [
            c.message for c in report.conflicts if c.severity is ConflictSeverity.BLOCKER
        ]
        return report

    async def _assess_date_shift(
        self, trip: Trip, proposal: dict[str, Any], user: User, currency: str
    ) -> ImpactReport:
        """Moving the whole trip. The most expensive change there is.

        A booked component cannot be *moved*: the vendor sold a specific date.
        Shifting therefore costs a cancellation on the old date plus the going
        rate on the new one, which is why seasonal pricing shows up here as a
        real number rather than a footnote.
        """
        shift = int(proposal["shift_days"])
        if shift == 0:
            raise ValidationError("A date shift of zero days changes nothing")

        report = ImpactReport(change_type=ChangeRequestType.DATE_SHIFT, currency=currency)
        items = await self._live_items(trip.id)

        for item in items:
            new_date = item.service_date + timedelta(days=shift)
            refund, penalty, why = refund_due(item)
            original = Decimal(str(item.total_price))

            report.original_total += original
            report.refund_total += refund
            report.penalty_total += penalty

            if item.service_id is None:
                # An off-catalogue line has no published rate to look up, so
                # the fairest assumption is that it costs what it cost.
                report.replacement_total += original
                report.affected.append(
                    AffectedItem(
                        item_id=item.id,
                        title=item.title,
                        component_type=item.component_type.value,
                        service_date=item.service_date,
                        action="reprice",
                        original_cost=original,
                        refund=refund,
                        penalty=penalty,
                        replacement_cost=original,
                        new_date=new_date,
                        note="Arranged off-catalogue; re-quoted at the same rate.",
                    )
                )
                continue

            service = await self._service(item.service_id)
            _, total, note = await self._price_on(
                service, new_date, quantity=item.quantity, units=item.units
            )
            report.availability.append(note)

            if note["available"]:
                report.replacement_total += total
                report.affected.append(
                    AffectedItem(
                        item_id=item.id,
                        title=item.title,
                        component_type=item.component_type.value,
                        service_date=item.service_date,
                        action="reprice",
                        original_cost=original,
                        refund=refund,
                        penalty=penalty,
                        replacement_cost=total,
                        new_date=new_date,
                        new_service_id=service.id,
                        new_title=service.name,
                        note=why if penalty > 0 else None,
                    )
                )
            else:
                # Cannot be rebooked on the new date, so it has to be replaced.
                # The ranked alternatives are what makes that answerable rather
                # than merely reported.
                options = await self.inventory.find_alternatives(
                    service_type=service.service_type,
                    city=service.city,
                    on_date=new_date,
                    quantity=item.quantity,
                    nights=item.units,
                    exclude_service_id=service.id,
                    user_id=user.id,
                    limit=3,
                )
                replacement = Decimal(str(options[0]["total_price"])) if options else ZERO
                report.replacement_total += replacement
                report.alternatives.extend(options)
                if not options:
                    report.feasible = False
                report.affected.append(
                    AffectedItem(
                        item_id=item.id,
                        title=item.title,
                        component_type=item.component_type.value,
                        service_date=item.service_date,
                        action="replace" if options else "cancel",
                        original_cost=original,
                        refund=refund,
                        penalty=penalty,
                        replacement_cost=replacement,
                        new_date=new_date,
                        new_service_id=(
                            uuid.UUID(str(options[0]["service_id"])) if options else None
                        ),
                        new_title=options[0]["name"] if options else None,
                        note=note["reason"],
                    )
                )

        report.conflicts = await self._conflicts_after_shift(trip, shift, items)
        direction = "later" if shift > 0 else "earlier"
        report.summary = (
            f"Moving the trip {abs(shift)} day(s) {direction} affects "
            f"{len(report.affected)} booked component(s)."
            if report.affected
            else (
                f"Moving the trip {abs(shift)} day(s) {direction}. Nothing is "
                f"booked yet, so there is nothing to reprice."
            )
        )
        return report

    async def _assess_replace(
        self, trip: Trip, proposal: dict[str, Any], user: User, currency: str
    ) -> ImpactReport:
        """Swapping one component for another."""
        item = await self._item(uuid.UUID(str(proposal["booking_item_id"])), trip)
        if item.status not in LIVE_ITEM_STATUSES:
            raise ConflictError("That component is already cancelled or replaced")

        new_date = (
            date.fromisoformat(str(proposal["new_date"]))
            if proposal.get("new_date")
            else item.service_date
        )
        report = ImpactReport(
            change_type=ChangeRequestType.REPLACE_COMPONENT, currency=currency
        )

        refund, penalty, why = refund_due(item)
        original = Decimal(str(item.total_price))
        report.original_total = original
        report.refund_total = refund
        report.penalty_total = penalty

        # Rank the whole slot, then find the proposal inside it. That is what
        # lets the report say how the chosen option compares rather than only
        # what it costs -- and it is the same ranking the traveller was shown.
        ranked = await self.inventory.find_alternatives(
            service_type=item.component_type,
            city=item.city,
            on_date=new_date,
            quantity=item.quantity,
            nights=item.units,
            exclude_service_id=item.service_id,
            user_id=user.id,
            limit=8,
        )

        new_service_id = proposal.get("new_service_id")
        if new_service_id is None:
            # No preference stated: this is a "find me something else" request,
            # and the report is the ranked shortlist itself.
            report.alternatives = ranked
            report.feasible = bool(ranked)
            report.summary = (
                f"{len(ranked)} alternative(s) found for {item.title}."
                if ranked
                else f"No alternative to {item.title} is available on {new_date}."
            )
            report.affected.append(
                AffectedItem(
                    item_id=item.id,
                    title=item.title,
                    component_type=item.component_type.value,
                    service_date=item.service_date,
                    action="replace",
                    original_cost=original,
                    refund=refund,
                    penalty=penalty,
                    replacement_cost=ZERO,
                    new_date=new_date,
                    note=why,
                )
            )
            return report

        service = await self._service(uuid.UUID(str(new_service_id)))
        if service.id == item.service_id and new_date == item.service_date:
            raise ValidationError("That is the component you already have")

        _, total, note = await self._price_on(
            service, new_date, quantity=item.quantity, units=item.units
        )
        report.availability.append(note)
        report.replacement_total = total
        report.feasible = bool(note["available"])
        report.alternatives = [o for o in ranked if str(o["service_id"]) != str(service.id)][:5]

        chosen = next((o for o in ranked if str(o["service_id"]) == str(service.id)), None)
        if chosen is not None:
            report.preference_fit = {
                "score": chosen["match_score"],
                "reasons": chosen["match_reasons"],
                "notes": chosen["notes"],
            }

        report.affected.append(
            AffectedItem(
                item_id=item.id,
                title=item.title,
                component_type=item.component_type.value,
                service_date=item.service_date,
                action="replace",
                original_cost=original,
                refund=refund,
                penalty=penalty,
                replacement_cost=total,
                new_date=new_date,
                new_service_id=service.id,
                new_title=service.name,
                note=note["reason"] or why,
            )
        )
        if not note["available"]:
            report.conflicts.append(
                Conflict(
                    code="REPLACEMENT_UNAVAILABLE",
                    severity=ConflictSeverity.BLOCKER,
                    message=note["reason"] or f"{service.name} cannot be booked.",
                    entity="vendor_service",
                    entity_id=service.id,
                    on_date=new_date,
                )
            )

        delta = report.net_delta
        report.summary = (
            f"Replacing {item.title} with {service.name}"
            + (f" on {new_date}" if new_date != item.service_date else "")
            + (
                f" costs {currency} {abs(delta)} more."
                if delta > 0
                else f" saves {currency} {abs(delta)}."
                if delta < 0
                else " costs the same."
            )
        )
        return report

    async def _assess_cancel(
        self, trip: Trip, proposal: dict[str, Any], user: User, currency: str
    ) -> ImpactReport:
        """Dropping a component. Nothing is bought, so the delta is the refund."""
        item = await self._item(uuid.UUID(str(proposal["booking_item_id"])), trip)
        if item.status not in LIVE_ITEM_STATUSES:
            raise ConflictError("That component is already cancelled or replaced")

        refund, penalty, why = refund_due(item)
        original = Decimal(str(item.total_price))

        report = ImpactReport(
            change_type=ChangeRequestType.CANCEL_COMPONENT,
            currency=currency,
            original_total=original,
            refund_total=refund,
            penalty_total=penalty,
        )
        report.affected.append(
            AffectedItem(
                item_id=item.id,
                title=item.title,
                component_type=item.component_type.value,
                service_date=item.service_date,
                action="cancel",
                original_cost=original,
                refund=refund,
                penalty=penalty,
                replacement_cost=ZERO,
                note=why,
            )
        )

        # Cancelling accommodation or transport can strand whatever depended on
        # it, and that is worth saying before the refund figure reassures
        # somebody into confirming.
        remaining = [
            i
            for i in await self._live_items(trip.id)
            if i.id != item.id and i.service_date == item.service_date
        ]
        if item.component_type.value == "accommodation" and remaining:
            report.conflicts.append(
                Conflict(
                    code="DEPENDENT_COMPONENTS",
                    severity=ConflictSeverity.WARNING,
                    message=(
                        f"{len(remaining)} other component(s) on "
                        f"{item.service_date} assume you are staying in "
                        f"{item.city or 'that city'}."
                    ),
                    entity="booking_item",
                    entity_id=item.id,
                    on_date=item.service_date,
                )
            )

        report.summary = (
            f"Cancelling {item.title} returns {currency} {refund}"
            + (f"; {currency} {penalty} is retained as a penalty." if penalty > 0 else " in full.")
        )
        return report

    async def _assess_add(
        self, trip: Trip, proposal: dict[str, Any], user: User, currency: str
    ) -> ImpactReport:
        """Adding something. The delta is simply what it costs."""
        service = await self._service(uuid.UUID(str(proposal["service_id"])))
        on_date = date.fromisoformat(str(proposal["service_date"]))
        quantity = int(proposal.get("quantity") or 1)
        units = int(proposal.get("units") or 1)

        _, total, note = await self._price_on(
            service, on_date, quantity=quantity, units=units
        )
        report = ImpactReport(
            change_type=ChangeRequestType.ADD_COMPONENT,
            currency=currency,
            replacement_total=total,
            feasible=bool(note["available"]),
        )
        report.availability.append(note)

        if not (trip.start_date <= on_date <= trip.end_date):
            report.conflicts.append(
                Conflict(
                    code="ADDITION_OUTSIDE_TRIP",
                    severity=ConflictSeverity.BLOCKER,
                    message=(
                        f"{on_date} is outside the trip dates "
                        f"{trip.start_date} to {trip.end_date}."
                    ),
                    on_date=on_date,
                )
            )
        if not note["available"]:
            report.conflicts.append(
                Conflict(
                    code="ADDITION_UNAVAILABLE",
                    severity=ConflictSeverity.BLOCKER,
                    message=note["reason"] or f"{service.name} cannot be booked.",
                    entity="vendor_service",
                    entity_id=service.id,
                    on_date=on_date,
                )
            )

        report.alternatives = await self.inventory.find_alternatives(
            service_type=service.service_type,
            city=service.city,
            on_date=on_date,
            quantity=quantity,
            nights=units,
            exclude_service_id=service.id,
            user_id=user.id,
            limit=5,
        )
        report.summary = f"Adding {service.name} on {on_date} costs {currency} {total}."
        return report

    async def _assess_party_size(
        self, trip: Trip, proposal: dict[str, Any], user: User, currency: str
    ) -> ImpactReport:
        """Changing how many people are travelling.

        Every per-head component reprices, and every one of them has to have
        the extra capacity on its own date -- which is why this is assessed as
        a set rather than as a single multiplication of the trip total.
        """
        new_count = int(proposal["traveller_count"])
        if new_count == trip.traveller_count:
            raise ValidationError("The party size is already that")

        report = ImpactReport(change_type=ChangeRequestType.PARTY_SIZE, currency=currency)
        ratio = Decimal(new_count) / Decimal(max(trip.traveller_count, 1))

        for item in await self._live_items(trip.id):
            original = Decimal(str(item.total_price))
            # Scale the party-sized part of the line, keeping nights intact.
            new_quantity = max(1, int(round(item.quantity * float(ratio))))
            report.original_total += original

            if item.service_id is None:
                new_total = (original * ratio).quantize(MONEY)
                report.replacement_total += new_total
                report.refund_total += original
                report.affected.append(
                    AffectedItem(
                        item_id=item.id,
                        title=item.title,
                        component_type=item.component_type.value,
                        service_date=item.service_date,
                        action="reprice",
                        original_cost=original,
                        refund=original,
                        penalty=ZERO,
                        replacement_cost=new_total,
                        note=f"Re-quoted for {new_quantity} instead of {item.quantity}.",
                    )
                )
                continue

            service = await self._service(item.service_id)
            _, total, note = await self._price_on(
                service, item.service_date, quantity=new_quantity, units=item.units
            )
            report.availability.append(note)
            report.refund_total += original
            report.replacement_total += total
            if not note["available"]:
                report.feasible = False
                report.conflicts.append(
                    Conflict(
                        code="CAPACITY_SHORTFALL",
                        severity=ConflictSeverity.BLOCKER,
                        message=note["reason"] or f"{service.name} cannot take {new_quantity}.",
                        entity="booking_item",
                        entity_id=item.id,
                        on_date=item.service_date,
                    )
                )
            report.affected.append(
                AffectedItem(
                    item_id=item.id,
                    title=item.title,
                    component_type=item.component_type.value,
                    service_date=item.service_date,
                    action="reprice",
                    original_cost=original,
                    refund=original,
                    penalty=ZERO,
                    replacement_cost=total,
                    new_service_id=service.id,
                    new_title=service.name,
                    note=note["reason"],
                )
            )

        verb = "up" if new_count > trip.traveller_count else "down"
        report.summary = (
            f"Going from {trip.traveller_count} to {new_count} travellers "
            f"reprices {len(report.affected)} component(s) {verb}."
        )
        return report

    # -- submission --------------------------------------------------------

    async def submit(
        self,
        trip_id: uuid.UUID,
        *,
        change_type: ChangeRequestType,
        proposal: dict[str, Any],
        reason: str | None,
        user: User,
        disruption: Disruption | None = None,
        narrate: bool = True,
    ) -> ChangeRequest:
        """Raise a change request, freezing the impact report onto it."""
        trip = await self._trip(trip_id, user)
        report = await self.assess(trip_id, proposal, change_type, user)

        booking_id: uuid.UUID | None = None
        booking_item_id: uuid.UUID | None = None
        operator_id: uuid.UUID | None = None

        if proposal.get("booking_item_id"):
            item = await self._item(uuid.UUID(str(proposal["booking_item_id"])), trip)
            booking_item_id = item.id
            booking_id = item.booking_id
            operator_id = (
                item.booking.operator_id if item.booking else None
            ) or await self._operator_for_item(item)
        else:
            # Trip-wide changes attach to the trip's single booking when there
            # is exactly one; with several, the request stays trip-level rather
            # than arbitrarily picking one to blame.
            bookings = list(
                (
                    await self.db.execute(
                        select(Booking).where(
                            Booking.trip_id == trip.id,
                            Booking.status != BookingStatus.CANCELLED,
                        )
                    )
                )
                .scalars()
                .all()
            )
            if len(bookings) == 1:
                booking_id = bookings[0].id
                operator_id = bookings[0].operator_id
            elif bookings:
                operator_id = next(
                    (b.operator_id for b in bookings if b.operator_id), None
                )
            if operator_id is None:
                for candidate in await self._live_items(trip.id):
                    operator_id = await self._operator_for_item(candidate)
                    if operator_id is not None:
                        break

        request = ChangeRequest(
            trip_id=trip.id,
            booking_id=booking_id,
            booking_item_id=booking_item_id,
            operator_id=operator_id or (disruption.operator_id if disruption else None),
            disruption_id=disruption.id if disruption else None,
            requested_by_id=user.id,
            type=change_type,
            status=ChangeRequestStatus.PENDING,
            reason=reason,
            proposal=_jsonable(proposal),
            impact=report.as_dict(),
            net_cost_delta=report.net_delta,
            currency=report.currency,
        )
        if narrate:
            request.ai_summary = await self._narrate(report, trip)

        self.db.add(request)
        await self.db.flush()
        await self._notify_operator(request, trip)
        await self.db.commit()
        return await self.get_request(request.id)

    async def _narrate(self, report: ImpactReport, trip: Trip) -> str | None:
        """Ask the model to explain the report in plain language.

        Narration only. Every figure the model is allowed to use is one this
        module already computed and handed it, and a failure here degrades to
        the deterministic summary rather than blocking the request -- an
        unreachable model must never stop somebody changing their tour.
        """
        from app.services.ai_service import AIService  # noqa: PLC0415

        try:
            return await AIService().explain_impact(report.as_dict(), trip.title)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Impact narration failed, using the engine summary: %s", exc)
            return report.summary

    async def _notify_operator(self, request: ChangeRequest, trip: Trip) -> None:
        if request.operator_id is None:
            return
        staff = list(
            (
                await self.db.execute(
                    select(OperatorMember.user_id).where(
                        OperatorMember.operator_id == request.operator_id,
                        OperatorMember.is_active.is_(True),
                    )
                )
            )
            .scalars()
            .all()
        )
        await self.notifications.fan_out(
            user_ids=staff,
            type=NotificationType.CHANGE_REQUEST,
            title=f"Change requested on {trip.title}",
            body=(
                f"{request.type.value.replace('_', ' ').capitalize()}: "
                f"{(request.impact or {}).get('summary', '')}"
            ),
            payload={"change_request_id": str(request.id), "trip_id": str(trip.id)},
            link="/operator?tab=changes",
            exclude=request.requested_by_id,
        )

    # -- reads -------------------------------------------------------------

    async def get_request(self, request_id: uuid.UUID) -> ChangeRequest:
        request = (
            await self.db.execute(
                select(ChangeRequest)
                .where(ChangeRequest.id == request_id)
                .options(
                    selectinload(ChangeRequest.trip),
                    selectinload(ChangeRequest.booking),
                    selectinload(ChangeRequest.booking_item),
                    selectinload(ChangeRequest.requested_by),
                    selectinload(ChangeRequest.disruption),
                )
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        if request is None:
            raise NotFoundError("Change request")
        return request

    async def get_owned(self, request_id: uuid.UUID, user: User) -> ChangeRequest:
        request = await self.get_request(request_id)
        if request.requested_by_id != user.id and not user.is_admin:
            raise ForbiddenError("This change request belongs to someone else")
        return request

    async def list_for_user(
        self, user: User, *, offset: int, limit: int, trip_id: uuid.UUID | None = None
    ) -> tuple[list[ChangeRequest], int]:
        where = [ChangeRequest.requested_by_id == user.id]
        if trip_id is not None:
            where.append(ChangeRequest.trip_id == trip_id)

        total = (
            await self.db.execute(
                select(func.count()).select_from(ChangeRequest).where(*where)
            )
        ).scalar_one()
        rows = (
            (
                await self.db.execute(
                    select(ChangeRequest)
                    .where(*where)
                    .options(
                        selectinload(ChangeRequest.trip),
                        selectinload(ChangeRequest.booking_item),
                        selectinload(ChangeRequest.requested_by),
                        selectinload(ChangeRequest.disruption),
                    )
                    .order_by(ChangeRequest.created_at.desc())
                    .offset(offset)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        return list(rows), total

    async def withdraw(self, request_id: uuid.UUID, user: User) -> ChangeRequest:
        request = await self.get_owned(request_id, user)
        if request.status is not ChangeRequestStatus.PENDING:
            raise ConflictError(
                f"This request has already been {request.status.value}"
            )
        request.status = ChangeRequestStatus.WITHDRAWN
        await self.db.commit()
        return await self.get_request(request.id)

    # -- application -------------------------------------------------------

    async def apply(self, request: ChangeRequest) -> dict[str, Any]:
        """Carry out an approved change, atomically.

        Re-assessment is deliberate but *advisory*: the world may have moved
        since approval, and the caller is told when the live numbers differ
        from the agreed ones. The change is still applied on the agreed terms,
        because that is what was agreed -- surprising a traveller with a new
        price at application time is exactly the behaviour this whole feature
        exists to prevent.
        """
        if request.status not in (
            ChangeRequestStatus.APPROVED,
            ChangeRequestStatus.PENDING,
        ):
            raise ConflictError(
                f"A {request.status.value} request cannot be applied"
            )

        handlers = {
            ChangeRequestType.DATE_SHIFT: self._apply_date_shift,
            ChangeRequestType.REPLACE_COMPONENT: self._apply_replace,
            ChangeRequestType.CANCEL_COMPONENT: self._apply_cancel,
            ChangeRequestType.ADD_COMPONENT: self._apply_add,
            ChangeRequestType.PARTY_SIZE: self._apply_party_size,
        }
        result = await handlers[request.type](request)

        now = datetime.now(timezone.utc)
        request.status = ChangeRequestStatus.APPLIED
        request.applied_at = now
        request.decided_at = request.decided_at or now
        request.applied_result = _jsonable(result)

        await self.db.flush()
        for booking_id in result.get("booking_ids", []):
            await self._resettle(uuid.UUID(str(booking_id)))

        await self._notify_traveller(
            request,
            title="Your change has been applied",
            body=result.get("summary", "The itinerary has been updated."),
        )
        await self.db.commit()
        return result

    async def _resettle(self, booking_id: uuid.UUID) -> None:
        """Recompute a booking's totals and status after its items changed.

        A change that costs more leaves the booking short, so it drops back to
        ``pending_payment`` and the traveller owes a balance; one that costs
        less has already refunded the difference and stays confirmed.
        """
        booking = await self.bookings._load(booking_id)
        self.bookings._recalculate(booking)
        paid = BookingService.amount_paid(booking)
        total = Decimal(str(booking.total))

        if not any(i.status in LIVE_ITEM_STATUSES for i in booking.items):
            booking.status = BookingStatus.CANCELLED
            booking.cancelled_at = booking.cancelled_at or datetime.now(timezone.utc)
        elif paid >= total:
            booking.status = BookingStatus.CONFIRMED
            booking.confirmed_at = booking.confirmed_at or datetime.now(timezone.utc)
        else:
            booking.status = BookingStatus.PENDING_PAYMENT

    async def _release(self, item: BookingItem) -> None:
        """Hand a seat back to the pool when an item stops being live."""
        if item.service_id is None:
            return
        avail = await self._availability(item.service_id, item.service_date)
        if avail is not None:
            avail.capacity_booked = max(0, avail.capacity_booked - item.quantity)

    async def _consume(self, service_id: uuid.UUID, on_date: date, quantity: int) -> None:
        avail = await self._availability(service_id, on_date)
        if avail is not None:
            avail.capacity_booked = min(
                avail.capacity_total, avail.capacity_booked + quantity
            )

    async def _refund_item(self, item: BookingItem, booking: Booking) -> Decimal:
        """Cancel one item and record whatever refund its terms produce.

        Capped at what has actually been paid: a booking still on deposit
        cannot refund more money than it has received, and a gateway that
        returned more than it took would be a bug worth an incident.
        """
        refund, _, _ = refund_due(item)
        item.status = BookingItemStatus.CANCELLED
        await self._release(item)

        paid = BookingService.amount_paid(booking)
        refundable = min(refund, paid).quantize(MONEY)
        if refundable <= 0:
            return ZERO

        result = self.gateway.refund("", refundable)
        self.db.add(
            Payment(
                booking_id=booking.id,
                amount=refundable,
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
        return refundable if result.approved else ZERO

    async def _rebook(
        self,
        *,
        booking: Booking,
        service: VendorService,
        on_date: date,
        quantity: int,
        units: int,
        end_date: date | None,
        stop_id: uuid.UUID | None,
        component_type,
        supersedes: BookingItem | None = None,
    ) -> BookingItem:
        """Create the replacement line, priced at the new date's going rate."""
        unit_price, total, _ = await self._price_on(
            service, on_date, quantity=quantity, units=units
        )
        item = BookingItem(
            booking_id=booking.id,
            service_id=service.id,
            stop_id=stop_id,
            component_type=component_type,
            title=service.name[:200],
            vendor_name=service.vendor.name if service.vendor else None,
            city=service.city,
            service_date=on_date,
            end_date=end_date,
            quantity=quantity,
            units=units,
            unit_price=unit_price,
            total_price=total,
            free_cancellation_days=service.free_cancellation_days,
            cancellation_penalty_pct=service.cancellation_penalty_pct,
            status=BookingItemStatus.CONFIRMED
            if booking.status
            in (BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS)
            else BookingItemStatus.PENDING,
        )
        self.db.add(item)
        await self.db.flush()

        if item.status is BookingItemStatus.CONFIRMED:
            await self._consume(service.id, on_date, quantity)
        if supersedes is not None:
            supersedes.status = BookingItemStatus.REPLACED
            supersedes.replaced_by_item_id = item.id
        return item

    async def _apply_replace(self, request: ChangeRequest) -> dict[str, Any]:
        proposal = request.proposal
        item = await self.db.get(BookingItem, uuid.UUID(str(proposal["booking_item_id"])))
        if item is None:
            raise NotFoundError("Booking item")
        if item.status not in LIVE_ITEM_STATUSES:
            raise ConflictError("That component is already cancelled or replaced")

        booking = await self.bookings._load(item.booking_id)
        service = await self._service(uuid.UUID(str(proposal["new_service_id"])))
        on_date = (
            date.fromisoformat(str(proposal["new_date"]))
            if proposal.get("new_date")
            else item.service_date
        )

        refunded = await self._refund_item(item, booking)
        # ``_refund_item`` cancels; replacement is a distinct fate and the
        # audit trail should say so.
        item.status = BookingItemStatus.REPLACED

        replacement = await self._rebook(
            booking=booking,
            service=service,
            on_date=on_date,
            quantity=item.quantity,
            units=item.units,
            end_date=item.end_date,
            stop_id=item.stop_id,
            component_type=item.component_type,
            supersedes=item,
        )
        return {
            "summary": f"{item.title} replaced with {service.name} on {on_date}.",
            "booking_ids": [str(booking.id)],
            "cancelled_item_ids": [str(item.id)],
            "created_item_ids": [str(replacement.id)],
            "refunded": str(refunded),
            "charged": str(replacement.total_price),
        }

    async def _apply_cancel(self, request: ChangeRequest) -> dict[str, Any]:
        item = await self.db.get(
            BookingItem, uuid.UUID(str(request.proposal["booking_item_id"]))
        )
        if item is None:
            raise NotFoundError("Booking item")
        if item.status not in LIVE_ITEM_STATUSES:
            raise ConflictError("That component is already cancelled or replaced")

        booking = await self.bookings._load(item.booking_id)
        refunded = await self._refund_item(item, booking)
        return {
            "summary": f"{item.title} cancelled; {booking.currency} {refunded} refunded.",
            "booking_ids": [str(booking.id)],
            "cancelled_item_ids": [str(item.id)],
            "created_item_ids": [],
            "refunded": str(refunded),
            "charged": "0.00",
        }

    async def _apply_add(self, request: ChangeRequest) -> dict[str, Any]:
        proposal = request.proposal
        booking = (
            await self.bookings._load(request.booking_id)
            if request.booking_id
            else None
        )
        if booking is None:
            raise ConflictError(
                "There is no booking on this trip to add the component to"
            )

        service = await self._service(uuid.UUID(str(proposal["service_id"])))
        created = await self._rebook(
            booking=booking,
            service=service,
            on_date=date.fromisoformat(str(proposal["service_date"])),
            quantity=int(proposal.get("quantity") or 1),
            units=int(proposal.get("units") or 1),
            end_date=None,
            stop_id=(
                uuid.UUID(str(proposal["stop_id"])) if proposal.get("stop_id") else None
            ),
            component_type=service.service_type,
        )
        return {
            "summary": f"{service.name} added on {created.service_date}.",
            "booking_ids": [str(booking.id)],
            "cancelled_item_ids": [],
            "created_item_ids": [str(created.id)],
            "refunded": "0.00",
            "charged": str(created.total_price),
        }

    async def _apply_date_shift(self, request: ChangeRequest) -> dict[str, Any]:
        """Move the itinerary, then rebook everything onto the new dates.

        The itinerary and the bookings are moved in the same transaction for
        the obvious reason: a trip whose stops have moved but whose hotels have
        not is precisely the broken state the conflict checks exist to warn
        about, and producing it deliberately would be indefensible.
        """
        shift = int(request.proposal["shift_days"])
        delta = timedelta(days=shift)

        trip = await self.conflicts.load(request.trip_id)
        if trip is None:
            raise NotFoundError("Trip")

        trip.start_date += delta
        trip.end_date += delta
        for stop in trip.stops:
            stop.arrival_date += delta
            stop.departure_date += delta
            for activity in stop.activities:
                activity.activity_date += delta
            for stay in stop.accommodations:
                stay.check_in += delta
                stay.check_out += delta
        for leg in trip.transports:
            leg.departure_time += delta
            leg.arrival_time += delta

        cancelled: list[str] = []
        created: list[str] = []
        booking_ids: set[str] = set()
        refunded = ZERO
        charged = ZERO

        # Follow the report's own decisions rather than re-deriving them, so
        # what is applied is what was approved.
        by_item = {
            a["item_id"]: a for a in (request.impact or {}).get("affected_items", [])
        }

        for item in await self._live_items(request.trip_id):
            plan = by_item.get(str(item.id))
            booking = await self.bookings._load(item.booking_id)
            booking_ids.add(str(booking.id))
            new_date = item.service_date + delta

            if item.service_id is None:
                # Nothing to rebook against a catalogue: just move the line.
                item.service_date = new_date
                if item.end_date:
                    item.end_date += delta
                continue

            service_id = (
                uuid.UUID(str(plan["new_service_id"]))
                if plan and plan.get("new_service_id")
                else item.service_id
            )
            refunded += await self._refund_item(item, booking)
            item.status = BookingItemStatus.REPLACED
            cancelled.append(str(item.id))

            replacement = await self._rebook(
                booking=booking,
                service=await self._service(service_id),
                on_date=new_date,
                quantity=item.quantity,
                units=item.units,
                end_date=item.end_date + delta if item.end_date else None,
                stop_id=item.stop_id,
                component_type=item.component_type,
                supersedes=item,
            )
            created.append(str(replacement.id))
            charged += Decimal(str(replacement.total_price))

        direction = "later" if shift > 0 else "earlier"
        return {
            "summary": (
                f"Trip moved {abs(shift)} day(s) {direction}; "
                f"{len(created)} component(s) rebooked."
            ),
            "booking_ids": sorted(booking_ids),
            "cancelled_item_ids": cancelled,
            "created_item_ids": created,
            "refunded": str(refunded.quantize(MONEY)),
            "charged": str(charged.quantize(MONEY)),
        }

    async def _apply_party_size(self, request: ChangeRequest) -> dict[str, Any]:
        new_count = int(request.proposal["traveller_count"])
        trip = await self.conflicts.load(request.trip_id)
        if trip is None:
            raise NotFoundError("Trip")

        ratio = Decimal(new_count) / Decimal(max(trip.traveller_count, 1))
        cancelled: list[str] = []
        created: list[str] = []
        booking_ids: set[str] = set()
        refunded = ZERO
        charged = ZERO

        for item in await self._live_items(trip.id):
            new_quantity = max(1, int(round(item.quantity * float(ratio))))
            if new_quantity == item.quantity:
                continue
            booking = await self.bookings._load(item.booking_id)
            booking_ids.add(str(booking.id))

            if item.service_id is None:
                item.quantity = new_quantity
                item.total_price = (
                    Decimal(str(item.unit_price)) * new_quantity * item.units
                ).quantize(MONEY)
                continue

            refunded += await self._refund_item(item, booking)
            item.status = BookingItemStatus.REPLACED
            cancelled.append(str(item.id))
            replacement = await self._rebook(
                booking=booking,
                service=await self._service(item.service_id),
                on_date=item.service_date,
                quantity=new_quantity,
                units=item.units,
                end_date=item.end_date,
                stop_id=item.stop_id,
                component_type=item.component_type,
                supersedes=item,
            )
            created.append(str(replacement.id))
            charged += Decimal(str(replacement.total_price))

        trip.traveller_count = new_count
        return {
            "summary": f"Party size set to {new_count}; {len(created)} component(s) repriced.",
            "booking_ids": sorted(booking_ids),
            "cancelled_item_ids": cancelled,
            "created_item_ids": created,
            "refunded": str(refunded.quantize(MONEY)),
            "charged": str(charged.quantize(MONEY)),
        }

    async def _notify_traveller(
        self, request: ChangeRequest, *, title: str, body: str
    ) -> None:
        await self.notifications.create(
            user_id=request.requested_by_id,
            type=NotificationType.CHANGE_DECISION,
            title=title,
            body=body,
            payload={
                "change_request_id": str(request.id),
                "trip_id": str(request.trip_id),
                "status": request.status.value,
            },
            link=f"/trips/{request.trip_id}",
        )

    # -- serialisation -----------------------------------------------------

    @staticmethod
    def serialise(request: ChangeRequest) -> dict[str, Any]:
        return {
            "id": request.id,
            "trip_id": request.trip_id,
            "trip_title": request.trip.title if request.trip else None,
            "booking_id": request.booking_id,
            "booking_item_id": request.booking_item_id,
            "booking_item_title": (
                request.booking_item.title if request.booking_item else None
            ),
            "operator_id": request.operator_id,
            "disruption_id": request.disruption_id,
            "disruption_title": (
                request.disruption.title if request.disruption else None
            ),
            "requested_by_id": request.requested_by_id,
            "requested_by_name": (
                request.requested_by.full_name if request.requested_by else None
            ),
            "type": request.type,
            "status": request.status,
            "reason": request.reason,
            "proposal": request.proposal,
            "impact": request.impact,
            "ai_summary": request.ai_summary,
            "net_cost_delta": Decimal(str(request.net_cost_delta)),
            "currency": request.currency,
            "review_note": request.review_note,
            "decided_at": request.decided_at,
            "applied_at": request.applied_at,
            "applied_result": request.applied_result,
            "created_at": request.created_at,
            "updated_at": request.updated_at,
        }

    @staticmethod
    def serialise_disruption(
        disruption: Disruption, *, change_request_count: int = 0
    ) -> dict[str, Any]:
        return {
            "id": disruption.id,
            "operator_id": disruption.operator_id,
            "trip_id": disruption.trip_id,
            "booking_id": disruption.booking_id,
            "service_id": disruption.service_id,
            "city": disruption.city,
            "from_date": disruption.from_date,
            "to_date": disruption.to_date,
            "type": disruption.type,
            "severity": disruption.severity,
            "status": disruption.status,
            "title": disruption.title,
            "description": disruption.description,
            "assessment": disruption.assessment,
            "change_request_count": change_request_count,
            "resolved_at": disruption.resolved_at,
            "created_at": disruption.created_at,
            "updated_at": disruption.updated_at,
        }


def _jsonable(value: Any) -> Any:
    """Coerce a payload into something JSONB will accept.

    UUIDs, dates and Decimals all arrive here routinely from Pydantic models
    and none of them survives ``json.dumps``. Converting to string keeps the
    exact value, which for money matters more than the type does.
    """
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, (uuid.UUID, Decimal, date, datetime)):
        return str(value)
    return value


# ---------------------------------------------------------------------------
# The operator's side of the same engine
# ---------------------------------------------------------------------------


class OperatorAdaptationService:
    """Reviewing changes and raising disruptions, scoped to one operator.

    Separate from :class:`AdaptationService` for the same reason the operator
    console is separate from the traveller app: the two see different rows.
    Everything here is filtered by the caller's own ``operator_id``, resolved
    from their membership, and no method takes an operator id a caller could
    tamper with.
    """

    def __init__(self, db: AsyncSession, membership: OperatorMember) -> None:
        self.db = db
        self.membership = membership
        self.operator_id = membership.operator_id
        self.engine = AdaptationService(db)
        self.notifications = NotificationService(db)

    # -- the change queue --------------------------------------------------

    async def queue(
        self,
        *,
        offset: int,
        limit: int,
        status: ChangeRequestStatus | None = None,
    ) -> tuple[list[ChangeRequest], int]:
        where = [ChangeRequest.operator_id == self.operator_id]
        if status is not None:
            where.append(ChangeRequest.status == status)

        total = (
            await self.db.execute(
                select(func.count()).select_from(ChangeRequest).where(*where)
            )
        ).scalar_one()
        rows = (
            (
                await self.db.execute(
                    select(ChangeRequest)
                    .where(*where)
                    .options(
                        selectinload(ChangeRequest.trip),
                        selectinload(ChangeRequest.booking_item),
                        selectinload(ChangeRequest.requested_by),
                        selectinload(ChangeRequest.disruption),
                    )
                    # Pending first, then newest: a queue is a to-do list, and
                    # a decided request is history rather than work.
                    .order_by(
                        (ChangeRequest.status != ChangeRequestStatus.PENDING),
                        ChangeRequest.created_at.desc(),
                    )
                    .offset(offset)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        return list(rows), total

    async def get_scoped(self, request_id: uuid.UUID) -> ChangeRequest:
        request = await self.engine.get_request(request_id)
        if request.operator_id != self.operator_id:
            # Reported as missing rather than forbidden: whether another
            # operator has such a request is not this caller's business.
            raise NotFoundError("Change request")
        return request

    async def decide(
        self,
        request_id: uuid.UUID,
        *,
        action: str,
        note: str | None = None,
        counter_proposal: dict[str, Any] | None = None,
    ) -> ChangeRequest:
        """Approve, counter or reject one request.

        Approving applies it in the same transaction. An operator who says yes
        means "do it", and leaving an approved-but-unapplied request sitting in
        the queue is how a traveller ends up believing they have a hotel they
        do not have.
        """
        request = await self.get_scoped(request_id)
        if request.status is not ChangeRequestStatus.PENDING:
            raise ConflictError(
                f"This request has already been {request.status.value}"
            )

        now = datetime.now(timezone.utc)
        request.reviewed_by_id = self.membership.id
        request.review_note = note
        request.decided_at = now

        if action == "reject":
            request.status = ChangeRequestStatus.REJECTED
            await self.engine._notify_traveller(
                request,
                title="Your change request was declined",
                body=note or "The operator could not accommodate this change.",
            )
            await self.db.commit()
            return await self.engine.get_request(request.id)

        if action == "counter":
            if not counter_proposal:
                raise ValidationError(
                    "Countering needs an alternative proposal to offer"
                )
            request.status = ChangeRequestStatus.COUNTERED
            # Re-cost the operator's alternative against the same traveller, so
            # what goes back is a real quote rather than a suggestion.
            traveller = await self.db.get(User, request.requested_by_id)
            report = await self.engine.assess(
                request.trip_id, counter_proposal, request.type, traveller
            )
            request.proposal = _jsonable(counter_proposal)
            request.impact = report.as_dict()
            request.net_cost_delta = report.net_delta
            await self.engine._notify_traveller(
                request,
                title="The operator has proposed an alternative",
                body=note or report.summary,
            )
            await self.db.commit()
            return await self.engine.get_request(request.id)

        if action != "approve":
            raise ValidationError(
                "Decision must be approve, counter or reject",
                details={"action": action},
            )

        request.status = ChangeRequestStatus.APPROVED
        await self.db.flush()
        # apply() commits; a failure inside it rolls the approval back with it,
        # which is the behaviour that keeps the queue honest.
        await self.engine.apply(request)
        return await self.engine.get_request(request.id)

    # -- disruptions -------------------------------------------------------

    async def _affected_items(self, disruption: Disruption) -> list[BookingItem]:
        """Everything this operator sold that the incident could touch.

        Scope narrows by intersection: each field that is set adds a filter.
        A disruption with only a city and a date window catches every
        component in that city on those days, which is what a weather alert
        actually means.
        """
        # An operator's exposure is not only the bookings placed *through*
        # them. A traveller who booked the tour themselves is still holding
        # this operator's inventory, and when that inventory fails it is this
        # operator who has to find them a bed -- so ownership is either the
        # booking's operator or the operator behind the vendor supplying the
        # component.
        where = [
            or_(
                Booking.operator_id == self.operator_id,
                Vendor.operator_id == self.operator_id,
            ),
            Booking.status != BookingStatus.CANCELLED,
            BookingItem.status.in_(LIVE_ITEM_STATUSES),
        ]
        if disruption.trip_id is not None:
            where.append(Booking.trip_id == disruption.trip_id)
        if disruption.booking_id is not None:
            where.append(BookingItem.booking_id == disruption.booking_id)
        if disruption.service_id is not None:
            where.append(BookingItem.service_id == disruption.service_id)
        if disruption.city:
            where.append(BookingItem.city.ilike(disruption.city))
        if disruption.from_date is not None:
            where.append(BookingItem.service_date >= disruption.from_date)
        if disruption.to_date is not None:
            where.append(BookingItem.service_date <= disruption.to_date)

        return list(
            (
                await self.db.execute(
                    select(BookingItem)
                    .join(Booking, BookingItem.booking_id == Booking.id)
                    # Outer, because an off-catalogue line has no service to
                    # trace back to a vendor and must not be dropped by the
                    # join before the operator filter has been considered.
                    .outerjoin(
                        VendorService, BookingItem.service_id == VendorService.id
                    )
                    .outerjoin(Vendor, VendorService.vendor_id == Vendor.id)
                    .where(*where)
                    .options(
                        selectinload(BookingItem.booking),
                        selectinload(BookingItem.service),
                    )
                    .order_by(BookingItem.service_date)
                )
            )
            .scalars()
            .all()
        )

    async def _assess_disruption(self, disruption: Disruption) -> dict[str, Any]:
        """What the incident is worth, and what could be done instead.

        Every at-risk component is costed on its own snapshotted terms and
        given a ranked shortlist of replacements. The totals are the operator's
        exposure: what they would refund, and what re-supplying everyone would
        cost.
        """
        items = await self._affected_items(disruption)
        forcing = disruption.severity in FORCING_SEVERITIES

        rows: list[dict[str, Any]] = []
        exposure = ZERO
        refundable = ZERO
        replacement = ZERO
        travellers: set[uuid.UUID] = set()

        for item in items:
            refund, penalty, _ = refund_due(item)
            exposure += Decimal(str(item.total_price))
            refundable += refund
            if item.booking is not None:
                travellers.add(item.booking.traveller_id)

            options: list[dict[str, Any]] = []
            if item.service_id is not None:
                options = await self.engine.inventory.find_alternatives(
                    service_type=item.component_type,
                    city=item.city,
                    on_date=item.service_date,
                    quantity=item.quantity,
                    nights=item.units,
                    exclude_service_id=item.service_id,
                    user_id=(item.booking.traveller_id if item.booking else None),
                    limit=3,
                )
            if options:
                replacement += Decimal(str(options[0]["total_price"]))

            rows.append(
                {
                    "item_id": str(item.id),
                    "booking_id": str(item.booking_id),
                    "booking_reference": (
                        item.booking.reference if item.booking else None
                    ),
                    "traveller_id": (
                        str(item.booking.traveller_id) if item.booking else None
                    ),
                    "title": item.title,
                    "component_type": item.component_type.value,
                    "service_date": item.service_date.isoformat(),
                    "city": item.city,
                    "total_price": str(item.total_price),
                    "refund_if_cancelled": str(refund),
                    "penalty_if_cancelled": str(penalty),
                    "recommended_action": "replace" if forcing else "review",
                    "alternatives": options,
                }
            )

        return _jsonable({
            "severity": disruption.severity.value,
            "forcing": forcing,
            "items_at_risk": len(rows),
            "travellers_affected": len(travellers),
            "exposure_total": str(exposure.quantize(MONEY)),
            "refundable_total": str(refundable.quantize(MONEY)),
            "replacement_total": str(replacement.quantize(MONEY)),
            "net_if_replaced": str((replacement - refundable).quantize(MONEY)),
            "items": rows,
            "assessed_at": datetime.now(timezone.utc).isoformat(),
        })

    async def raise_disruption(
        self,
        *,
        type: DisruptionType,
        severity: DisruptionSeverity,
        title: str,
        description: str | None = None,
        city: str | None = None,
        trip_id: uuid.UUID | None = None,
        booking_id: uuid.UUID | None = None,
        service_id: uuid.UUID | None = None,
        from_date: date | None = None,
        to_date: date | None = None,
        notify: bool = True,
    ) -> Disruption:
        """Record an incident and immediately cost its blast radius.

        Assessing at creation time rather than on demand is what turns "there
        is a storm in Goa" into "eleven components worth INR 84,000 are at
        risk, and here is what each could be swapped for" -- the difference
        between an alert and an answer.
        """
        disruption = Disruption(
            operator_id=self.operator_id,
            raised_by_id=self.membership.user_id,
            trip_id=trip_id,
            booking_id=booking_id,
            service_id=service_id,
            city=city,
            from_date=from_date,
            to_date=to_date,
            type=type,
            severity=severity,
            status=DisruptionStatus.OPEN,
            title=title[:160],
            description=description,
        )
        self.db.add(disruption)
        await self.db.flush()

        disruption.assessment = await self._assess_disruption(disruption)

        if notify:
            traveller_ids = {
                uuid.UUID(row["traveller_id"])
                for row in disruption.assessment["items"]
                if row.get("traveller_id")
            }
            await self.notifications.fan_out(
                user_ids=sorted(traveller_ids),
                type=NotificationType.DISRUPTION,
                title=title[:160],
                body=(
                    description
                    or f"{disruption.type.value.replace('_', ' ').capitalize()} "
                    f"affecting part of your tour."
                ),
                payload={"disruption_id": str(disruption.id)},
                link="/trips",
            )

        await self.db.commit()
        return await self.get_disruption(disruption.id)

    async def get_disruption(self, disruption_id: uuid.UUID) -> Disruption:
        disruption = (
            await self.db.execute(
                select(Disruption)
                .where(Disruption.id == disruption_id)
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        if disruption is None or disruption.operator_id != self.operator_id:
            raise NotFoundError("Disruption")
        return disruption

    async def disruptions(
        self,
        *,
        offset: int,
        limit: int,
        status: DisruptionStatus | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        where = [Disruption.operator_id == self.operator_id]
        if status is not None:
            where.append(Disruption.status == status)

        total = (
            await self.db.execute(
                select(func.count()).select_from(Disruption).where(*where)
            )
        ).scalar_one()
        rows = (
            (
                await self.db.execute(
                    select(Disruption)
                    .where(*where)
                    .order_by(Disruption.created_at.desc())
                    .offset(offset)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )

        # One grouped count rather than a query per row.
        counts: dict[uuid.UUID, int] = {}
        if rows:
            counts = dict(
                (
                    await self.db.execute(
                        select(ChangeRequest.disruption_id, func.count())
                        .where(ChangeRequest.disruption_id.in_([d.id for d in rows]))
                        .group_by(ChangeRequest.disruption_id)
                    )
                ).all()
            )

        return (
            [
                AdaptationService.serialise_disruption(
                    d, change_request_count=counts.get(d.id, 0)
                )
                for d in rows
            ],
            total,
        )

    async def reassess(self, disruption_id: uuid.UUID) -> Disruption:
        """Recost an open incident against the world as it is now."""
        disruption = await self.get_disruption(disruption_id)
        disruption.assessment = await self._assess_disruption(disruption)
        await self.db.commit()
        return await self.get_disruption(disruption_id)

    async def set_disruption_status(
        self, disruption_id: uuid.UUID, status: DisruptionStatus
    ) -> Disruption:
        disruption = await self.get_disruption(disruption_id)
        disruption.status = status
        disruption.resolved_at = (
            datetime.now(timezone.utc)
            if status in (DisruptionStatus.RESOLVED, DisruptionStatus.DISMISSED)
            else None
        )
        await self.db.commit()
        return await self.get_disruption(disruption_id)

    async def propose_recovery(
        self, disruption_id: uuid.UUID, item_id: uuid.UUID
    ) -> ChangeRequest:
        """Raise the replacement the assessment already recommended.

        The operator acts *for* the traveller here, which is why the request is
        recorded against the traveller's own account: they are the one who has
        to live with the swap, and it must appear in their history as something
        that happened to their tour rather than an invisible back-office edit.
        """
        disruption = await self.get_disruption(disruption_id)
        row = next(
            (
                r
                for r in (disruption.assessment or {}).get("items", [])
                if r["item_id"] == str(item_id)
            ),
            None,
        )
        if row is None:
            raise NotFoundError("Affected component")
        if not row["alternatives"]:
            raise ConflictError(
                f"There is no available replacement for {row['title']}"
            )

        item = await self.db.get(BookingItem, item_id)
        if item is None:
            raise NotFoundError("Booking item")
        booking = await self.db.get(Booking, item.booking_id)
        if booking is None:
            raise NotFoundError("Booking")
        traveller = await self.db.get(User, booking.traveller_id)
        if traveller is None:
            raise NotFoundError("Traveller")

        best = row["alternatives"][0]
        request = await self.engine.submit(
            booking.trip_id,
            change_type=ChangeRequestType.REPLACE_COMPONENT,
            proposal={
                "booking_item_id": str(item.id),
                "new_service_id": str(best["service_id"]),
            },
            reason=f"Recovery for: {disruption.title}",
            user=traveller,
            disruption=disruption,
        )

        disruption = await self.get_disruption(disruption_id)
        if disruption.status is DisruptionStatus.OPEN:
            disruption.status = DisruptionStatus.MITIGATING
        await self.db.commit()
        return await self.engine.get_request(request.id)
