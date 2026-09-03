"""Assist conversations and reviews.

Split the same way as ``test_adaptation.py``: the pure checks first -- schema
validation, the subject/column mapping, the concierge's offline fallback --
then the database-backed flows.

The review tests care about one thing above the rest: a rating is an **input to
the ranker**, not a testimonial. So they assert on provenance (you cannot rate
what you did not book) and on the side effect (the aggregate the ranker reads
actually moves, and moves back when the review goes away). A review that does
not change what gets recommended would pass a naive test and fail the point.
"""

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models import (
    Booking,
    BookingItem,
    Operator,
    OperatorMember,
    Review,
    Trip,
    TripStop,
    User,
    Vendor,
    VendorService,
)
from app.models.enums import (
    BookingItemStatus,
    BookingStatus,
    ComfortTier,
    OperatorRole,
    ReviewSubject,
    ServiceType,
    UserRole,
)
from app.schemas.engagement import ReviewCreateRequest, ThreadOpenRequest
from app.services.ai_service import AIService
from app.services.review_service import _column_for, _field_for, _target_of

TODAY = date.today()
SOON = TODAY + timedelta(days=30)


# ==========================================================================
# Pure
# ==========================================================================


def test_a_rating_outside_one_to_five_is_refused():
    for bad in (0, 6, -1):
        with pytest.raises(Exception):
            ReviewCreateRequest(
                subject=ReviewSubject.SERVICE, target_id=uuid.uuid4(), rating=bad
            )


def test_a_rating_inside_the_range_is_accepted():
    for good in (1, 3, 5):
        payload = ReviewCreateRequest(
            subject=ReviewSubject.SERVICE, target_id=uuid.uuid4(), rating=good
        )
        assert payload.rating == good


def test_a_thread_needs_a_real_subject():
    with pytest.raises(Exception):
        ThreadOpenRequest(subject="  a ", body="something")


def test_the_concierge_is_on_by_default():
    """Silence is the wrong default for somebody standing somewhere confused."""
    payload = ThreadOpenRequest(subject="Pickup time", body="When is it?")
    assert payload.ask_concierge is True


def test_each_subject_maps_to_its_own_column():
    """The four subjects must not collide onto one field."""
    fields = {s: _field_for(s) for s in ReviewSubject}
    assert len(set(fields.values())) == len(ReviewSubject)
    for subject, field in fields.items():
        assert _column_for(subject).key == field


def test_target_of_reads_back_the_right_column():
    target = uuid.uuid4()
    review = Review(
        author_id=uuid.uuid4(),
        subject=ReviewSubject.VENDOR,
        vendor_id=target,
        rating=4,
    )
    assert _target_of(review) == target


def test_the_concierge_fallback_never_invents_an_answer():
    """With no model reachable it restates the file and hands to a human.

    Guessing at somebody's accommodation while they stand outside it is the
    exact failure this guards against, so the fallback deliberately does not
    attempt the question.
    """
    text = AIService._concierge_fallback(
        {
            "trip_title": "Coast Run",
            "dates": "2026-10-01 to 2026-10-05",
            "stops": [{"city": "Goa"}, {"city": "Mumbai"}],
            "booked": [{"what": "Room"}, {"what": "Transfer"}],
        }
    )
    assert "Coast Run" in text
    assert "Goa" in text
    assert "2 component(s)" in text
    assert "coordinator" in text.lower()


def test_the_fallback_copes_with_an_empty_trip():
    text = AIService._concierge_fallback({"trip_title": "New Trip", "dates": "x"})
    assert "New Trip" in text
    assert "0 component(s)" in text


# ==========================================================================
# Database-backed
# ==========================================================================


async def _make_user(db: AsyncSession, email: str, first: str) -> User:
    user = User(
        first_name=first,
        last_name="Person",
        email=email,
        phone="+919876500003",
        city="Mumbai",
        country="India",
        hashed_password=hash_password("Str0ng!Pass"),
        role=UserRole.USER,
        is_email_verified=True,
    )
    db.add(user)
    await db.flush()
    return user


@pytest_asyncio.fixture
async def tour(db: AsyncSession) -> dict:
    """A completed, paid tour plus a bystander who booked nothing.

    The bystander is the whole point of the provenance assertions: without
    somebody who genuinely did not travel, "only travellers can review" passes
    even if the check is missing.
    """
    operator = Operator(name="Shoreline Tours", slug="shoreline-tours")
    db.add(operator)
    await db.flush()

    owner = await _make_user(db, "owner@shoreline.example.com", "Owner")
    traveller = await _make_user(db, "ada@shoreline.example.com", "Ada")
    bystander = await _make_user(db, "bo@shoreline.example.com", "Bo")

    db.add(
        OperatorMember(
            operator_id=operator.id, user_id=owner.id, role=OperatorRole.OWNER
        )
    )

    vendor = Vendor(
        operator_id=operator.id,
        name="Shoreline Stays",
        category=ServiceType.ACCOMMODATION,
        city="Goa",
        rating=Decimal("4.0"),
    )
    db.add(vendor)
    await db.flush()

    service = VendorService(
        vendor_id=vendor.id,
        service_type=ServiceType.ACCOMMODATION,
        name="Comfort Room",
        comfort_tier=ComfortTier.STANDARD,
        unit_price=Decimal("2000.00"),
        city="Goa",
        rating=Decimal("4.0"),
    )
    other_service = VendorService(
        vendor_id=vendor.id,
        service_type=ServiceType.ACCOMMODATION,
        name="Never Booked Room",
        comfort_tier=ComfortTier.BUDGET,
        unit_price=Decimal("1200.00"),
        city="Goa",
    )
    db.add_all([service, other_service])
    await db.flush()

    trip = Trip(
        user_id=traveller.id,
        title="Shore Run",
        start_date=SOON,
        end_date=SOON + timedelta(days=4),
        budget=Decimal("40000.00"),
        traveller_count=2,
        currency="INR",
    )
    db.add(trip)
    await db.flush()

    db.add(
        TripStop(
            trip_id=trip.id,
            city_name="Goa",
            arrival_date=SOON,
            departure_date=SOON + timedelta(days=3),
            order_index=0,
        )
    )

    booking = Booking(
        trip_id=trip.id,
        traveller_id=traveller.id,
        operator_id=operator.id,
        reference="TZSHORE001",
        status=BookingStatus.CONFIRMED,
        subtotal=Decimal("6000.00"),
        total=Decimal("6000.00"),
        currency="INR",
    )
    db.add(booking)
    await db.flush()

    db.add(
        BookingItem(
            booking_id=booking.id,
            service_id=service.id,
            component_type=ServiceType.ACCOMMODATION,
            title="Comfort Room",
            vendor_name="Shoreline Stays",
            city="Goa",
            service_date=SOON,
            quantity=1,
            units=3,
            unit_price=Decimal("2000.00"),
            total_price=Decimal("6000.00"),
            status=BookingItemStatus.CONFIRMED,
        )
    )
    await db.commit()

    return {
        "operator": operator,
        "owner": owner,
        "traveller": traveller,
        "bystander": bystander,
        "trip": trip,
        "booking": booking,
        "vendor": vendor,
        "service": service,
        "other_service": other_service,
    }


async def token_for(client: AsyncClient, email: str) -> str:
    resp = await client.post(
        "/auth/login", json={"email": email, "password": "Str0ng!Pass"}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# -- assist ----------------------------------------------------------------

async def test_opening_a_thread_routes_it_to_the_operator(
    client: AsyncClient, tour
):
    token = await token_for(client, "ada@shoreline.example.com")
    resp = await client.post(
        f"/trips/{tour['trip'].id}/assist",
        headers=auth(token),
        json={
            "subject": "Check-in time",
            "body": "What time can we check in?",
            "ask_concierge": False,
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["status"] == "open"
    assert data["operator_id"] == str(tour["operator"].id)
    assert data["messages"][0]["sender"] == "traveller"


async def test_the_concierge_answer_is_labelled_and_authorless(
    client: AsyncClient, tour
):
    """A traveller must be able to tell a machine from a colleague."""
    token = await token_for(client, "ada@shoreline.example.com")
    resp = await client.post(
        f"/trips/{tour['trip'].id}/assist",
        headers=auth(token),
        json={
            "subject": "Where am I on day two",
            "body": "Which city am I in on the second day?",
            "ask_concierge": True,
        },
    )
    messages = resp.json()["data"]["messages"]
    ai = [m for m in messages if m["sender"] == "ai"]
    assert ai, [m["sender"] for m in messages]
    assert ai[0]["sender_id"] is None
    assert "concierge" in (ai[0]["sender_name"] or "").lower()


async def test_an_ai_reply_does_not_resolve_the_thread(client: AsyncClient, tour):
    """Only a person closes a conversation."""
    token = await token_for(client, "ada@shoreline.example.com")
    resp = await client.post(
        f"/trips/{tour['trip'].id}/assist",
        headers=auth(token),
        json={"subject": "A question", "body": "Anything?", "ask_concierge": True},
    )
    assert resp.json()["data"]["status"] == "open"


async def test_a_bystander_cannot_read_a_conversation(client: AsyncClient, tour):
    owner_token = await token_for(client, "ada@shoreline.example.com")
    thread = (
        await client.post(
            f"/trips/{tour['trip'].id}/assist",
            headers=auth(owner_token),
            json={"subject": "Private", "body": "Hello", "ask_concierge": False},
        )
    ).json()["data"]

    other = await token_for(client, "bo@shoreline.example.com")
    assert (
        await client.get(f"/assist/{thread['id']}", headers=auth(other))
    ).status_code == 403


async def test_a_thread_cannot_be_opened_on_someone_elses_trip(
    client: AsyncClient, tour
):
    token = await token_for(client, "bo@shoreline.example.com")
    resp = await client.post(
        f"/trips/{tour['trip'].id}/assist",
        headers=auth(token),
        json={"subject": "Nosy", "body": "Tell me", "ask_concierge": False},
    )
    assert resp.status_code == 403


async def test_staff_see_the_thread_and_answering_claims_it(
    client: AsyncClient, tour
):
    traveller_token = await token_for(client, "ada@shoreline.example.com")
    thread = (
        await client.post(
            f"/trips/{tour['trip'].id}/assist",
            headers=auth(traveller_token),
            json={"subject": "Pickup", "body": "When?", "ask_concierge": False},
        )
    ).json()["data"]

    owner_token = await token_for(client, "owner@shoreline.example.com")
    listed = await client.get("/operator/assist?limit=50", headers=auth(owner_token))
    assert thread["id"] in [t["id"] for t in listed.json()["data"]["items"]]

    answered = await client.post(
        f"/operator/assist/{thread['id']}/messages",
        headers=auth(owner_token),
        json={"body": "Nine in the morning.", "resolve": False},
    )
    data = answered.json()["data"]
    assert data["assigned_member_id"] is not None
    # Answering puts the ball with the traveller, not back in the queue.
    assert data["status"] == "waiting"


async def test_replying_with_resolve_closes_it_out(client: AsyncClient, tour):
    traveller_token = await token_for(client, "ada@shoreline.example.com")
    thread = (
        await client.post(
            f"/trips/{tour['trip'].id}/assist",
            headers=auth(traveller_token),
            json={"subject": "Quick one", "body": "?", "ask_concierge": False},
        )
    ).json()["data"]

    owner_token = await token_for(client, "owner@shoreline.example.com")
    resp = await client.post(
        f"/operator/assist/{thread['id']}/messages",
        headers=auth(owner_token),
        json={"body": "Sorted.", "resolve": True},
    )
    data = resp.json()["data"]
    assert data["status"] == "resolved"
    assert data["resolved_at"] is not None


async def test_a_traveller_reply_reopens_the_thread(client: AsyncClient, tour):
    traveller_token = await token_for(client, "ada@shoreline.example.com")
    thread = (
        await client.post(
            f"/trips/{tour['trip'].id}/assist",
            headers=auth(traveller_token),
            json={"subject": "Again", "body": "?", "ask_concierge": False},
        )
    ).json()["data"]

    owner_token = await token_for(client, "owner@shoreline.example.com")
    await client.post(
        f"/operator/assist/{thread['id']}/messages",
        headers=auth(owner_token),
        json={"body": "Answered.", "resolve": True},
    )
    resp = await client.post(
        f"/assist/{thread['id']}/messages",
        headers=auth(traveller_token),
        json={"body": "One more thing.", "ask_concierge": False},
    )
    assert resp.json()["data"]["status"] == "open"


async def test_a_traveller_is_refused_the_operator_queue(client: AsyncClient, tour):
    token = await token_for(client, "ada@shoreline.example.com")
    assert (
        await client.get("/operator/assist", headers=auth(token))
    ).status_code == 403


# -- reviews ---------------------------------------------------------------

async def test_a_booked_component_can_be_reviewed(client: AsyncClient, tour):
    token = await token_for(client, "ada@shoreline.example.com")
    resp = await client.post(
        "/reviews",
        headers=auth(token),
        json={
            "subject": "service",
            "target_id": str(tour["service"].id),
            "rating": 5,
            "title": "Excellent",
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["is_verified"] is True
    assert data["booking_id"] == str(tour["booking"].id)


async def test_reviewing_something_you_never_booked_is_refused(
    client: AsyncClient, tour
):
    """The basis for trusting the rating the ranker reads."""
    token = await token_for(client, "bo@shoreline.example.com")
    resp = await client.post(
        "/reviews",
        headers=auth(token),
        json={"subject": "service", "target_id": str(tour["service"].id), "rating": 1},
    )
    assert resp.status_code == 403


async def test_reviewing_a_service_you_did_not_book_is_refused(
    client: AsyncClient, tour
):
    token = await token_for(client, "ada@shoreline.example.com")
    resp = await client.post(
        "/reviews",
        headers=auth(token),
        json={
            "subject": "service",
            "target_id": str(tour["other_service"].id),
            "rating": 5,
        },
    )
    assert resp.status_code == 403


async def test_a_review_moves_the_rating_the_ranker_reads(
    client: AsyncClient, tour, db: AsyncSession
):
    """The whole point of the phase: Complete feeds Discover."""
    token = await token_for(client, "ada@shoreline.example.com")
    await client.post(
        "/reviews",
        headers=auth(token),
        json={"subject": "service", "target_id": str(tour["service"].id), "rating": 2},
    )
    service = await db.get(VendorService, tour["service"].id)
    await db.refresh(service)
    assert Decimal(str(service.rating)) == Decimal("2.0")


async def test_a_service_review_rolls_up_to_its_vendor(
    client: AsyncClient, tour, db: AsyncSession
):
    """Travellers rate the room, not the company that owns it."""
    token = await token_for(client, "ada@shoreline.example.com")
    await client.post(
        "/reviews",
        headers=auth(token),
        json={"subject": "service", "target_id": str(tour["service"].id), "rating": 3},
    )
    vendor = await db.get(Vendor, tour["vendor"].id)
    await db.refresh(vendor)
    assert Decimal(str(vendor.rating)) == Decimal("3.0")


async def test_deleting_the_last_review_clears_the_rating(
    client: AsyncClient, tour, db: AsyncSession
):
    """A rating no review supports is worse than no rating at all."""
    token = await token_for(client, "ada@shoreline.example.com")
    created = (
        await client.post(
            "/reviews",
            headers=auth(token),
            json={
                "subject": "service",
                "target_id": str(tour["service"].id),
                "rating": 5,
            },
        )
    ).json()["data"]

    await client.delete(f"/reviews/{created['id']}", headers=auth(token))
    service = await db.get(VendorService, tour["service"].id)
    await db.refresh(service)
    assert service.rating is None


async def test_a_second_review_of_the_same_thing_is_refused(
    client: AsyncClient, tour
):
    token = await token_for(client, "ada@shoreline.example.com")
    payload = {
        "subject": "service",
        "target_id": str(tour["service"].id),
        "rating": 4,
    }
    assert (
        await client.post("/reviews", headers=auth(token), json=payload)
    ).status_code == 201
    assert (
        await client.post("/reviews", headers=auth(token), json=payload)
    ).status_code == 409


async def test_editing_your_own_review_recomputes_the_aggregate(
    client: AsyncClient, tour, db: AsyncSession
):
    token = await token_for(client, "ada@shoreline.example.com")
    created = (
        await client.post(
            "/reviews",
            headers=auth(token),
            json={
                "subject": "service",
                "target_id": str(tour["service"].id),
                "rating": 5,
            },
        )
    ).json()["data"]

    await client.put(
        f"/reviews/{created['id']}", headers=auth(token), json={"rating": 1}
    )
    service = await db.get(VendorService, tour["service"].id)
    await db.refresh(service)
    assert Decimal(str(service.rating)) == Decimal("1.0")


async def test_you_cannot_edit_someone_elses_review(client: AsyncClient, tour):
    token = await token_for(client, "ada@shoreline.example.com")
    created = (
        await client.post(
            "/reviews",
            headers=auth(token),
            json={
                "subject": "service",
                "target_id": str(tour["service"].id),
                "rating": 5,
            },
        )
    ).json()["data"]

    other = await token_for(client, "bo@shoreline.example.com")
    assert (
        await client.put(
            f"/reviews/{created['id']}", headers=auth(other), json={"rating": 1}
        )
    ).status_code == 403


async def test_the_public_listing_carries_a_distribution(client: AsyncClient, tour):
    """An average alone cannot say whether it came from fours or from ones."""
    token = await token_for(client, "ada@shoreline.example.com")
    await client.post(
        "/reviews",
        headers=auth(token),
        json={"subject": "service", "target_id": str(tour["service"].id), "rating": 4},
    )
    resp = await client.get(f"/reviews/service/{tour['service'].id}")
    summary = resp.json()["data"]["summary"]
    assert summary["count"] == 1
    assert summary["distribution"]["4"] == 1
    assert sum(summary["distribution"].values()) == summary["count"]


async def test_pending_only_lists_what_you_actually_went_to(
    client: AsyncClient, tour
):
    token = await token_for(client, "ada@shoreline.example.com")
    pending = (await client.get("/reviews/pending", headers=auth(token))).json()[
        "data"
    ]
    targets = {p["target_id"] for p in pending}
    assert str(tour["service"].id) in targets
    assert str(tour["other_service"].id) not in targets


async def test_pending_drops_what_you_have_already_rated(client: AsyncClient, tour):
    token = await token_for(client, "ada@shoreline.example.com")
    await client.post(
        "/reviews",
        headers=auth(token),
        json={"subject": "service", "target_id": str(tour["service"].id), "rating": 5},
    )
    pending = (await client.get("/reviews/pending", headers=auth(token))).json()[
        "data"
    ]
    assert str(tour["service"].id) not in {p["target_id"] for p in pending}


async def test_a_bystander_has_nothing_to_review(client: AsyncClient, tour):
    token = await token_for(client, "bo@shoreline.example.com")
    pending = (await client.get("/reviews/pending", headers=auth(token))).json()[
        "data"
    ]
    assert pending == []


async def test_you_can_review_your_own_trip_without_a_booking(
    client: AsyncClient, tour
):
    token = await token_for(client, "ada@shoreline.example.com")
    resp = await client.post(
        "/reviews",
        headers=auth(token),
        json={"subject": "trip", "target_id": str(tour["trip"].id), "rating": 5},
    )
    assert resp.status_code == 201, resp.text


async def test_you_cannot_review_someone_elses_trip(client: AsyncClient, tour):
    token = await token_for(client, "bo@shoreline.example.com")
    resp = await client.post(
        "/reviews",
        headers=auth(token),
        json={"subject": "trip", "target_id": str(tour["trip"].id), "rating": 1},
    )
    assert resp.status_code == 403
