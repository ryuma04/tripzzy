"""Finding and ranking bookable alternatives.

This is the engine behind two things that look different but are the same
question: "show me other options for this hotel" (the traveller comparing
before they commit) and "this hotel just cancelled, now what" (the operator
recovering from a disruption). Both reduce to *rank the services that could
fill this slot, for this traveller, on these dates*.

Ranking is deliberately deterministic and explainable. Every option comes back
with the component scores that produced its total, so the UI can say **why**
one option is on top rather than asking anyone to trust a number. When the AI
layer explains a disruption in prose, these are the figures it is describing --
the model narrates the arithmetic, it does not perform it.
"""

import uuid
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    ServiceAvailability,
    UserPreference,
    Vendor,
    VendorService,
)
from app.models.enums import ComfortTier, ServiceType

# Ordered cheapest to most expensive, so tier distance is |index difference|.
TIER_ORDER: list[ComfortTier] = [
    ComfortTier.BUDGET,
    ComfortTier.STANDARD,
    ComfortTier.PREMIUM,
    ComfortTier.LUXURY,
]

# How much each factor contributes to the final score. Each set sums to 1.0,
# so a score is always a 0-100 figure that means the same thing across
# searches.
#
# There are two profiles because one set of weights cannot serve both cases.
# With no stated comfort tier, price is the strongest signal available. But
# once a traveller has actually said "luxury", price-led weighting ranks the
# luxury option *last* -- it is, definitionally, the most expensive one -- and
# hands them the cheapest instead, which is the opposite of what they asked
# for. When the preference is stated it therefore leads, and price drops to a
# tie-breaker among options that already fit.
WEIGHTS_PRICE_LED = {
    "price": 0.30,
    "comfort": 0.25,
    "rating": 0.20,
    "interests": 0.15,
    "reliability": 0.10,
}

WEIGHTS_PREFERENCE_LED = {
    "price": 0.15,
    "comfort": 0.40,
    "rating": 0.20,
    "interests": 0.15,
    "reliability": 0.10,
}


@dataclass
class RankedOption:
    service: VendorService
    unit_price: Decimal
    total_price: Decimal
    seats_left: int | None
    score: float
    reasons: dict[str, float] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        v = self.service.vendor
        return {
            "service_id": self.service.id,
            "vendor_id": self.service.vendor_id,
            "vendor_name": v.name if v else None,
            "vendor_rating": v.rating if v else None,
            "reliability_score": v.reliability_score if v else None,
            "name": self.service.name,
            "description": self.service.description,
            "service_type": self.service.service_type,
            "comfort_tier": self.service.comfort_tier,
            "unit_price": self.unit_price,
            "unit_label": self.service.unit_label,
            "total_price": self.total_price,
            "currency": self.service.currency,
            "duration_minutes": self.service.duration_minutes,
            "city": self.service.city,
            "rating": self.service.rating,
            "tags": self.service.tags or [],
            "free_cancellation_days": self.service.free_cancellation_days,
            "cancellation_penalty_pct": self.service.cancellation_penalty_pct,
            "seats_left": self.seats_left,
            "match_score": round(self.score, 1),
            "match_reasons": {k: round(v, 1) for k, v in self.reasons.items()},
            "notes": self.notes,
        }


class InventoryService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _preferences(self, user_id: uuid.UUID) -> UserPreference | None:
        return await self.db.scalar(
            select(UserPreference).where(UserPreference.user_id == user_id)
        )

    async def _availability(
        self, service_ids: Sequence[uuid.UUID], on_date: date | None
    ) -> dict[uuid.UUID, ServiceAvailability]:
        """Availability rows for a specific date, keyed by service.

        Absence is not scarcity: a service with no row for the date has no
        published limit, which is the common case. Only dates an operator has
        actually constrained or repriced exist.
        """
        if not service_ids or on_date is None:
            return {}
        rows = (
            (
                await self.db.execute(
                    select(ServiceAvailability).where(
                        ServiceAvailability.service_id.in_(service_ids),
                        ServiceAvailability.on_date == on_date,
                    )
                )
            )
            .scalars()
            .all()
        )
        return {r.service_id: r for r in rows}

    async def find_alternatives(
        self,
        *,
        service_type: ServiceType,
        city: str | None = None,
        on_date: date | None = None,
        quantity: int = 1,
        nights: int = 1,
        max_unit_price: Decimal | None = None,
        exclude_service_id: uuid.UUID | None = None,
        user_id: uuid.UUID | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Rank services that could fill one slot.

        ``exclude_service_id`` drops the option being replaced, so a
        disruption never suggests the thing that just fell through.
        """
        stmt = (
            select(VendorService)
            .join(Vendor, VendorService.vendor_id == Vendor.id)
            .where(
                VendorService.service_type == service_type,
                VendorService.is_active.is_(True),
                Vendor.is_active.is_(True),
            )
            .options(selectinload(VendorService.vendor))
        )
        if city:
            stmt = stmt.where(VendorService.city.ilike(city))
        if max_unit_price is not None:
            stmt = stmt.where(VendorService.unit_price <= max_unit_price)
        if exclude_service_id is not None:
            stmt = stmt.where(VendorService.id != exclude_service_id)

        services = list((await self.db.execute(stmt)).scalars().all())
        if not services:
            return []

        availability = await self._availability([s.id for s in services], on_date)
        prefs = await self._preferences(user_id) if user_id else None

        units = max(quantity, 1) * max(nights, 1)
        candidates: list[RankedOption] = []

        for service in services:
            avail = availability.get(service.id)
            notes: list[str] = []

            seats_left: int | None = None
            if avail is not None:
                if avail.is_blocked:
                    continue
                seats_left = avail.capacity_total - avail.capacity_booked
                if seats_left < max(quantity, 1):
                    # Not an alternative if it cannot take the party.
                    continue

            unit_price = Decimal(
                str(
                    avail.price_override
                    if avail is not None and avail.price_override is not None
                    else service.unit_price
                )
            )
            if avail is not None and avail.price_override is not None:
                notes.append("Seasonal price for this date")

            candidates.append(
                RankedOption(
                    service=service,
                    unit_price=unit_price,
                    total_price=(unit_price * units).quantize(Decimal("0.01")),
                    seats_left=seats_left,
                    score=0.0,
                    notes=notes,
                )
            )

        if not candidates:
            return []

        self._score(candidates, prefs)
        candidates.sort(key=lambda c: (-c.score, c.total_price))
        return [c.as_dict() for c in candidates[:limit]]

    def _score(
        self, options: list[RankedOption], prefs: UserPreference | None
    ) -> None:
        """Assign each option a 0-100 match score, with its breakdown.

        Price is scored *relative to the candidate set* rather than against an
        absolute scale: "cheap" only means anything next to the other options
        for the same slot on the same date.
        """
        prices = [float(o.unit_price) for o in options]
        low, high = min(prices), max(prices)
        spread = high - low

        preferred_tier: ComfortTier | None = None
        interests: set[str] = set()
        if prefs is not None:
            preferred_tier = prefs.accommodation_class or prefs.transport_class
            interests = {str(i).lower() for i in (prefs.interests or [])}

        weights = (
            WEIGHTS_PREFERENCE_LED if preferred_tier is not None else WEIGHTS_PRICE_LED
        )

        for option in options:
            reasons: dict[str, float] = {}

            # Cheapest scores 100, dearest 0. A single candidate, or a set
            # that is all one price, scores neutral rather than perfect.
            if spread > 0:
                reasons["price"] = (high - float(option.unit_price)) / spread * 100
            else:
                reasons["price"] = 50.0

            # Distance from the traveller's stated comfort tier, in steps.
            # Unstated preference scores neutral instead of penalising.
            if preferred_tier is not None:
                distance = abs(
                    TIER_ORDER.index(option.service.comfort_tier)
                    - TIER_ORDER.index(preferred_tier)
                )
                reasons["comfort"] = max(0.0, 100.0 - distance * 33.3)
            else:
                reasons["comfort"] = 50.0

            rating = option.service.rating
            reasons["rating"] = float(rating) / 5 * 100 if rating else 50.0

            # Overlap between the traveller's interests and the service tags.
            if interests:
                tags = {str(t).lower() for t in (option.service.tags or [])}
                overlap = interests & tags
                reasons["interests"] = min(100.0, len(overlap) / len(interests) * 100)
                if overlap:
                    option.notes.append(
                        "Matches your interest in " + ", ".join(sorted(overlap))
                    )
            else:
                reasons["interests"] = 50.0

            vendor = option.service.vendor
            reasons["reliability"] = float(
                vendor.reliability_score if vendor else 50
            )

            option.score = sum(
                reasons[key] * weight for key, weight in weights.items()
            )
            option.reasons = reasons

            if option.seats_left is not None and option.seats_left <= 3:
                option.notes.append(f"Only {option.seats_left} left on this date")
            if option.service.free_cancellation_days > 0:
                option.notes.append(
                    f"Free cancellation up to "
                    f"{option.service.free_cancellation_days} days before"
                )
            elif option.service.cancellation_penalty_pct >= 100:
                option.notes.append("Non-refundable")
