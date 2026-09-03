"""Booking, payment and cancellation.

The refund arithmetic is the part that matters most: it is the same
calculation the adaptation engine uses to price a change, so it is pinned
here against each kind of cancellation policy.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Operator, ServiceAvailability, Vendor, VendorService
from app.models.enums import ComfortTier, ServiceType
from app.services.booking_service import refund_due
from app.services.payment_gateway import SimulatedGateway

TODAY = date.today()
FAR = TODAY + timedelta(days=40)
SOON = TODAY + timedelta(days=2)


@pytest_asyncio.fixture
async def supply(db: AsyncSession) -> dict:
    """One flexible stay, one non-refundable activity, one capped tour."""
    operator = Operator(name="Test Ops", slug="test-ops")
    db.add(operator)
    await db.flush()

    vendor = Vendor(
        operator_id=operator.id,
        name="Goa Supply",
        category=ServiceType.ACCOMMODATION,
        city="Goa",
        country="India",
        reliability_score=90,
    )
    db.add(vendor)
    await db.flush()

    flexible = VendorService(
        vendor_id=vendor.id,
        service_type=ServiceType.ACCOMMODATION,
        name="Flexible Suite",
        comfort_tier=ComfortTier.LUXURY,
        unit_price=Decimal("10000.00"),
        unit_label="night",
        city="Goa",
        free_cancellation_days=14,
        cancellation_penalty_pct=0,
    )
    strict = VendorService(
        vendor_id=vendor.id,
        service_type=ServiceType.ACTIVITY,
        name="Non-refundable Tour",
        comfort_tier=ComfortTier.BUDGET,
        unit_price=Decimal("500.00"),
        unit_label="person",
        city="Goa",
        free_cancellation_days=0,
        cancellation_penalty_pct=100,
    )
    partial = VendorService(
        vendor_id=vendor.id,
        service_type=ServiceType.GUIDE,
        name="Half-penalty Guide",
        comfort_tier=ComfortTier.STANDARD,
        unit_price=Decimal("2000.00"),
        unit_label="day",
        city="Goa",
        free_cancellation_days=7,
        cancellation_penalty_pct=50,
    )
    capped = VendorService(
        vendor_id=vendor.id,
        service_type=ServiceType.MEAL,
        name="Chef's Table",
        comfort_tier=ComfortTier.PREMIUM,
        unit_price=Decimal("1500.00"),
        unit_label="person",
        city="Goa",
    )
    db.add_all([flexible, strict, partial, capped])
    await db.flush()

    db.add(
        ServiceAvailability(
            service_id=capped.id, on_date=FAR, capacity_total=2, capacity_booked=0
        )
    )
    await db.commit()
    return {
        "flexible": flexible,
        "strict": strict,
        "partial": partial,
        "capped": capped,
    }


async def make_trip(client: AsyncClient) -> str:
    resp = await client.post(
        "/trips",
        json={
            "title": "Booking Test Trip",
            "start_date": FAR.isoformat(),
            "end_date": (FAR + timedelta(days=4)).isoformat(),
            "budget": "100000.00",
            "traveller_count": 2,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


def line(service, on: date = FAR, quantity=1, units=1, **extra) -> dict:
    return {
        "service_id": str(service.id),
        "component_type": service.service_type.value,
        "service_date": on.isoformat(),
        "quantity": quantity,
        "units": units,
        **extra,
    }


# --------------------------------------------------------------------------
# Refund arithmetic (pure)
# --------------------------------------------------------------------------

class _Item:
    """Minimal stand-in; refund_due only reads these fields."""

    def __init__(self, total, free_days, penalty, service_date, status=None):
        from app.models.enums import BookingItemStatus

        self.total_price = Decimal(total)
        self.free_cancellation_days = free_days
        self.cancellation_penalty_pct = penalty
        self.service_date = service_date
        self.status = status or BookingItemStatus.CONFIRMED


def test_free_cancellation_returns_everything():
    refund, penalty, why = refund_due(_Item("10000.00", 14, 0, FAR), on=TODAY)
    assert refund == Decimal("10000.00")
    assert penalty == Decimal("0")
    assert "Free cancellation" in why


def test_non_refundable_returns_nothing():
    refund, penalty, why = refund_due(_Item("500.00", 0, 100, FAR), on=TODAY)
    assert refund == Decimal("0")
    assert penalty == Decimal("500.00")
    assert "Non-refundable" in why


def test_partial_penalty_splits_the_amount():
    """Inside the free window, so the 50% penalty bites."""
    refund, penalty, _ = refund_due(_Item("2000.00", 7, 50, SOON), on=TODAY)
    assert refund == Decimal("1000.00")
    assert penalty == Decimal("1000.00")


def test_the_free_window_is_measured_from_the_service_date():
    flexible = _Item("10000.00", 14, 25, SOON)
    refund, penalty, _ = refund_due(flexible, on=TODAY)
    # Two days out, well inside a 14-day window, so the penalty applies.
    assert refund == Decimal("7500.00")
    assert penalty == Decimal("2500.00")


def test_an_already_cancelled_item_refunds_nothing():
    from app.models.enums import BookingItemStatus

    item = _Item("5000.00", 30, 0, FAR, status=BookingItemStatus.CANCELLED)
    refund, penalty, why = refund_due(item, on=TODAY)
    assert refund == Decimal("0")
    assert "Already cancelled" in why


def test_refund_and_penalty_always_sum_to_the_total():
    for total, free_days, penalty_pct in [
        ("10000.00", 0, 30), ("999.99", 0, 33), ("1.00", 0, 50), ("7500.50", 0, 10),
    ]:
        refund, penalty, _ = refund_due(
            _Item(total, free_days, penalty_pct, SOON), on=TODAY
        )
        assert refund + penalty == Decimal(total)


# --------------------------------------------------------------------------
# Gateway
# --------------------------------------------------------------------------

def test_gateway_rejects_an_unsupported_method():
    result = SimulatedGateway().authorize(Decimal("100"), "cheque")
    assert not result.approved
    assert "Unsupported" in (result.failure_reason or "")


def test_gateway_rejects_a_non_positive_amount():
    assert not SimulatedGateway().authorize(Decimal("0"), "card").approved


def test_gateway_can_be_made_to_decline():
    """The unhappy path has to be reachable, or the code handling it rots."""
    gateway = SimulatedGateway(failure_rate=1.0, seed=1)
    result = gateway.authorize(Decimal("100"), "card")
    assert not result.approved
    assert result.failure_reason == "Declined by issuing bank"


def test_gateway_approves_by_default():
    """A live demo must never fail by luck."""
    gateway = SimulatedGateway()
    assert all(
        gateway.authorize(Decimal("100"), "card").approved for _ in range(25)
    )


# --------------------------------------------------------------------------
# Quoting
# --------------------------------------------------------------------------

async def test_quote_prices_without_committing(auth_client: AsyncClient, supply):
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/quote",
        json={"items": [line(supply["flexible"], quantity=1, units=3)]},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert Decimal(data["total"]) == Decimal("30000.00")

    # Nothing was created.
    listed = await auth_client.get("/bookings")
    assert listed.json()["data"]["items"] == []


async def test_quantity_and_units_multiply(auth_client: AsyncClient, supply):
    """Two people for three nights is six units, not three."""
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/quote",
        json={"items": [line(supply["flexible"], quantity=2, units=3)]},
    )
    assert Decimal(resp.json()["data"]["total"]) == Decimal("60000.00")


async def test_quoting_beyond_capacity_is_refused(auth_client: AsyncClient, supply):
    """Refusing beats quoting a price for something unavailable."""
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/quote",
        json={"items": [line(supply["capped"], quantity=5)]},
    )
    assert resp.status_code == 409
    assert "only 2 left" in resp.json()["message"].lower()


async def test_a_custom_line_needs_a_price(auth_client: AsyncClient, supply):
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/quote",
        json={
            "items": [
                {
                    "component_type": "other",
                    "service_date": FAR.isoformat(),
                    "title": "Bespoke arrangement",
                }
            ]
        },
    )
    assert resp.status_code == 422


async def test_a_custom_line_with_a_price_is_accepted(
    auth_client: AsyncClient, supply
):
    """Operators arrange things off-catalogue; refusing those is unusable."""
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/quote",
        json={
            "items": [
                {
                    "component_type": "other",
                    "service_date": FAR.isoformat(),
                    "title": "Bespoke arrangement",
                    "unit_price": "2500.00",
                }
            ]
        },
    )
    assert resp.status_code == 200, resp.text
    assert Decimal(resp.json()["data"]["total"]) == Decimal("2500.00")


# --------------------------------------------------------------------------
# Booking and payment
# --------------------------------------------------------------------------

async def test_a_new_booking_is_a_draft(auth_client: AsyncClient, supply):
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["flexible"], units=3)]},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["status"] == "draft"
    assert data["reference"].startswith("TZ")
    assert Decimal(data["amount_paid"]) == Decimal("0")
    assert Decimal(data["amount_outstanding"]) == Decimal("30000.00")


async def test_paying_in_full_confirms_the_booking(
    auth_client: AsyncClient, supply
):
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["strict"], quantity=2)]},
    )
    booking_id = created.json()["data"]["id"]

    resp = await auth_client.post(
        f"/bookings/{booking_id}/payments", json={"method": "card"}
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["status"] == "confirmed"
    assert Decimal(data["amount_outstanding"]) == Decimal("0")
    assert all(i["status"] == "confirmed" for i in data["items"])
    assert data["confirmed_at"] is not None


async def test_a_deposit_leaves_the_booking_pending(
    auth_client: AsyncClient, supply
):
    """Part-payment is how an operator holds a tour."""
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["flexible"], units=3)]},
    )
    booking_id = created.json()["data"]["id"]

    first = await auth_client.post(
        f"/bookings/{booking_id}/payments", json={"amount": "5000.00", "method": "upi"}
    )
    assert first.status_code == 200, first.text
    data = first.json()["data"]
    # Regression guard: this reported 0.00 until _load stopped returning the
    # session's stale, identity-mapped copy of the payments collection.
    assert Decimal(data["amount_paid"]) == Decimal("5000.00")
    assert Decimal(data["amount_outstanding"]) == Decimal("25000.00")
    assert data["status"] == "pending_payment"

    second = await auth_client.post(
        f"/bookings/{booking_id}/payments", json={"method": "card"}
    )
    data = second.json()["data"]
    assert data["status"] == "confirmed"
    assert Decimal(data["amount_paid"]) == Decimal("30000.00")
    assert [p["kind"] for p in data["payments"]] == ["deposit", "full"]


async def test_overpaying_is_rejected(auth_client: AsyncClient, supply):
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["strict"], quantity=1)]},
    )
    booking_id = created.json()["data"]["id"]
    resp = await auth_client.post(
        f"/bookings/{booking_id}/payments", json={"amount": "999999.00"}
    )
    assert resp.status_code == 422


async def test_paying_a_settled_booking_is_refused(
    auth_client: AsyncClient, supply
):
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["strict"])]},
    )
    booking_id = created.json()["data"]["id"]
    await auth_client.post(f"/bookings/{booking_id}/payments", json={})
    again = await auth_client.post(f"/bookings/{booking_id}/payments", json={})
    assert again.status_code == 409
    assert "already paid" in again.json()["message"].lower()


async def test_confirming_consumes_published_capacity(
    auth_client: AsyncClient, supply
):
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["capped"], quantity=2)]},
    )
    await auth_client.post(
        f"/bookings/{created.json()['data']['id']}/payments", json={}
    )

    # The two seats are gone, so the same service is no longer offered.
    resp = await auth_client.get(
        f"/components/alternatives?service_type=meal&city=Goa&on_date={FAR}&quantity=1"
    )
    names = {i["name"] for i in resp.json()["data"]["items"]}
    assert "Chef's Table" not in names


# --------------------------------------------------------------------------
# Cancellation
# --------------------------------------------------------------------------

async def test_cancelling_a_flexible_item_refunds_in_full(
    auth_client: AsyncClient, supply
):
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["flexible"], units=3)]},
    )
    booking_id = created.json()["data"]["id"]
    paid = await auth_client.post(f"/bookings/{booking_id}/payments", json={})
    item_id = paid.json()["data"]["items"][0]["id"]

    resp = await auth_client.delete(f"/bookings/{booking_id}/items/{item_id}")
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert Decimal(data["cancellation"]["refunded"]) == Decimal("30000.00")
    assert Decimal(data["cancellation"]["penalty"]) == Decimal("0")
    # Net of the refund, the operator is holding nothing.
    assert Decimal(data["amount_paid"]) == Decimal("0")


async def test_cancelling_a_non_refundable_item_refunds_nothing(
    auth_client: AsyncClient, supply
):
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["strict"], quantity=2)]},
    )
    booking_id = created.json()["data"]["id"]
    paid = await auth_client.post(f"/bookings/{booking_id}/payments", json={})
    item_id = paid.json()["data"]["items"][0]["id"]

    resp = await auth_client.delete(f"/bookings/{booking_id}/items/{item_id}")
    data = resp.json()["data"]
    assert Decimal(data["cancellation"]["refunded"]) == Decimal("0")
    assert Decimal(data["cancellation"]["penalty"]) == Decimal("1000.00")
    assert Decimal(data["amount_paid"]) == Decimal("1000.00")


async def test_cancelling_one_component_leaves_the_rest_standing(
    auth_client: AsyncClient, supply
):
    """The case the whole booking-item design exists for."""
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={
            "items": [
                line(supply["flexible"], units=3),
                line(supply["strict"], quantity=2),
            ]
        },
    )
    booking_id = created.json()["data"]["id"]
    paid = await auth_client.post(f"/bookings/{booking_id}/payments", json={})
    stay = next(
        i for i in paid.json()["data"]["items"] if i["component_type"] == "accommodation"
    )

    resp = await auth_client.delete(f"/bookings/{booking_id}/items/{stay['id']}")
    data = resp.json()["data"]
    statuses = {i["component_type"]: i["status"] for i in data["items"]}
    assert statuses["accommodation"] == "cancelled"
    assert statuses["activity"] == "confirmed"
    assert data["status"] != "cancelled"
    # The total now reflects only what is still live.
    assert Decimal(data["total"]) == Decimal("1000.00")


async def test_cancelling_every_component_cancels_the_booking(
    auth_client: AsyncClient, supply
):
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["flexible"], units=3)]},
    )
    booking_id = created.json()["data"]["id"]
    paid = await auth_client.post(f"/bookings/{booking_id}/payments", json={})
    item_id = paid.json()["data"]["items"][0]["id"]

    await auth_client.delete(f"/bookings/{booking_id}/items/{item_id}")
    resp = await auth_client.get(f"/bookings/{booking_id}")
    assert resp.json()["data"]["status"] == "cancelled"


async def test_cancelling_a_whole_booking_refunds_each_item_on_its_own_terms(
    auth_client: AsyncClient, supply
):
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={
            "items": [
                line(supply["flexible"], units=1),   # 10000, fully refundable
                line(supply["strict"], quantity=1),  # 500, non-refundable
            ]
        },
    )
    booking_id = created.json()["data"]["id"]
    await auth_client.post(f"/bookings/{booking_id}/payments", json={})

    resp = await auth_client.delete(f"/bookings/{booking_id}")
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["status"] == "cancelled"
    assert Decimal(data["cancellation"]["refunded"]) == Decimal("10000.00")
    assert Decimal(data["cancellation"]["penalty"]) == Decimal("500.00")
    assert Decimal(data["amount_paid"]) == Decimal("500.00")


async def test_cancelling_releases_capacity(auth_client: AsyncClient, supply):
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["capped"], quantity=2)]},
    )
    booking_id = created.json()["data"]["id"]
    paid = await auth_client.post(f"/bookings/{booking_id}/payments", json={})
    item_id = paid.json()["data"]["items"][0]["id"]

    await auth_client.delete(f"/bookings/{booking_id}/items/{item_id}")

    resp = await auth_client.get(
        f"/components/alternatives?service_type=meal&city=Goa&on_date={FAR}&quantity=2"
    )
    assert "Chef's Table" in {i["name"] for i in resp.json()["data"]["items"]}


async def test_cancelling_twice_is_refused(auth_client: AsyncClient, supply):
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["flexible"])]},
    )
    booking_id = created.json()["data"]["id"]
    await auth_client.delete(f"/bookings/{booking_id}")
    assert (await auth_client.delete(f"/bookings/{booking_id}")).status_code == 409


# --------------------------------------------------------------------------
# Ownership
# --------------------------------------------------------------------------

async def test_bookings_require_authentication(client: AsyncClient):
    assert (await client.get("/bookings")).status_code == 401


async def test_another_user_cannot_see_your_booking(
    auth_client: AsyncClient, client: AsyncClient, registration, supply
):
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["flexible"])]},
    )
    booking_id = created.json()["data"]["id"]

    other = await client.post(
        "/auth/register",
        json={**registration, "email": "intruder@example.com", "first_name": "Nosy"},
    )
    token = other.json()["data"]["access_token"]
    resp = await client.get(
        f"/bookings/{booking_id}", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 403


async def test_you_cannot_book_someone_elses_trip(
    auth_client: AsyncClient, client: AsyncClient, registration, supply
):
    trip_id = await make_trip(auth_client)
    other = await client.post(
        "/auth/register",
        json={**registration, "email": "intruder2@example.com", "first_name": "Nosy"},
    )
    token = other.json()["data"]["access_token"]
    resp = await client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["flexible"])]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


async def test_money_is_a_string_throughout(auth_client: AsyncClient, supply):
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["flexible"])]},
    )
    data = created.json()["data"]
    for field in ("subtotal", "total", "amount_paid", "amount_outstanding"):
        assert isinstance(data[field], str), field
    assert isinstance(data["items"][0]["unit_price"], str)
