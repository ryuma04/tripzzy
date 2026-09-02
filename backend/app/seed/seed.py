"""Idempotent seed loader.

    python -m app.seed.seed            # destinations + activities
    python -m app.seed.seed --demo     # ... plus demo users and a shared trip

Re-running is safe: existing rows are updated in place rather than duplicated,
so this can be pointed at a live development database without wiping it.

The JSON files here are a *loader input*. The running application never reads
them -- it reads PostgreSQL (spec sections 2.1 and 38).
"""

import argparse
import asyncio
import json
import logging
from datetime import date, time, timedelta
from pathlib import Path

from sqlalchemy import func, select

from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models import (
    ActivityCatalog,
    ActivityCategory,
    Destination,
    Expense,
    ExpenseCategory,
    ItineraryActivity,
    Trip,
    TripStatus,
    TripStop,
    User,
    UserPreference,
    UserRole,
)
from app.seed.staff import seed_staff
from app.seed.supply import seed_supply

logging.basicConfig(level=logging.INFO, format="%(levelname)-8s %(message)s")
logger = logging.getLogger("seed")

DATA_DIR = Path(__file__).parent


def _load(filename: str) -> list[dict]:
    with open(DATA_DIR / filename, encoding="utf-8") as fh:
        return json.load(fh)


async def seed_destinations(session) -> dict[str, Destination]:
    """Upsert destinations, keyed case-insensitively on (name, country)."""
    rows = _load("destinations.json")
    existing = {
        (d.name.lower(), d.country.lower()): d
        for d in (await session.execute(select(Destination))).scalars()
    }

    created = updated = 0
    by_name: dict[str, Destination] = {}

    for row in rows:
        key = (row["name"].lower(), row["country"].lower())
        dest = existing.get(key)
        if dest is None:
            dest = Destination(**row)
            session.add(dest)
            created += 1
        else:
            for field, value in row.items():
                setattr(dest, field, value)
            updated += 1
        by_name[row["name"]] = dest

    await session.flush()
    logger.info("destinations: %d created, %d updated", created, updated)
    return by_name


async def seed_activities(session, destinations: dict[str, Destination]) -> int:
    """Upsert catalog activities, keyed on (destination_id, title)."""
    rows = _load("activities.json")
    existing = {
        (a.destination_id, a.title.lower()): a
        for a in (await session.execute(select(ActivityCatalog))).scalars()
    }

    created = updated = skipped = 0
    for row in rows:
        dest = destinations.get(row["destination"])
        if dest is None:
            logger.warning("no destination %r for %r", row["destination"], row["title"])
            skipped += 1
            continue

        payload = {
            "destination_id": dest.id,
            "title": row["title"],
            "category": ActivityCategory(row["category"]),
            "estimated_cost": row.get("estimated_cost", 0),
            "duration_minutes": row.get("duration_minutes"),
            "rating": row.get("rating"),
            "description": row.get("description"),
        }

        activity = existing.get((dest.id, row["title"].lower()))
        if activity is None:
            session.add(ActivityCatalog(**payload))
            created += 1
        else:
            for field, value in payload.items():
                setattr(activity, field, value)
            updated += 1

    await session.flush()
    logger.info(
        "activities: %d created, %d updated, %d skipped", created, updated, skipped
    )
    return created


async def seed_demo(session, destinations: dict[str, Destination]) -> None:
    """Create an admin, two travellers, and one fully-built shared trip.

    Refinement R10: makes the community/clone flow demonstrable immediately
    rather than requiring somebody to hand-build a trip before the demo.
    """
    demo_users = [
        {
            "email": "admin@tripzyy.com",
            "password": "Admin@123",
            "first_name": "Aditi",
            "last_name": "Sharma",
            "role": UserRole.ADMIN,
            "city": "Ahmedabad",
            "country": "India",
            "phone": "+919876543210",
        },
        {
            "email": "traveller@tripzyy.com",
            "password": "Travel@123",
            "first_name": "Rahul",
            "last_name": "Mehta",
            "role": UserRole.USER,
            "city": "Mumbai",
            "country": "India",
            "phone": "+919876543211",
        },
        {
            "email": "explorer@tripzyy.com",
            "password": "Explore@123",
            "first_name": "Priya",
            "last_name": "Nair",
            "role": UserRole.USER,
            "city": "Kochi",
            "country": "India",
            "phone": "+919876543212",
        },
    ]

    users: dict[str, User] = {}
    for spec in demo_users:
        password = spec.pop("password")
        found = (
            await session.execute(select(User).where(User.email == spec["email"]))
        ).scalar_one_or_none()
        if found is None:
            found = User(
                **spec,
                hashed_password=hash_password(password),
                is_email_verified=True,
            )
            session.add(found)
            await session.flush()
            session.add(UserPreference(user_id=found.id, currency="INR"))
            logger.info("user created: %s / %s", spec["email"], password)
        else:
            logger.info("user exists:  %s", spec["email"])
        users[spec["email"]] = found

    await session.flush()

    owner = users["traveller@tripzyy.com"]
    existing_trip = (
        await session.execute(
            select(Trip).where(
                Trip.user_id == owner.id, Trip.title == "West Coast Run"
            )
        )
    ).scalar_one_or_none()
    if existing_trip is not None:
        logger.info("demo trip already exists, skipping")
        return

    # The spec's own worked example: Mumbai -> Goa -> Gokarna.
    start = date.today() + timedelta(days=30)
    trip = Trip(
        user_id=owner.id,
        title="West Coast Run",
        description="Mumbai to Goa to Gokarna over seven days: city, beaches and "
        "a slow finish.",
        start_date=start,
        end_date=start + timedelta(days=6),
        budget=40000,
        traveller_count=2,
        currency="INR",
        status=TripStatus.UPCOMING,
        is_public=True,
        share_slug="west-coast-run-demo",
    )
    session.add(trip)
    await session.flush()

    legs = [
        ("Mumbai", 0, 0, 1),
        ("Goa", 1, 2, 4),
        ("Gokarna", 2, 5, 6),
    ]
    stops: list[TripStop] = []
    for city, order, day_from, day_to in legs:
        dest = destinations.get(city)
        stop = TripStop(
            trip_id=trip.id,
            destination_id=dest.id if dest else None,
            city_name=city,
            country="India",
            arrival_date=start + timedelta(days=day_from),
            departure_date=start + timedelta(days=day_to),
            order_index=order,
        )
        session.add(stop)
        stops.append(stop)
    await session.flush()

    # Pull real catalog activities for each stop so the demo itinerary is
    # backed by the same data the search screens return.
    for stop in stops:
        if stop.destination_id is None:
            continue
        catalog = (
            (
                await session.execute(
                    select(ActivityCatalog)
                    .where(ActivityCatalog.destination_id == stop.destination_id)
                    .order_by(ActivityCatalog.rating.desc().nullslast())
                    .limit(3)
                )
            )
            .scalars()
            .all()
        )
        for index, item in enumerate(catalog):
            session.add(
                ItineraryActivity(
                    stop_id=stop.id,
                    activity_id=item.id,
                    title=item.title,
                    activity_date=stop.arrival_date,
                    start_time=time(9 + index * 3, 0),
                    end_time=time(11 + index * 3, 0),
                    estimated_cost=item.estimated_cost,
                    category=item.category,
                    order_index=index,
                )
            )

    for category, title, amount, offset in [
        (ExpenseCategory.TRANSPORT, "Mumbai to Goa train", 1700, 1),
        (ExpenseCategory.MEALS, "Seafood dinner in Panjim", 2400, 2),
        (ExpenseCategory.ACCOMMODATION, "Beach shack, two nights", 5200, 2),
    ]:
        session.add(
            Expense(
                trip_id=trip.id,
                category=category,
                title=title,
                amount=amount,
                expense_date=start + timedelta(days=offset),
            )
        )

    logger.info("demo trip created: %s (slug: %s)", trip.title, trip.share_slug)


async def main(demo: bool) -> None:
    async with AsyncSessionLocal() as session:
        try:
            destinations = await seed_destinations(session)
            await seed_activities(session, destinations)
            await seed_supply(session, destinations)
            if demo:
                await seed_demo(session, destinations)
                # Needs the operator from seed_supply to exist first.
                await seed_staff(session)
            await session.commit()
        except Exception:
            await session.rollback()
            raise

        counts = {
            "destinations": await session.scalar(
                select(func.count()).select_from(Destination)
            ),
            "activities": await session.scalar(
                select(func.count()).select_from(ActivityCatalog)
            ),
            "users": await session.scalar(select(func.count()).select_from(User)),
            "trips": await session.scalar(select(func.count()).select_from(Trip)),
        }
    logger.info("done: %s", counts)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed the Tripzyy database")
    parser.add_argument(
        "--demo",
        action="store_true",
        help="also create demo users and a fully-built shared trip",
    )
    args = parser.parse_args()
    asyncio.run(main(args.demo))
