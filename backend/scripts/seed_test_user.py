"""Script to create a rich test user with complete, realistic data in the database."""

import asyncio
import uuid
from decimal import Decimal
from datetime import date, datetime, time, timedelta, timezone
import logging

from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.core.security import hash_password
from app.models import (
    User,
    UserPreference,
    Destination,
    Trip,
    TripStop,
    ItineraryActivity,
    Accommodation,
    Transport,
    Expense,
    SavedDestination,
    Booking,
    Payment,
)
from app.models.enums import (
    UserRole,
    UserStatus,
    TripStatus,
    ActivityCategory,
    ExpenseCategory,
    TransportType,
    BookingStatus,
    PaymentStatus,
    PaymentKind,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)-8s %(message)s")
logger = logging.getLogger("seed_test_user")


async def main():
    async with AsyncSessionLocal() as session:
        # 1. Create or update test user
        email = "tester@tripzyy.com"
        password = "TestUser@123"
        hashed = hash_password(password)

        user = await session.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                first_name="Yash",
                last_name="Patel",
                email=email,
                phone="+919876543299",
                city="Mumbai",
                country="India",
                additional_info="Passionate explorer, backpacker, and road trip enthusiast across India. Loves coastal drives, boutique heritage stays, and adventure trekking.",
                role=UserRole.USER,
                status=UserStatus.ACTIVE,
                is_email_verified=True,
                hashed_password=hashed,
            )
            session.add(user)
            await session.flush()
            session.add(UserPreference(user_id=user.id, currency="INR"))
            logger.info("Created user: %s", email)
        else:
            user.hashed_password = hashed
            user.is_email_verified = True
            user.status = UserStatus.ACTIVE
            await session.flush()
            logger.info("Updated existing user: %s", email)

        # 2. Get some destinations
        dests = (await session.execute(select(Destination).limit(5))).scalars().all()

        # 3. Bookmark destinations
        for dest in dests[:3]:
            existing_saved = await session.get(SavedDestination, (user.id, dest.id))
            if not existing_saved:
                session.add(SavedDestination(user_id=user.id, destination_id=dest.id))
        await session.flush()
        logger.info("Saved %d destinations for user", min(3, len(dests)))

        # 4. Create an active rich Trip: "Golden Triangle & Goa Odyssey"
        existing_trip = await session.scalar(
            select(Trip).where(Trip.user_id == user.id, Trip.title == "Golden Triangle & Goa Odyssey")
        )
        if existing_trip is None:
            today = date.today()
            trip = Trip(
                user_id=user.id,
                title="Golden Triangle & Goa Odyssey",
                description="Iconic multi-city journey combining Delhi heritage, Goa beaches, and Mumbai coastal drives.",
                start_date=today - timedelta(days=1),
                end_date=today + timedelta(days=6),
                budget=45000.0,
                traveller_count=2,
                status=TripStatus.ONGOING,
                is_public=True,
                share_slug="golden-triangle-goa-odyssey-8849",
            )
            session.add(trip)
            await session.flush()

            # Stop 1: Delhi
            stop1 = TripStop(
                trip_id=trip.id,
                city_name="Delhi",
                arrival_date=today - timedelta(days=1),
                departure_date=today + timedelta(days=1),
                order_index=1,
            )
            session.add(stop1)
            await session.flush()

            act1 = ItineraryActivity(
                stop_id=stop1.id,
                title="Old Delhi Heritage & Spice Market Walk",
                activity_date=today - timedelta(days=1),
                start_time=time(10, 0),
                end_time=time(13, 0),
                estimated_cost=650.0,
                category=ActivityCategory.CULTURE,
                order_index=1,
                notes="Explore historic Chandni Chowk with local food tasting.",
            )
            act2 = ItineraryActivity(
                stop_id=stop1.id,
                title="Humayun's Tomb Sunset Photography",
                activity_date=today,
                start_time=time(16, 30),
                end_time=time(18, 30),
                estimated_cost=300.0,
                category=ActivityCategory.SIGHTSEEING,
                order_index=2,
            )
            session.add_all([act1, act2])

            acc1 = Accommodation(
                stop_id=stop1.id,
                name="The Imperial New Delhi",
                address="Janpath, Connaught Place, New Delhi",
                check_in=today - timedelta(days=1),
                check_out=today + timedelta(days=1),
                estimated_cost=7500.0,
                booking_url="https://theimperialindia.com",
                notes="Heritage luxury suite near Connaught Place.",
            )
            session.add(acc1)

            # Stop 2: Goa
            stop2 = TripStop(
                trip_id=trip.id,
                city_name="Goa",
                arrival_date=today + timedelta(days=1),
                departure_date=today + timedelta(days=4),
                order_index=2,
            )
            session.add(stop2)
            await session.flush()

            act3 = ItineraryActivity(
                stop_id=stop2.id,
                title="Grand Island Scuba Diving & Snorkeling",
                activity_date=today + timedelta(days=2),
                start_time=time(8, 0),
                end_time=time(14, 0),
                estimated_cost=3200.0,
                category=ActivityCategory.ADVENTURE,
                order_index=1,
                notes="Guided reef dive with underwater HD video recording.",
            )
            act4 = ItineraryActivity(
                stop_id=stop2.id,
                title="Anjuna Beach Sunset Drums & Flea Market",
                activity_date=today + timedelta(days=3),
                start_time=time(17, 0),
                end_time=time(20, 0),
                estimated_cost=500.0,
                category=ActivityCategory.NIGHTLIFE,
                order_index=2,
            )
            session.add_all([act3, act4])

            acc2 = Accommodation(
                stop_id=stop2.id,
                name="Taj Holiday Village Resort & Spa",
                address="Sinquerim, Candolim, Goa",
                check_in=today + timedelta(days=1),
                check_out=today + timedelta(days=4),
                estimated_cost=14500.0,
                booking_url="https://tajhotels.com",
                notes="Beachfront villa with infinity pool access.",
            )
            session.add(acc2)

            # Transport 1: Delhi -> Goa
            trans1 = Transport(
                trip_id=trip.id,
                origin_stop_id=stop1.id,
                destination_stop_id=stop2.id,
                transport_type=TransportType.FLIGHT,
                provider="Vistara UK-812",
                departure_time=datetime.combine(today + timedelta(days=1), time(7, 30), tzinfo=timezone.utc),
                arrival_time=datetime.combine(today + timedelta(days=1), time(10, 15), tzinfo=timezone.utc),
                cost=4200.0,
                booking_ref="UK812-DEL-GOA",
                notes="Terminal 3 departure, vegetarian breakfast meal included.",
            )
            session.add(trans1)

            # Stop 3: Mumbai
            stop3 = TripStop(
                trip_id=trip.id,
                city_name="Mumbai",
                arrival_date=today + timedelta(days=4),
                departure_date=today + timedelta(days=6),
                order_index=3,
            )
            session.add(stop3)
            await session.flush()

            trans2 = Transport(
                trip_id=trip.id,
                origin_stop_id=stop2.id,
                destination_stop_id=stop3.id,
                transport_type=TransportType.TRAIN,
                provider="Vande Bharat Express 22230",
                departure_time=datetime.combine(today + timedelta(days=4), time(14, 40), tzinfo=timezone.utc),
                arrival_time=datetime.combine(today + timedelta(days=4), time(22, 25), tzinfo=timezone.utc),
                cost=1850.0,
                booking_ref="PNR-88492019",
                notes="Executive AC Chair Car with scenic Konkan railway views.",
            )
            session.add(trans2)

            act5 = ItineraryActivity(
                stop_id=stop3.id,
                title="Marine Drive Night Stroll & Gateway of India",
                activity_date=today + timedelta(days=5),
                start_time=time(19, 0),
                end_time=time(22, 0),
                estimated_cost=400.0,
                category=ActivityCategory.RELAXATION,
                order_index=1,
            )
            session.add(act5)

            # Expenses
            exp1 = Expense(
                trip_id=trip.id,
                category=ExpenseCategory.ACCOMMODATION,
                amount=7500.0,
                expense_date=today - timedelta(days=1),
                title="The Imperial Delhi Stay",
            )
            exp2 = Expense(
                trip_id=trip.id,
                category=ExpenseCategory.TRANSPORT,
                amount=4200.0,
                expense_date=today + timedelta(days=1),
                title="Vistara Delhi-Goa Flight",
            )
            exp3 = Expense(
                trip_id=trip.id,
                category=ExpenseCategory.ACTIVITIES,
                amount=3200.0,
                expense_date=today + timedelta(days=2),
                title="Grand Island Scuba Diving Advance",
            )
            session.add_all([exp1, exp2, exp3])
            await session.flush()

            # Create a Booking with partial deposit paid
            booking = Booking(
                trip_id=trip.id,
                traveller_id=user.id,
                reference="TRIP-BKG-8849",
                status=BookingStatus.CONFIRMED,
                subtotal=Decimal("28000.00"),
                discount=Decimal("0.00"),
                tax=Decimal("1700.00"),
                total=Decimal("29700.00"),
                currency="INR",
                placed_at=datetime.now(timezone.utc) - timedelta(days=2),
                confirmed_at=datetime.now(timezone.utc) - timedelta(days=2),
            )
            session.add(booking)
            await session.flush()

            # Payment record
            payment = Payment(
                booking_id=booking.id,
                amount=Decimal("5940.00"),
                currency="INR",
                kind=PaymentKind.DEPOSIT,
                status=PaymentStatus.CAPTURED,
                method="Card",
                gateway_reference="pay_sim_dep_88492",
            )
            session.add(payment)
            await session.flush()

            logger.info("Created ongoing trip, 3 stops, activities, stays, transports, expenses, and booking!")

        # 5. Create an upcoming trip: "Himalayan High Passes Trek"
        existing_trip2 = await session.scalar(
            select(Trip).where(Trip.user_id == user.id, Trip.title == "Himalayan High Passes Trek")
        )
        if existing_trip2 is None:
            trip2 = Trip(
                user_id=user.id,
                title="Himalayan High Passes Trek",
                description="High-altitude trek across Himachal Pradesh and Ladakh valleys.",
                start_date=date.today() + timedelta(days=25),
                end_date=date.today() + timedelta(days=32),
                budget=38000.0,
                traveller_count=3,
                status=TripStatus.UPCOMING,
                is_public=False,
            )
            session.add(trip2)
            await session.flush()

            stop_m = TripStop(
                trip_id=trip2.id,
                city_name="Manali",
                arrival_date=date.today() + timedelta(days=25),
                departure_date=date.today() + timedelta(days=28),
                order_index=1,
            )
            session.add(stop_m)
            await session.flush()

            act_m = ItineraryActivity(
                stop_id=stop_m.id,
                title="Solang Valley Paragliding & Hampta Pass Hike",
                activity_date=date.today() + timedelta(days=26),
                start_time=time(9, 0),
                end_time=time(16, 0),
                estimated_cost=2800.0,
                category=ActivityCategory.ADVENTURE,
                order_index=1,
            )
            session.add(act_m)

            logger.info("Created upcoming Himalayan trip!")

        await session.commit()
        logger.info("SEEDING COMPLETE!")
        print("\n" + "=" * 55)
        print("  TEST USER CREATED SUCCESSFULLY IN DATABASE")
        print("=" * 55)
        print(f"  Email / Username: {email}")
        print(f"  Password:         {password}")
        print(f"  Role:             Explorer / Traveller")
        print(f"  Trips Created:    2 (Golden Triangle & Goa + Himalayan Trek)")
        print(f"  Stops & Stays:    Delhi, Goa, Mumbai, Manali")
        print(f"  Transports:       Flight UK-812, Train Vande Bharat")
        print(f"  Bookings:         Ref TRIP-BKG-8849 (INR 29,700 Total, INR 5,940 Paid)")
        print(f"  Saved Places:     3 Destinations bookmarked")
        print("=" * 55 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
