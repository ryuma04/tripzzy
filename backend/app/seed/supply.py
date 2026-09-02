"""Seeds the supply side: an operator, its vendors, and bookable services.

Generated rather than hand-listed, because what matters is the *shape* of the
catalogue, not the specific hotel names: for every destination and every
component type there must be several genuinely different options, spread
across comfort tiers and price points, with different cancellation terms and
reliability.

Without that spread, "compare alternatives" has nothing to compare and the
adaptation engine has nothing to suggest -- a ranking of one option is not a
ranking. Prices key off each destination's ``cost_index`` so a night in Goa
and a night in Leh do not cost the same.

Idempotent on ``(vendor, service name)``, like the rest of the seeder.
"""

import logging
import random
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import insert, select

from app.models import (
    Destination,
    Operator,
    ServiceAvailability,
    Vendor,
    VendorService,
)
from app.models.enums import ComfortTier, ServiceType

logger = logging.getLogger("seed")

OPERATOR = {
    "name": "Tripzyy Journeys",
    "slug": "tripzyy-journeys",
    "description": (
        "The in-house tour operator: coordinates vendors, staff and bookings "
        "for personalised tours."
    ),
    "contact_email": "ops@tripzyy.com",
    "contact_phone": "+912200000000",
    "city": "Mumbai",
    "country": "India",
    "rating": Decimal("4.6"),
}

# (tier, label, price multiplier against the destination's base rate, rating)
TIERS = [
    (ComfortTier.BUDGET, "Backpacker", 0.55, Decimal("3.9")),
    (ComfortTier.STANDARD, "Comfort", 1.00, Decimal("4.3")),
    (ComfortTier.PREMIUM, "Boutique", 1.85, Decimal("4.6")),
    (ComfortTier.LUXURY, "Signature", 3.20, Decimal("4.8")),
]

# Base rate per unit at cost_index 3, in INR, per component type.
BASE_RATES = {
    ServiceType.ACCOMMODATION: 3200,
    ServiceType.TRANSPORT: 1800,
    ServiceType.ACTIVITY: 1200,
    ServiceType.MEAL: 600,
    ServiceType.GUIDE: 2500,
}

UNIT_LABELS = {
    ServiceType.ACCOMMODATION: "night",
    ServiceType.TRANSPORT: "trip",
    ServiceType.ACTIVITY: "person",
    ServiceType.MEAL: "person",
    ServiceType.GUIDE: "day",
}

VENDOR_SUFFIX = {
    ServiceType.ACCOMMODATION: "Stays",
    ServiceType.TRANSPORT: "Transfers",
    ServiceType.ACTIVITY: "Experiences",
    ServiceType.MEAL: "Kitchen",
    ServiceType.GUIDE: "Guides",
}

SERVICE_NAMES = {
    ServiceType.ACCOMMODATION: "{tier} Rooms, {city}",
    ServiceType.TRANSPORT: "{tier} Airport & Intercity Transfer, {city}",
    ServiceType.ACTIVITY: "{tier} {city} Highlights Tour",
    ServiceType.MEAL: "{tier} Dining Plan, {city}",
    ServiceType.GUIDE: "{tier} Local Guide, {city}",
}

TAGS = {
    ServiceType.ACCOMMODATION: ["stay", "wifi", "breakfast"],
    ServiceType.TRANSPORT: ["transfer", "air-conditioned"],
    ServiceType.ACTIVITY: ["sightseeing", "culture", "photography"],
    ServiceType.MEAL: ["food", "street food", "local cuisine"],
    ServiceType.GUIDE: ["guide", "history", "culture"],
}

# Only these tiers get availability rows -- see the note at the write site.
SCARCE_TIERS = (ComfortTier.PREMIUM, ComfortTier.LUXURY)
AVAILABILITY_DAYS = 60
CAPACITY = {ComfortTier.PREMIUM: 5, ComfortTier.LUXURY: 2}

# Cancellation terms by tier: cheaper rates are stricter, which is what makes
# a date change actually cost something different depending on what is booked.
CANCELLATION = {
    ComfortTier.BUDGET: (0, 100),      # non-refundable
    ComfortTier.STANDARD: (3, 50),
    ComfortTier.PREMIUM: (7, 25),
    ComfortTier.LUXURY: (14, 0),       # fully flexible
}


async def seed_supply(session, destinations: dict[str, Destination]) -> dict:
    """Create the operator, one vendor per (city, type), and tiered services."""
    # Deterministic so re-running does not churn ratings and capacities.
    rng = random.Random(20260902)

    operator = await session.scalar(
        select(Operator).where(Operator.slug == OPERATOR["slug"])
    )
    if operator is None:
        operator = Operator(**OPERATOR)
        session.add(operator)
    else:
        for field, value in OPERATOR.items():
            setattr(operator, field, value)
    await session.flush()

    existing_vendors = {
        (v.name.lower()): v
        for v in (
            await session.execute(
                select(Vendor).where(Vendor.operator_id == operator.id)
            )
        ).scalars()
    }
    existing_services = {
        (s.vendor_id, s.name.lower()): s
        for s in (await session.execute(select(VendorService))).scalars()
    }

    # Fetched once. Looking this up per service would be ~800 extra queries
    # against a remote database.
    existing_availability = {
        (a.service_id, a.on_date)
        for a in (await session.execute(select(ServiceAvailability))).scalars()
    }

    vendors_made = services_made = availability_made = 0
    availability_rows: list[dict] = []
    today = date.today()

    # Three phases, three flushes.
    #
    # The obvious shape -- flush after each vendor and each service so their
    # ids are available -- costs one round trip per row. At ~40 destinations
    # x 5 types x 4 tiers that is 800+ sequential round trips to Singapore,
    # which took this seed past ten minutes without finishing. Creating every
    # vendor first, then every service, then the availability rows, needs
    # three.

    # Phase 1: vendors.
    planned_services: list[tuple] = []
    for dest in destinations.values():
        city = dest.name
        for service_type in BASE_RATES:
            vendor_name = f"{city} {VENDOR_SUFFIX[service_type]}"
            vendor = existing_vendors.get(vendor_name.lower())
            if vendor is None:
                vendor = Vendor(
                    operator_id=operator.id,
                    name=vendor_name,
                    category=service_type,
                    city=city,
                    country=dest.country,
                    contact_email=(
                        f"{city.lower().replace(' ', '')}."
                        f"{service_type.value}@vendors.tripzyy.com"
                    ),
                    rating=Decimal(str(round(rng.uniform(3.8, 4.9), 1))),
                    reliability_score=rng.randint(70, 99),
                )
                session.add(vendor)
                vendors_made += 1
                existing_vendors[vendor_name.lower()] = vendor
            planned_services.append((dest, service_type, vendor))

    await session.flush()

    # Phase 2: services, four graded tiers per vendor.
    created: list[tuple] = []
    for dest, service_type, vendor in planned_services:
        city = dest.name
        # cost_index runs 1..5; 3 is the baseline the rates are quoted at.
        cost_factor = (dest.cost_index or 3) / 3
        base_rate = BASE_RATES[service_type]

        for tier, label, multiplier, rating in TIERS:
            name = SERVICE_NAMES[service_type].format(tier=label, city=city)
            free_days, penalty = CANCELLATION[tier]
            unit_price = Decimal(str(round(base_rate * multiplier * cost_factor, 2)))

            service = existing_services.get((vendor.id, name.lower()))
            if service is None:
                service = VendorService(vendor_id=vendor.id, name=name)
                session.add(service)
                services_made += 1

            service.service_type = service_type
            service.comfort_tier = tier
            service.description = (
                f"{label}-tier {service_type.value} in {city}, "
                f"operated by {vendor.name}."
            )
            service.unit_price = unit_price
            service.currency = "INR"
            service.unit_label = UNIT_LABELS[service_type]
            service.city = city
            service.latitude = dest.latitude
            service.longitude = dest.longitude
            service.rating = rating
            service.tags = TAGS[service_type]
            service.free_cancellation_days = free_days
            service.cancellation_penalty_pct = penalty
            service.duration_minutes = (
                rng.choice([120, 180, 240])
                if service_type == ServiceType.ACTIVITY
                else None
            )
            created.append((service, tier, unit_price))

    await session.flush()

    # Phase 3: availability, for the scarce tiers only.
    #
    # The table is sparse on purpose: no row means "no published limit", so
    # budget and standard stock needs none. Writing a row per service per day
    # for every tier would be ~72,000 rows to say almost nothing. Constraining
    # premium and luxury is what gives a date change a real chance of hitting
    # a wall, which is the case the adaptation demo has to be able to show.
    for service, tier, unit_price in created:
        if tier not in SCARCE_TIERS:
            continue
        capacity = CAPACITY[tier]
        for offset in range(AVAILABILITY_DAYS):
            on_date = today + timedelta(days=offset)
            if (service.id, on_date) in existing_availability:
                continue
            # Weekends cost more, which is what turns "move the trip two days
            # later" into a non-zero number.
            weekend = on_date.weekday() >= 5
            availability_rows.append(
                {
                    "service_id": service.id,
                    "on_date": on_date,
                    "capacity_total": capacity,
                    "capacity_booked": rng.randint(0, capacity - 1),
                    "price_override": (
                        (unit_price * Decimal("1.25")).quantize(Decimal("0.01"))
                        if weekend
                        else None
                    ),
                    "is_blocked": False,
                }
            )

    # One executemany per batch rather than one INSERT per row: this is ~24k
    # rows against a remote database, and per-row round trips would dominate
    # the entire seed.
    for start in range(0, len(availability_rows), 5000):
        batch = availability_rows[start : start + 5000]
        await session.execute(insert(ServiceAvailability), batch)
        availability_made += len(batch)

    await session.flush()
    logger.info(
        "supply: %d vendors, %d services, %d availability rows",
        vendors_made,
        services_made,
        availability_made,
    )
    return {
        "vendors": vendors_made,
        "services": services_made,
        "availability": availability_made,
    }
