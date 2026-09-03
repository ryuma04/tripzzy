"""Dynamic tour management: the impact engine, conflicts, and the review flow.

The file is split deliberately. The first half is **pure**: the arithmetic and
the conflict rules exercised against plain objects, with no database and no
network, so the part of the system that produces the numbers can be checked in
milliseconds. The second half drives the API end to end and needs Postgres.

That split is not tidiness. An impact report that is cheerfully wrong is worse
than one that errors, so the arithmetic deserves tests that are cheap enough to
run on every change rather than only in the slow suite.
"""

import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from types import SimpleNamespace

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
    ServiceAvailability,
    Trip,
    TripStop,
    User,
    Vendor,
    VendorService,
)
from app.models.enums import (
    BookingItemStatus,
    BookingStatus,
    ChangeRequestType,
    ComfortTier,
    ConflictSeverity,
    OperatorRole,
    ServiceType,
    TravelPace,
    UserRole,
)
from app.schemas.adaptation import ChangeProposal
from app.services.adaptation_service import (
    AffectedItem,
    ImpactReport,
    _jsonable,
)
from app.services.ai_service import AIService
from app.services.conflict_service import (
    TRANSFER_BUFFER_MINUTES,
    Conflict,
    ConflictService,
    _overlaps,
)

TODAY = date.today()
SOON = TODAY + timedelta(days=40)


def _id() -> uuid.UUID:
    return uuid.uuid4()


# ==========================================================================
# Pure: the impact arithmetic
# ==========================================================================


def _affected(**kwargs) -> AffectedItem:
    defaults = dict(
        item_id=_id(),
        title="Room",
        component_type="accommodation",
        service_date=SOON,
        action="replace",
        original_cost=Decimal("0"),
        refund=Decimal("0"),
        penalty=Decimal("0"),
        replacement_cost=Decimal("0"),
    )
    return AffectedItem(**{**defaults, **kwargs})


def test_net_delta_is_what_leaves_the_travellers_pocket():
    """The delta is new outlay minus money returned -- nothing else."""
    report = ImpactReport(
        change_type=ChangeRequestType.REPLACE_COMPONENT,
        currency="INR",
        original_total=Decimal("6000.00"),
        refund_total=Decimal("6000.00"),
        replacement_total=Decimal("8000.00"),
    )
    assert report.net_delta == Decimal("2000.00")


def test_penalties_are_not_charged_twice():
    """A penalty is the unrefunded part of the original, not an extra fee.

    Adding it on top of the shortfall would bill the traveller for the same
    money twice, which is the easiest possible way for this engine to lie.
    """
    report = ImpactReport(
        change_type=ChangeRequestType.REPLACE_COMPONENT,
        currency="INR",
        original_total=Decimal("6000.00"),
        refund_total=Decimal("4800.00"),
        penalty_total=Decimal("1200.00"),
        replacement_total=Decimal("6000.00"),
    )
    # Out of pocket: 6000 spent, 4800 back. Not 6000 - 4800 + 1200.
    assert report.net_delta == Decimal("1200.00")


def test_a_cheaper_replacement_is_a_refund_not_a_charge():
    report = ImpactReport(
        change_type=ChangeRequestType.REPLACE_COMPONENT,
        currency="INR",
        refund_total=Decimal("9000.00"),
        replacement_total=Decimal("6500.00"),
    )
    assert report.net_delta == Decimal("-2500.00")
    assert report.as_dict()["cost"]["direction"] == "decrease"


def test_cancelling_returns_money_and_buys_nothing():
    report = ImpactReport(
        change_type=ChangeRequestType.CANCEL_COMPONENT,
        currency="INR",
        original_total=Decimal("6000.00"),
        refund_total=Decimal("6000.00"),
    )
    assert report.net_delta == Decimal("-6000.00")


def test_direction_agrees_with_the_delta():
    for refund, replacement, expected in (
        ("0.00", "1000.00", "increase"),
        ("1000.00", "0.00", "decrease"),
        ("1000.00", "1000.00", "none"),
    ):
        report = ImpactReport(
            change_type=ChangeRequestType.ADD_COMPONENT,
            currency="INR",
            refund_total=Decimal(refund),
            replacement_total=Decimal(replacement),
        )
        assert report.as_dict()["cost"]["direction"] == expected


def test_the_report_is_json_safe():
    """It is written straight into JSONB, so nothing exotic may survive.

    The ranked alternatives arrive from the inventory ranker carrying live
    UUIDs and Decimals; if any reach the column the insert fails at runtime.
    """
    import json

    report = ImpactReport(
        change_type=ChangeRequestType.REPLACE_COMPONENT,
        currency="INR",
        replacement_total=Decimal("1234.56"),
        affected=[_affected(new_service_id=_id(), new_date=SOON)],
        alternatives=[
            {"service_id": _id(), "total_price": Decimal("999.99"), "on": SOON}
        ],
        conflicts=[
            Conflict(
                code="X",
                severity=ConflictSeverity.WARNING,
                message="m",
                entity_id=_id(),
                on_date=SOON,
            )
        ],
    )
    json.dumps(report.as_dict())  # must not raise


def test_money_survives_as_a_string_not_a_float():
    """Currency through a float is how rounding error gets in."""
    report = ImpactReport(
        change_type=ChangeRequestType.ADD_COMPONENT,
        currency="INR",
        replacement_total=Decimal("0.10"),
    )
    assert report.as_dict()["cost"]["replacement_total"] == "0.10"


def test_jsonable_coerces_every_awkward_type():
    value = _jsonable(
        {
            "id": uuid.UUID("11111111-1111-1111-1111-111111111111"),
            "money": Decimal("10.50"),
            "when": date(2026, 1, 2),
            "nested": [{"at": datetime(2026, 1, 2, 3, 4, 5)}],
            "plain": 7,
        }
    )
    assert value["id"] == "11111111-1111-1111-1111-111111111111"
    assert value["money"] == "10.50"
    assert value["when"] == "2026-01-02"
    assert value["nested"][0]["at"].startswith("2026-01-02")
    assert value["plain"] == 7


# ==========================================================================
# Pure: conflict detection
# ==========================================================================


def _stop(city: str, arrive: date, depart: date, *, order: int = 0, **kw):
    return SimpleNamespace(
        id=_id(),
        city_name=city,
        arrival_date=arrive,
        departure_date=depart,
        order_index=order,
        activities=kw.get("activities", []),
        accommodations=kw.get("accommodations", []),
    )


def _activity(title: str, on: date, start: time | None = None, end: time | None = None):
    return SimpleNamespace(
        id=_id(), title=title, activity_date=on, start_time=start, end_time=end
    )


def test_overlapping_times_are_detected():
    assert _overlaps(time(10, 0), time(12, 0), time(11, 0), time(13, 0))
    assert not _overlaps(time(10, 0), time(11, 0), time(11, 0), time(12, 0))


def test_an_untimed_activity_clashes_with_nothing():
    """"Some time on Tuesday" cannot be proven to collide with 14:00.

    Guessing would produce warnings nobody can act on.
    """
    assert not _overlaps(None, None, time(14, 0), time(16, 0))


def test_an_open_ended_activity_gets_a_nominal_hour():
    assert _overlaps(time(10, 0), None, time(10, 30), time(11, 30))


def test_stops_that_overlap_are_reported():
    stops = [
        _stop("Goa", SOON, SOON + timedelta(days=3)),
        _stop("Mumbai", SOON + timedelta(days=2), SOON + timedelta(days=5), order=1),
    ]
    found = ConflictService.stop_conflicts(stops)
    assert [c.code for c in found] == ["STOP_OVERLAP"]
    assert found[0].severity is ConflictSeverity.WARNING


def test_a_same_day_city_change_is_not_a_gap():
    """Leaving Goa on the 5th and reaching Mumbai on the 6th is normal."""
    stops = [
        _stop("Goa", SOON, SOON + timedelta(days=3)),
        _stop("Mumbai", SOON + timedelta(days=4), SOON + timedelta(days=6), order=1),
    ]
    assert ConflictService.stop_conflicts(stops) == []


def test_an_unplanned_stretch_is_a_note_not_a_warning():
    stops = [
        _stop("Goa", SOON, SOON + timedelta(days=2)),
        _stop("Mumbai", SOON + timedelta(days=6), SOON + timedelta(days=8), order=1),
    ]
    found = ConflictService.stop_conflicts(stops)
    assert found[0].code == "ITINERARY_GAP"
    assert found[0].severity is ConflictSeverity.INFO
    assert found[0].details["gap_days"] == 3


def test_an_activity_outside_its_stop_is_a_blocker():
    stop = _stop(
        "Goa",
        SOON,
        SOON + timedelta(days=2),
        activities=[_activity("Beach walk", SOON + timedelta(days=9))],
    )
    found = ConflictService.activity_conflicts([stop])
    assert found[0].code == "ACTIVITY_OUTSIDE_STOP"
    assert found[0].severity is ConflictSeverity.BLOCKER


def test_two_activities_at_the_same_time_clash():
    stop = _stop(
        "Goa",
        SOON,
        SOON + timedelta(days=2),
        activities=[
            _activity("Fort tour", SOON, time(10, 0), time(13, 0)),
            _activity("Cooking class", SOON, time(12, 0), time(14, 0)),
        ],
    )
    found = ConflictService.activity_conflicts([stop])
    assert [c.code for c in found] == ["ACTIVITY_TIME_CLASH"]


def test_accommodation_that_no_longer_matches_its_stop():
    """The commonest way an adapted itinerary quietly breaks."""
    stop = _stop(
        "Goa",
        SOON + timedelta(days=4),
        SOON + timedelta(days=7),
        accommodations=[
            SimpleNamespace(
                id=_id(),
                name="Sea View",
                check_in=SOON,
                check_out=SOON + timedelta(days=3),
            )
        ],
    )
    found = ConflictService.accommodation_conflicts([stop])
    assert found[0].code == "ACCOMMODATION_DATE_MISMATCH"


def _leg(origin, destination, depart: datetime, arrive: datetime):
    return SimpleNamespace(
        id=_id(),
        origin_stop_id=origin.id if origin else None,
        destination_stop_id=destination.id if destination else None,
        departure_time=depart,
        arrival_time=arrive,
        transport_type=SimpleNamespace(value="flight"),
    )


def test_a_transfer_pointing_at_a_removed_stop_is_orphaned():
    ghost = _stop("Leh", SOON, SOON + timedelta(days=2))
    leg = _leg(
        None,
        ghost,
        datetime.combine(SOON, time(8, 0)),
        datetime.combine(SOON, time(11, 0)),
    )
    found = ConflictService.transport_conflicts([leg], [])
    assert found[0].code == "TRANSPORT_ORPHANED"
    assert found[0].severity is ConflictSeverity.BLOCKER


def test_a_transfer_arriving_after_the_stop_starts():
    destination = _stop("Goa", SOON, SOON + timedelta(days=3))
    leg = _leg(
        None,
        destination,
        datetime.combine(SOON + timedelta(days=1), time(8, 0)),
        datetime.combine(SOON + timedelta(days=1), time(11, 0)),
    )
    found = ConflictService.transport_conflicts([leg], [destination])
    assert [c.code for c in found] == ["TRANSPORT_ARRIVES_LATE"]


def test_too_little_time_between_landing_and_the_first_activity():
    destination = _stop(
        "Goa",
        SOON,
        SOON + timedelta(days=3),
        activities=[_activity("Walking tour", SOON, time(11, 30), time(13, 0))],
    )
    leg = _leg(
        None,
        destination,
        datetime.combine(SOON, time(8, 0)),
        datetime.combine(SOON, time(10, 30)),
    )
    found = ConflictService.transport_conflicts([leg], [destination])
    assert [c.code for c in found] == ["INSUFFICIENT_TRANSFER_TIME"]


def test_a_comfortable_transfer_is_not_reported():
    gap = timedelta(minutes=TRANSFER_BUFFER_MINUTES + 60)
    landing = datetime.combine(SOON, time(8, 0))
    destination = _stop(
        "Goa",
        SOON,
        SOON + timedelta(days=3),
        activities=[
            _activity("Walking tour", SOON, (landing + gap).time(), time(23, 0))
        ],
    )
    leg = _leg(None, destination, datetime.combine(SOON, time(5, 0)), landing)
    assert ConflictService.transport_conflicts([leg], [destination]) == []


def test_a_booked_component_outside_the_trip_is_a_blocker():
    trip = SimpleNamespace(
        start_date=SOON,
        end_date=SOON + timedelta(days=5),
        stops=[_stop("Goa", SOON, SOON + timedelta(days=3))],
    )
    item = SimpleNamespace(
        id=_id(),
        title="Sea View Room",
        city="Goa",
        service_date=SOON + timedelta(days=20),
        total_price=Decimal("6000.00"),
    )
    found = ConflictService.booking_conflicts([item], trip)
    assert found[0].code == "BOOKED_ITEM_OUTSIDE_TRIP"
    assert found[0].severity is ConflictSeverity.BLOCKER


def test_a_booked_component_in_a_city_no_longer_visited():
    trip = SimpleNamespace(
        start_date=SOON,
        end_date=SOON + timedelta(days=5),
        stops=[_stop("Goa", SOON, SOON + timedelta(days=3))],
    )
    item = SimpleNamespace(
        id=_id(),
        title="Leh Homestay",
        city="Leh",
        service_date=SOON + timedelta(days=1),
        total_price=Decimal("4000.00"),
    )
    found = ConflictService.booking_conflicts([item], trip)
    assert found[0].code == "BOOKED_ITEM_ORPHANED"


def test_pace_is_silent_when_no_pace_was_stated():
    """An unstated preference is not a preference for anything."""
    stop = _stop(
        "Goa",
        SOON,
        SOON + timedelta(days=1),
        activities=[_activity(f"Thing {i}", SOON) for i in range(9)],
    )
    assert ConflictService.pace_conflicts([stop], None) == []


def test_a_relaxed_traveller_with_a_packed_day_is_nudged():
    stop = _stop(
        "Goa",
        SOON,
        SOON + timedelta(days=1),
        activities=[_activity(f"Thing {i}", SOON) for i in range(6)],
    )
    found = ConflictService.pace_conflicts([stop], TravelPace.RELAXED)
    assert found[0].code == "PACE_EXCEEDED"
    assert found[0].severity is ConflictSeverity.INFO
    assert found[0].details["count"] == 6


def test_the_same_day_is_fine_for_a_packed_traveller():
    stop = _stop(
        "Goa",
        SOON,
        SOON + timedelta(days=1),
        activities=[_activity(f"Thing {i}", SOON) for i in range(6)],
    )
    assert ConflictService.pace_conflicts([stop], TravelPace.PACKED) == []


# ==========================================================================
# Pure: proposal validation
# ==========================================================================


def test_a_date_shift_needs_a_number_of_days():
    with pytest.raises(ValueError, match="shift_days"):
        ChangeProposal().validated_for(ChangeRequestType.DATE_SHIFT)


def test_a_replacement_needs_the_component_it_replaces():
    with pytest.raises(ValueError, match="booking_item_id"):
        ChangeProposal(new_service_id=_id()).validated_for(
            ChangeRequestType.REPLACE_COMPONENT
        )


def test_a_replacement_may_omit_the_new_service():
    """That is the "find me something else" case, answered with a shortlist."""
    proposal = ChangeProposal(booking_item_id=_id()).validated_for(
        ChangeRequestType.REPLACE_COMPONENT
    )
    assert "new_service_id" not in proposal


def test_an_addition_needs_a_service_and_a_date():
    with pytest.raises(ValueError, match="service_date"):
        ChangeProposal(service_id=_id()).validated_for(
            ChangeRequestType.ADD_COMPONENT
        )


# ==========================================================================
# Pure: narration falls back rather than failing
# ==========================================================================


def test_the_fallback_narration_uses_only_engine_figures():
    """No key, no network: the explanation still has to be right.

    Every number in it is lifted from the report, which is the whole reason
    narration can be optional -- the model adds warmth, never arithmetic.
    """
    report = ImpactReport(
        change_type=ChangeRequestType.REPLACE_COMPONENT,
        currency="INR",
        summary="Replacing Sea View with Palm Grove costs INR 2000.00 more.",
        refund_total=Decimal("6000.00"),
        penalty_total=Decimal("0.00"),
        replacement_total=Decimal("8000.00"),
    ).as_dict()

    text = AIService._impact_fallback(report)
    assert "2000.00" in text
    assert "pay" in text.lower()


def test_the_fallback_says_plainly_when_a_change_cannot_go_ahead():
    report = ImpactReport(
        change_type=ChangeRequestType.ADD_COMPONENT,
        currency="INR",
        feasible=False,
        summary="Adding Palm Grove costs INR 8000.00.",
        blockers=["Palm Grove is closed on that date."],
    ).as_dict()

    text = AIService._impact_fallback(report)
    assert "closed on that date" in text


def test_the_fallback_names_the_penalty_when_one_applies():
    report = ImpactReport(
        change_type=ChangeRequestType.CANCEL_COMPONENT,
        currency="INR",
        summary="Cancelling.",
        refund_total=Decimal("4800.00"),
        penalty_total=Decimal("1200.00"),
    ).as_dict()

    assert "1200.00" in AIService._impact_fallback(report)


# ==========================================================================
# Database-backed: the review flow end to end
# ==========================================================================


async def _make_user(db: AsyncSession, email: str, first: str) -> User:
    user = User(
        first_name=first,
        last_name="Person",
        email=email,
        phone="+919876500002",
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
    """A paid-for tour with a graded catalogue behind it, and a rival operator.

    The catalogue needs *several* genuinely different options or the ranking
    has nothing to rank; the rival exists so the scoping assertions have
    something real to fail against.
    """
    operator = Operator(name="Coastline Tours", slug="coastline-tours")
    rival_operator = Operator(name="Highland Tours", slug="highland-tours")
    db.add_all([operator, rival_operator])
    await db.flush()

    owner = await _make_user(db, "owner@coastline.example.com", "Owner")
    rival = await _make_user(db, "owner@highland.example.com", "Rival")
    traveller = await _make_user(db, "ada@coastline.example.com", "Ada")
    bystander = await _make_user(db, "bo@coastline.example.com", "Bo")

    db.add_all(
        [
            OperatorMember(
                operator_id=operator.id, user_id=owner.id, role=OperatorRole.OWNER
            ),
            OperatorMember(
                operator_id=rival_operator.id,
                user_id=rival.id,
                role=OperatorRole.OWNER,
            ),
        ]
    )

    vendor = Vendor(
        operator_id=operator.id,
        name="Coastline Stays",
        category=ServiceType.ACCOMMODATION,
        city="Goa",
        reliability_score=90,
    )
    db.add(vendor)
    await db.flush()

    services = []
    for tier, name, price in (
        (ComfortTier.BUDGET, "Backpacker Room", "1500.00"),
        (ComfortTier.STANDARD, "Comfort Room", "2000.00"),
        (ComfortTier.PREMIUM, "Boutique Room", "3200.00"),
    ):
        service = VendorService(
            vendor_id=vendor.id,
            service_type=ServiceType.ACCOMMODATION,
            name=name,
            comfort_tier=tier,
            unit_price=Decimal(price),
            city="Goa",
            # Well inside the window, so cancelling refunds in full and the
            # arithmetic under test is the replacement rather than the penalty.
            free_cancellation_days=7,
            cancellation_penalty_pct=50,
            rating=Decimal("4.2"),
        )
        db.add(service)
        services.append(service)
    await db.flush()

    for service in services:
        for offset in range(0, 12):
            db.add(
                ServiceAvailability(
                    service_id=service.id,
                    on_date=SOON + timedelta(days=offset),
                    capacity_total=10,
                    capacity_booked=0,
                )
            )

    trip = Trip(
        user_id=traveller.id,
        title="Coast Run",
        start_date=SOON,
        end_date=SOON + timedelta(days=5),
        budget=Decimal("50000.00"),
        traveller_count=2,
        currency="INR",
    )
    db.add(trip)
    await db.flush()

    stop = TripStop(
        trip_id=trip.id,
        city_name="Goa",
        country="India",
        arrival_date=SOON,
        departure_date=SOON + timedelta(days=3),
        order_index=0,
    )
    db.add(stop)

    booking = Booking(
        trip_id=trip.id,
        traveller_id=traveller.id,
        operator_id=operator.id,
        reference="TZCOAST001",
        status=BookingStatus.CONFIRMED,
        subtotal=Decimal("6000.00"),
        total=Decimal("6000.00"),
        currency="INR",
    )
    db.add(booking)
    await db.flush()

    item = BookingItem(
        booking_id=booking.id,
        service_id=services[1].id,
        stop_id=stop.id,
        component_type=ServiceType.ACCOMMODATION,
        title="Comfort Room",
        vendor_name="Coastline Stays",
        city="Goa",
        service_date=SOON,
        end_date=SOON + timedelta(days=3),
        quantity=1,
        units=3,
        unit_price=Decimal("2000.00"),
        total_price=Decimal("6000.00"),
        free_cancellation_days=7,
        cancellation_penalty_pct=50,
        status=BookingItemStatus.CONFIRMED,
    )
    db.add(item)
    await db.commit()

    return {
        "operator": operator,
        "rival_operator": rival_operator,
        "owner": owner,
        "rival": rival,
        "traveller": traveller,
        "bystander": bystander,
        "trip": trip,
        "stop": stop,
        "booking": booking,
        "item": item,
        "services": services,
    }


async def token_for(client: AsyncClient, email: str) -> str:
    resp = await client.post(
        "/auth/login", json={"email": email, "password": "Str0ng!Pass"}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# -- assessment ------------------------------------------------------------

async def test_assessing_a_replacement_costs_it_from_the_catalogue(
    client: AsyncClient, tour
):
    token = await token_for(client, "ada@coastline.example.com")
    resp = await client.post(
        f"/trips/{tour['trip'].id}/assess-change",
        headers=auth(token),
        json={
            "type": "replace_component",
            "proposal": {
                "booking_item_id": str(tour["item"].id),
                "new_service_id": str(tour["services"][2].id),
            },
        },
    )
    assert resp.status_code == 200, resp.text
    cost = resp.json()["data"]["impact"]["cost"]
    # Boutique at 3200 for 3 nights = 9600, against a full 6000 refund.
    assert cost["replacement_total"] == "9600.00"
    assert cost["refund_total"] == "6000.00"
    assert cost["net_delta"] == "3600.00"
    assert cost["direction"] == "increase"


async def test_assessing_writes_nothing(client: AsyncClient, tour, db: AsyncSession):
    """A preview that moves the tour would be a bug with a refund attached."""
    token = await token_for(client, "ada@coastline.example.com")
    await client.post(
        f"/trips/{tour['trip'].id}/assess-change",
        headers=auth(token),
        json={"type": "date_shift", "proposal": {"shift_days": 5}},
    )
    await db.refresh(tour["trip"])
    await db.refresh(tour["item"])
    assert tour["trip"].start_date == SOON
    assert tour["item"].status is BookingItemStatus.CONFIRMED


async def test_a_date_shift_reports_what_it_breaks(client: AsyncClient, tour):
    token = await token_for(client, "ada@coastline.example.com")
    resp = await client.post(
        f"/trips/{tour['trip'].id}/assess-change",
        headers=auth(token),
        json={"type": "date_shift", "proposal": {"shift_days": 6}},
    )
    impact = resp.json()["data"]["impact"]
    assert len(impact["affected_items"]) == 1
    assert impact["affected_items"][0]["new_date"] == (
        SOON + timedelta(days=6)
    ).isoformat()
    codes = {c["code"] for c in impact["conflicts"]}
    assert codes & {"BOOKED_ITEM_OUTSIDE_TRIP", "BOOKED_ITEM_DATE_MISMATCH"}


async def test_a_replacement_with_no_choice_returns_a_shortlist(
    client: AsyncClient, tour
):
    token = await token_for(client, "ada@coastline.example.com")
    resp = await client.post(
        f"/trips/{tour['trip'].id}/assess-change",
        headers=auth(token),
        json={
            "type": "replace_component",
            "proposal": {"booking_item_id": str(tour["item"].id)},
        },
    )
    impact = resp.json()["data"]["impact"]
    assert len(impact["alternatives"]) >= 2
    assert all(
        o["service_id"] != str(tour["services"][1].id) for o in impact["alternatives"]
    )


async def test_a_blocked_date_makes_a_change_infeasible(
    client: AsyncClient, tour, db: AsyncSession
):
    from sqlalchemy import select

    target = SOON + timedelta(days=1)
    row = await db.scalar(
        select(ServiceAvailability).where(
            ServiceAvailability.service_id == tour["services"][2].id,
            ServiceAvailability.on_date == target,
        )
    )
    row.is_blocked = True
    await db.commit()

    token = await token_for(client, "ada@coastline.example.com")
    resp = await client.post(
        f"/trips/{tour['trip'].id}/assess-change",
        headers=auth(token),
        json={
            "type": "replace_component",
            "proposal": {
                "booking_item_id": str(tour["item"].id),
                "new_service_id": str(tour["services"][2].id),
                "new_date": target.isoformat(),
            },
        },
    )
    impact = resp.json()["data"]["impact"]
    assert impact["feasible"] is False
    assert impact["blockers"]


async def test_someone_elses_trip_cannot_be_assessed(client: AsyncClient, tour):
    token = await token_for(client, "bo@coastline.example.com")
    resp = await client.post(
        f"/trips/{tour['trip'].id}/assess-change",
        headers=auth(token),
        json={"type": "date_shift", "proposal": {"shift_days": 2}},
    )
    assert resp.status_code == 403


# -- submission and review -------------------------------------------------

async def _submit(client: AsyncClient, tour, token: str) -> dict:
    resp = await client.post(
        f"/trips/{tour['trip'].id}/change-requests",
        headers=auth(token),
        json={
            "type": "replace_component",
            "proposal": {
                "booking_item_id": str(tour["item"].id),
                "new_service_id": str(tour["services"][0].id),
            },
            "reason": "Trimming the budget.",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def test_submitting_freezes_the_impact_report(client: AsyncClient, tour):
    token = await token_for(client, "ada@coastline.example.com")
    request = await _submit(client, tour, token)
    assert request["status"] == "pending"
    assert request["impact"]["cost"]["net_delta"] == request["net_cost_delta"]
    assert request["operator_id"] == str(tour["operator"].id)


async def test_the_request_reaches_its_operators_queue(client: AsyncClient, tour):
    traveller_token = await token_for(client, "ada@coastline.example.com")
    request = await _submit(client, tour, traveller_token)

    owner_token = await token_for(client, "owner@coastline.example.com")
    resp = await client.get(
        "/operator/change-requests?limit=50", headers=auth(owner_token)
    )
    assert resp.status_code == 200, resp.text
    ids = [r["id"] for r in resp.json()["data"]["items"]]
    assert request["id"] in ids


async def test_a_rival_operator_never_sees_it(client: AsyncClient, tour):
    """The security boundary: scoping comes from membership, not a parameter."""
    traveller_token = await token_for(client, "ada@coastline.example.com")
    request = await _submit(client, tour, traveller_token)

    rival_token = await token_for(client, "owner@highland.example.com")
    listed = await client.get(
        "/operator/change-requests?limit=50", headers=auth(rival_token)
    )
    assert request["id"] not in [r["id"] for r in listed.json()["data"]["items"]]

    direct = await client.get(
        f"/operator/change-requests/{request['id']}", headers=auth(rival_token)
    )
    assert direct.status_code == 404


async def test_a_rival_operator_cannot_decide_it(client: AsyncClient, tour):
    traveller_token = await token_for(client, "ada@coastline.example.com")
    request = await _submit(client, tour, traveller_token)

    rival_token = await token_for(client, "owner@highland.example.com")
    resp = await client.post(
        f"/operator/change-requests/{request['id']}/decision",
        headers=auth(rival_token),
        json={"action": "approve"},
    )
    assert resp.status_code == 404


async def test_a_traveller_cannot_reach_the_queue(client: AsyncClient, tour):
    token = await token_for(client, "ada@coastline.example.com")
    assert (
        await client.get("/operator/change-requests", headers=auth(token))
    ).status_code == 403


# -- application -----------------------------------------------------------

async def test_approving_applies_the_change(
    client: AsyncClient, tour, db: AsyncSession
):
    traveller_token = await token_for(client, "ada@coastline.example.com")
    request = await _submit(client, tour, traveller_token)

    owner_token = await token_for(client, "owner@coastline.example.com")
    resp = await client.post(
        f"/operator/change-requests/{request['id']}/decision",
        headers=auth(owner_token),
        json={"action": "approve", "note": "Confirmed with the property."},
    )
    assert resp.status_code == 200, resp.text
    decided = resp.json()["data"]
    assert decided["status"] == "applied"
    assert decided["applied_at"] is not None
    assert len(decided["applied_result"]["created_item_ids"]) == 1


async def test_the_superseded_component_keeps_its_audit_trail(
    client: AsyncClient, tour
):
    traveller_token = await token_for(client, "ada@coastline.example.com")
    request = await _submit(client, tour, traveller_token)
    owner_token = await token_for(client, "owner@coastline.example.com")
    decided = (
        await client.post(
            f"/operator/change-requests/{request['id']}/decision",
            headers=auth(owner_token),
            json={"action": "approve"},
        )
    ).json()["data"]

    booking = (
        await client.get(
            f"/bookings/{tour['booking'].id}", headers=auth(traveller_token)
        )
    ).json()["data"]

    old = next(i for i in booking["items"] if i["id"] == str(tour["item"].id))
    new_id = decided["applied_result"]["created_item_ids"][0]
    assert old["status"] == "replaced"
    assert old["replaced_by_item_id"] == new_id


async def test_a_cheaper_replacement_refunds_the_difference(
    client: AsyncClient, tour
):
    """6000 back, 4500 spent on the budget room: 1500 net to the traveller."""
    traveller_token = await token_for(client, "ada@coastline.example.com")
    request = await _submit(client, tour, traveller_token)
    assert request["net_cost_delta"] == "-1500.00"

    owner_token = await token_for(client, "owner@coastline.example.com")
    await client.post(
        f"/operator/change-requests/{request['id']}/decision",
        headers=auth(owner_token),
        json={"action": "approve"},
    )

    booking = (
        await client.get(
            f"/bookings/{tour['booking'].id}", headers=auth(traveller_token)
        )
    ).json()["data"]
    assert booking["total"] == "4500.00"
    assert any(p["kind"] == "refund" for p in booking["payments"])


async def test_rejecting_changes_nothing(client: AsyncClient, tour, db: AsyncSession):
    traveller_token = await token_for(client, "ada@coastline.example.com")
    request = await _submit(client, tour, traveller_token)

    owner_token = await token_for(client, "owner@coastline.example.com")
    resp = await client.post(
        f"/operator/change-requests/{request['id']}/decision",
        headers=auth(owner_token),
        json={"action": "reject", "note": "The property is full."},
    )
    assert resp.json()["data"]["status"] == "rejected"

    await db.refresh(tour["item"])
    assert tour["item"].status is BookingItemStatus.CONFIRMED


async def test_a_decided_request_cannot_be_decided_again(client: AsyncClient, tour):
    traveller_token = await token_for(client, "ada@coastline.example.com")
    request = await _submit(client, tour, traveller_token)
    owner_token = await token_for(client, "owner@coastline.example.com")

    await client.post(
        f"/operator/change-requests/{request['id']}/decision",
        headers=auth(owner_token),
        json={"action": "reject"},
    )
    again = await client.post(
        f"/operator/change-requests/{request['id']}/decision",
        headers=auth(owner_token),
        json={"action": "approve"},
    )
    assert again.status_code == 409


async def test_a_traveller_can_withdraw_a_pending_request(client: AsyncClient, tour):
    token = await token_for(client, "ada@coastline.example.com")
    request = await _submit(client, tour, token)
    resp = await client.delete(
        f"/change-requests/{request['id']}", headers=auth(token)
    )
    assert resp.json()["data"]["status"] == "withdrawn"


async def test_someone_elses_request_is_not_readable(client: AsyncClient, tour):
    token = await token_for(client, "ada@coastline.example.com")
    request = await _submit(client, tour, token)

    other = await token_for(client, "bo@coastline.example.com")
    assert (
        await client.get(f"/change-requests/{request['id']}", headers=auth(other))
    ).status_code == 403


# -- disruptions -----------------------------------------------------------

async def test_a_disruption_costs_its_own_blast_radius(client: AsyncClient, tour):
    token = await token_for(client, "owner@coastline.example.com")
    resp = await client.post(
        "/operator/disruptions",
        headers=auth(token),
        json={
            "type": "weather",
            "severity": "high",
            "title": "Cyclone warning, Goa coast",
            "city": "Goa",
            "from_date": SOON.isoformat(),
            "to_date": (SOON + timedelta(days=3)).isoformat(),
        },
    )
    assert resp.status_code == 201, resp.text
    assessment = resp.json()["data"]["assessment"]
    assert assessment["items_at_risk"] == 1
    assert assessment["travellers_affected"] == 1
    assert assessment["exposure_total"] == "6000.00"
    assert assessment["items"][0]["recommended_action"] == "replace"
    assert assessment["items"][0]["alternatives"]


async def test_a_disruption_must_be_scoped(client: AsyncClient, tour):
    """Unscoped, it would catch the operator's entire book."""
    token = await token_for(client, "owner@coastline.example.com")
    resp = await client.post(
        "/operator/disruptions",
        headers=auth(token),
        json={"type": "weather", "severity": "low", "title": "Something vague"},
    )
    assert resp.status_code == 422


async def test_a_rival_operators_incident_is_invisible(client: AsyncClient, tour):
    owner_token = await token_for(client, "owner@coastline.example.com")
    created = (
        await client.post(
            "/operator/disruptions",
            headers=auth(owner_token),
            json={
                "type": "closure",
                "severity": "medium",
                "title": "Road closed",
                "city": "Goa",
            },
        )
    ).json()["data"]

    rival_token = await token_for(client, "owner@highland.example.com")
    assert (
        await client.get(
            f"/operator/disruptions/{created['id']}", headers=auth(rival_token)
        )
    ).status_code == 404
    listed = await client.get("/operator/disruptions", headers=auth(rival_token))
    assert listed.json()["data"]["items"] == []


async def test_a_rival_operators_bookings_are_never_in_the_blast_radius(
    client: AsyncClient, tour
):
    """The disruption scope must not leak across operators.

    Coastline's booking sits in Goa on these dates, so a Highland incident
    with an identical scope would catch it if the operator filter were wrong.
    """
    rival_token = await token_for(client, "owner@highland.example.com")
    resp = await client.post(
        "/operator/disruptions",
        headers=auth(rival_token),
        json={
            "type": "weather",
            "severity": "critical",
            "title": "Cyclone warning, Goa coast",
            "city": "Goa",
            "from_date": SOON.isoformat(),
            "to_date": (SOON + timedelta(days=3)).isoformat(),
        },
    )
    assert resp.json()["data"]["assessment"]["items_at_risk"] == 0


async def test_recovery_is_raised_on_the_travellers_behalf(client: AsyncClient, tour):
    token = await token_for(client, "owner@coastline.example.com")
    disruption = (
        await client.post(
            "/operator/disruptions",
            headers=auth(token),
            json={
                "type": "vendor_cancellation",
                "severity": "critical",
                "title": "Coastline Stays has closed",
                "city": "Goa",
                "from_date": SOON.isoformat(),
                "to_date": (SOON + timedelta(days=3)).isoformat(),
            },
        )
    ).json()["data"]

    item_id = disruption["assessment"]["items"][0]["item_id"]
    resp = await client.post(
        f"/operator/disruptions/{disruption['id']}/items/{item_id}/recover",
        headers=auth(token),
    )
    assert resp.status_code == 201, resp.text
    request = resp.json()["data"]
    assert request["requested_by_id"] == str(tour["traveller"].id)
    assert request["disruption_id"] == disruption["id"]
    assert request["status"] == "pending"


async def test_proposing_a_recovery_moves_the_incident_to_mitigating(
    client: AsyncClient, tour
):
    token = await token_for(client, "owner@coastline.example.com")
    disruption = (
        await client.post(
            "/operator/disruptions",
            headers=auth(token),
            json={
                "type": "vendor_cancellation",
                "severity": "high",
                "title": "Rooms unavailable",
                "city": "Goa",
                "from_date": SOON.isoformat(),
                "to_date": (SOON + timedelta(days=3)).isoformat(),
            },
        )
    ).json()["data"]

    item_id = disruption["assessment"]["items"][0]["item_id"]
    await client.post(
        f"/operator/disruptions/{disruption['id']}/items/{item_id}/recover",
        headers=auth(token),
    )
    after = await client.get(
        f"/operator/disruptions/{disruption['id']}", headers=auth(token)
    )
    assert after.json()["data"]["status"] == "mitigating"


# -- conflicts over the API ------------------------------------------------

async def test_a_healthy_trip_reports_no_blockers(client: AsyncClient, tour):
    token = await token_for(client, "ada@coastline.example.com")
    resp = await client.get(
        f"/trips/{tour['trip'].id}/conflicts", headers=auth(token)
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["blockers"] == 0


async def test_conflicts_are_not_readable_by_a_stranger(client: AsyncClient, tour):
    token = await token_for(client, "bo@coastline.example.com")
    assert (
        await client.get(f"/trips/{tour['trip'].id}/conflicts", headers=auth(token))
    ).status_code == 403
