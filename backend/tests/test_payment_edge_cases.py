"""The edge cases where money and the itinerary disagree.

Every test here pins a failure that was reachable through the normal UI: a
paid-for trip that could be deleted out from under its own bookings, a
cancellation that handed back a deposit the penalty should have eaten, a
double click that charged twice. They are grouped by what breaks, not by
which module the fix landed in, because most of them span both.
"""

import asyncio
from datetime import date, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ServiceAvailability
from app.services.booking_service import (
    record_penalty,
    refundable_cash,
    retained_penalty,
)
from app.services.payment_gateway import GatewayResult

from tests.test_bookings import FAR, line, make_trip, supply  # noqa: F401

TODAY = date.today()


# --------------------------------------------------------------------------
# Refund arithmetic (pure)
# --------------------------------------------------------------------------

def test_a_penalty_is_taken_out_of_the_deposit_not_the_list_price():
    """The regression this whole file exists for.

    A 50,000 tour on a 30% penalty, paid with a 10,000 deposit. The gross
    refund is 35,000, which is more than the deposit, so the old
    ``min(refund, paid)`` cap never bit and the traveller got the entire
    deposit back -- the 15,000 penalty was silently waived.
    """
    assert refundable_cash(
        paid=Decimal("10000"), refund=Decimal("35000"), penalty=Decimal("15000")
    ) == Decimal("0.00")


def test_a_full_payment_still_refunds_the_full_entitlement():
    assert refundable_cash(
        paid=Decimal("50000"), refund=Decimal("35000"), penalty=Decimal("15000")
    ) == Decimal("35000.00")


def test_free_cancellation_returns_the_deposit_whole():
    assert refundable_cash(
        paid=Decimal("10000"), refund=Decimal("50000"), penalty=Decimal("0")
    ) == Decimal("10000.00")


def test_nothing_paid_refunds_nothing():
    assert refundable_cash(
        paid=Decimal("0"), refund=Decimal("35000"), penalty=Decimal("15000")
    ) == Decimal("0.00")


def test_a_refund_is_never_negative():
    assert refundable_cash(
        paid=Decimal("100"), refund=Decimal("0"), penalty=Decimal("5000")
    ) == Decimal("0.00")


class _MetaItem:
    """Minimal stand-in: the penalty helpers only touch ``meta``."""

    def __init__(self):
        self.meta = None


def test_a_recorded_penalty_reads_back():
    item = _MetaItem()
    record_penalty(item, Decimal("5000"))
    assert retained_penalty(item) == Decimal("5000.00")


def test_recording_a_penalty_replaces_the_dict_rather_than_mutating_it():
    """An in-place JSONB edit is invisible to SQLAlchemy and never persists."""
    item = _MetaItem()
    item.meta = {"source": "adaptation"}
    before = item.meta
    record_penalty(item, Decimal("250"))
    assert item.meta is not before
    assert item.meta["source"] == "adaptation"


def test_an_item_with_no_penalty_recorded_reads_as_zero():
    assert retained_penalty(_MetaItem()) == Decimal("0")


# --------------------------------------------------------------------------
# Zero-amount tampering
# --------------------------------------------------------------------------

def test_a_zero_payment_amount_is_rejected_by_the_schema():
    """``Decimal("0")`` is falsy, so ``amount or outstanding`` charged the lot."""
    from pydantic import ValidationError

    from app.schemas.booking import PaymentRequest

    with pytest.raises(ValidationError):
        PaymentRequest(amount=Decimal("0"))


def test_omitting_the_amount_still_means_pay_it_all():
    from app.schemas.booking import PaymentRequest

    assert PaymentRequest().amount is None


# --------------------------------------------------------------------------
# Deleting a trip that has been paid for
# --------------------------------------------------------------------------

async def _paid_booking(client: AsyncClient, supply, **line_kwargs) -> tuple[str, dict]:
    """A trip with one confirmed, fully paid booking on it."""
    trip_id = await make_trip(client)
    created = await client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["flexible"], units=1, **line_kwargs)]},
    )
    assert created.status_code == 201, created.text
    booking_id = created.json()["data"]["id"]
    paid = await client.post(f"/bookings/{booking_id}/payments", json={})
    assert paid.status_code == 200, paid.text
    assert paid.json()["data"]["status"] == "confirmed"
    return trip_id, paid.json()["data"]


async def test_a_trip_with_a_confirmed_booking_cannot_be_deleted(
    auth_client: AsyncClient, supply
):
    trip_id, booking = await _paid_booking(auth_client, supply)

    resp = await auth_client.delete(f"/trips/{trip_id}")
    assert resp.status_code == 409, resp.text
    assert booking["reference"] in resp.json()["message"]

    # And the trip is still there to be managed.
    assert (await auth_client.get(f"/trips/{trip_id}")).status_code == 200


async def test_a_trip_is_deletable_again_once_its_booking_is_cancelled(
    auth_client: AsyncClient, supply
):
    trip_id, booking = await _paid_booking(auth_client, supply)

    assert (await auth_client.delete(f"/bookings/{booking['id']}")).status_code == 200
    assert (await auth_client.delete(f"/trips/{trip_id}")).status_code == 200


async def test_a_trip_with_only_a_draft_booking_is_still_deletable(
    auth_client: AsyncClient, supply
):
    """A quote nobody committed to holds nothing and blocks nothing."""
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings", json={"items": [line(supply["flexible"])]}
    )
    assert created.json()["data"]["status"] == "draft"
    assert (await auth_client.delete(f"/trips/{trip_id}")).status_code == 200


# --------------------------------------------------------------------------
# Moving the dates out from under the reservations
# --------------------------------------------------------------------------

async def test_trip_dates_cannot_move_once_components_are_booked(
    auth_client: AsyncClient, supply
):
    """The itinerary would move; the hotel reservation would not."""
    trip_id, _ = await _paid_booking(auth_client, supply)
    shifted = FAR + timedelta(days=30)

    resp = await auth_client.put(
        f"/trips/{trip_id}",
        json={
            "start_date": shifted.isoformat(),
            "end_date": (shifted + timedelta(days=4)).isoformat(),
        },
    )
    assert resp.status_code == 409, resp.text
    assert "booked" in resp.json()["message"].lower()


async def test_cascade_does_not_get_you_past_the_booking_guard(
    auth_client: AsyncClient, supply
):
    trip_id, _ = await _paid_booking(auth_client, supply)
    shifted = FAR + timedelta(days=30)

    resp = await auth_client.put(
        f"/trips/{trip_id}?cascade=true",
        json={"end_date": (shifted + timedelta(days=4)).isoformat()},
    )
    assert resp.status_code == 409, resp.text


async def test_editing_a_booked_trip_without_touching_the_dates_is_fine(
    auth_client: AsyncClient, supply
):
    """The guard is about dates, not about the trip being frozen."""
    trip_id, _ = await _paid_booking(auth_client, supply)

    resp = await auth_client.put(f"/trips/{trip_id}", json={"title": "Renamed"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["title"] == "Renamed"


# --------------------------------------------------------------------------
# Deleting the itinerary out from under a booking
# --------------------------------------------------------------------------

async def _make_stop(client: AsyncClient, trip_id: str) -> str:
    resp = await client.post(
        f"/trips/{trip_id}/stops",
        json={
            "city_name": "Goa",
            "country": "India",
            "arrival_date": FAR.isoformat(),
            "departure_date": (FAR + timedelta(days=2)).isoformat(),
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


async def _make_activity(client: AsyncClient, stop_id: str, title: str) -> str:
    resp = await client.post(
        f"/stops/{stop_id}/activities",
        json={"title": title, "activity_date": FAR.isoformat()},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


async def _booked_stop(client: AsyncClient, supply) -> tuple[str, str, str]:
    """Returns ``(trip_id, stop_id, activity_id)`` with the stop booked."""
    trip_id = await make_trip(client)
    stop_id = await _make_stop(client, trip_id)
    activity_id = await _make_activity(client, stop_id, "Scuba dive")

    created = await client.post(
        f"/trips/{trip_id}/bookings",
        json={
            "items": [
                line(
                    supply["flexible"],
                    stop_id=stop_id,
                    itinerary_activity_id=activity_id,
                )
            ]
        },
    )
    assert created.status_code == 201, created.text
    booking_id = created.json()["data"]["id"]
    assert (
        await client.post(f"/bookings/{booking_id}/payments", json={})
    ).status_code == 200
    return trip_id, stop_id, activity_id


async def test_a_booked_stop_cannot_be_deleted(auth_client: AsyncClient, supply):
    _, stop_id, _ = await _booked_stop(auth_client, supply)

    resp = await auth_client.delete(f"/stops/{stop_id}")
    assert resp.status_code == 409, resp.text
    assert (await auth_client.get(f"/stops/{stop_id}")).status_code == 200


async def test_a_booked_activity_cannot_be_deleted(auth_client: AsyncClient, supply):
    _, _, activity_id = await _booked_stop(auth_client, supply)

    resp = await auth_client.delete(f"/itinerary-activities/{activity_id}")
    assert resp.status_code == 409, resp.text


async def test_deleting_a_stop_is_refused_for_a_booked_activity_beneath_it(
    auth_client: AsyncClient, supply
):
    """The stop itself is unbooked; the activity under it is not.

    Deleting the stop cascades to the activity, so the booking item would be
    orphaned just the same.
    """
    trip_id = await make_trip(auth_client)
    stop_id = await _make_stop(auth_client, trip_id)
    activity_id = await _make_activity(auth_client, stop_id, "Museum tour")

    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["flexible"], itinerary_activity_id=activity_id)]},
    )
    booking_id = created.json()["data"]["id"]
    await auth_client.post(f"/bookings/{booking_id}/payments", json={})

    assert (await auth_client.delete(f"/stops/{stop_id}")).status_code == 409


async def test_the_stop_frees_up_once_the_component_is_cancelled(
    auth_client: AsyncClient, supply
):
    _, stop_id, _ = await _booked_stop(auth_client, supply)

    listing = await auth_client.get("/bookings")
    booking = listing.json()["data"]["items"][0]
    resp = await auth_client.delete(
        f"/bookings/{booking['id']}/items/{booking['items'][0]['id']}"
    )
    assert resp.status_code == 200, resp.text

    assert (await auth_client.delete(f"/stops/{stop_id}")).status_code == 200


async def test_an_unbooked_stop_deletes_as_before(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    stop_id = await _make_stop(auth_client, trip_id)
    assert (await auth_client.delete(f"/stops/{stop_id}")).status_code == 200


# --------------------------------------------------------------------------
# Concurrency
# --------------------------------------------------------------------------

async def test_two_simultaneous_payments_charge_once(
    auth_client: AsyncClient, supply
):
    """The double click, and the two group members on two devices.

    Both requests read the same outstanding balance; without the row lock both
    authorise and both capture, leaving ``amount_paid`` at twice the total.
    """
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["flexible"], units=1)]},
    )
    booking_id = created.json()["data"]["id"]
    total = Decimal(created.json()["data"]["total"])

    first, second = await asyncio.gather(
        auth_client.post(f"/bookings/{booking_id}/payments", json={}),
        auth_client.post(f"/bookings/{booking_id}/payments", json={}),
        return_exceptions=True,
    )
    codes = sorted(
        r.status_code for r in (first, second) if not isinstance(r, Exception)
    )
    assert codes == [200, 409], codes

    settled = (await auth_client.get(f"/bookings/{booking_id}")).json()["data"]
    assert Decimal(settled["amount_paid"]) == total
    captured = [
        p
        for p in settled["payments"]
        if p["status"] == "captured" and p["kind"] != "refund"
    ]
    assert len(captured) == 1, settled["payments"]


# --------------------------------------------------------------------------
# Capacity at payment time
# --------------------------------------------------------------------------

async def _availability(db: AsyncSession, service_id) -> ServiceAvailability:
    return (
        await db.execute(
            select(ServiceAvailability).where(
                ServiceAvailability.service_id == service_id,
                ServiceAvailability.on_date == FAR,
            )
        )
    ).scalar_one()


async def test_capacity_lost_between_drafting_and_paying_refuses_the_charge(
    auth_client: AsyncClient, supply, db: AsyncSession
):
    """The vendor sold out while the draft sat in a tab."""
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["capped"], quantity=2)]},
    )
    assert created.status_code == 201, created.text
    booking_id = created.json()["data"]["id"]

    avail = await _availability(db, supply["capped"].id)
    avail.capacity_booked = avail.capacity_total
    await db.commit()

    resp = await auth_client.post(f"/bookings/{booking_id}/payments", json={})
    assert resp.status_code == 409, resp.text
    assert "charged" in resp.json()["message"]

    # Crucially: no money moved.
    settled = (await auth_client.get(f"/bookings/{booking_id}")).json()["data"]
    assert Decimal(settled["amount_paid"]) == Decimal("0")
    assert settled["payments"] == []


async def test_a_blocked_date_refuses_the_charge(
    auth_client: AsyncClient, supply, db: AsyncSession
):
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["capped"], quantity=1)]},
    )
    booking_id = created.json()["data"]["id"]

    avail = await _availability(db, supply["capped"].id)
    avail.is_blocked = True
    await db.commit()

    resp = await auth_client.post(f"/bookings/{booking_id}/payments", json={})
    assert resp.status_code == 409, resp.text


# --------------------------------------------------------------------------
# Retained penalties in the ledger
# --------------------------------------------------------------------------

async def test_a_retained_penalty_stays_on_the_booking_total(
    auth_client: AsyncClient, supply
):
    """``amount_paid`` used to exceed ``total`` after a penalised cancellation.

    The refund dropped ``amount_paid`` by the refundable half, while
    ``_recalculate`` dropped ``total`` by the whole item -- so the booking
    reported an overpayment that had never happened, and the operator's ledger
    had nowhere to put the fee it had just earned.
    """
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["partial"], on=TODAY + timedelta(days=3))]},
    )
    booking_id = created.json()["data"]["id"]
    paid = await auth_client.post(f"/bookings/{booking_id}/payments", json={})
    item_id = paid.json()["data"]["items"][0]["id"]

    resp = await auth_client.delete(f"/bookings/{booking_id}/items/{item_id}")
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]

    # 2000 at a 50% penalty, inside the free window: 1000 back, 1000 kept.
    assert Decimal(data["cancellation"]["refunded"]) == Decimal("1000.00")
    assert Decimal(data["amount_paid"]) == Decimal("1000.00")
    assert Decimal(data["cancellation_fees"]) == Decimal("1000.00")
    assert Decimal(data["total"]) == Decimal("1000.00")
    assert Decimal(data["amount_outstanding"]) == Decimal("0")


async def test_a_deposit_does_not_buy_its_way_out_of_a_penalty(
    auth_client: AsyncClient, supply
):
    """End to end, the case the pure test above pins."""
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["partial"], on=TODAY + timedelta(days=3))]},
    )
    booking_id = created.json()["data"]["id"]
    # 2000 total, 50% penalty. Put down 400 -- far less than the 1000 penalty.
    deposit = await auth_client.post(
        f"/bookings/{booking_id}/payments", json={"amount": "400.00"}
    )
    assert deposit.status_code == 200, deposit.text
    assert deposit.json()["data"]["status"] == "pending_payment"

    resp = await auth_client.delete(f"/bookings/{booking_id}")
    data = resp.json()["data"]

    assert Decimal(data["cancellation"]["refunded"]) == Decimal("0")
    assert Decimal(data["cancellation"]["penalty"]) == Decimal("1000.00")
    # The deposit stays with the operator, against a 1000 fee still short by 600.
    assert Decimal(data["amount_paid"]) == Decimal("400.00")
    assert Decimal(data["total"]) == Decimal("1000.00")


async def test_cancelling_a_whole_booking_releases_its_capacity(
    auth_client: AsyncClient, supply, db: AsyncSession
):
    """``cancel`` released nothing at all, so a cancelled tour held its seats."""
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["capped"], quantity=2)]},
    )
    booking_id = created.json()["data"]["id"]
    await auth_client.post(f"/bookings/{booking_id}/payments", json={})
    assert (await auth_client.delete(f"/bookings/{booking_id}")).status_code == 200

    avail = await _availability(db, supply["capped"].id)
    await db.refresh(avail)
    assert avail.capacity_booked == 0


# --------------------------------------------------------------------------
# A refund the gateway will not make
# --------------------------------------------------------------------------

@pytest.fixture
def declining_refunds(monkeypatch):
    """Make only refunds fail; payments still go through."""

    def _refuse(self, capture_reference, amount):
        return GatewayResult(
            approved=False,
            reference="rfnd_declined",
            failure_reason="Merchant account has insufficient funds",
        )

    monkeypatch.setattr(
        "app.services.payment_gateway.SimulatedGateway.refund", _refuse
    )


async def test_a_declined_refund_does_not_cancel_the_booking(
    auth_client: AsyncClient, supply, declining_refunds
):
    """The traveller must not lose the tour *and* the money.

    Cancelling used to mark the booking cancelled, release the seats and
    return 200 with the refund row sitting at ``failed``.
    """
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["flexible"], units=1)]},
    )
    booking_id = created.json()["data"]["id"]
    await auth_client.post(f"/bookings/{booking_id}/payments", json={})

    resp = await auth_client.delete(f"/bookings/{booking_id}")
    assert resp.status_code == 409, resp.text

    settled = (await auth_client.get(f"/bookings/{booking_id}")).json()["data"]
    assert settled["status"] == "confirmed"
    assert settled["items"][0]["status"] == "confirmed"
    # Still theirs, still paid for.
    assert Decimal(settled["amount_paid"]) == Decimal("10000.00")
    # And the failed attempt is on the ledger for support to chase.
    assert any(
        p["status"] == "failed" and p["kind"] == "refund" for p in settled["payments"]
    )


async def test_a_declined_refund_does_not_cancel_a_single_component(
    auth_client: AsyncClient, supply, declining_refunds
):
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={
            "items": [
                line(supply["flexible"], units=1),
                line(supply["strict"], quantity=1),
            ]
        },
    )
    booking_id = created.json()["data"]["id"]
    paid = await auth_client.post(f"/bookings/{booking_id}/payments", json={})
    stay = next(
        i
        for i in paid.json()["data"]["items"]
        if i["component_type"] == "accommodation"
    )

    resp = await auth_client.delete(f"/bookings/{booking_id}/items/{stay['id']}")
    assert resp.status_code == 409, resp.text

    settled = (await auth_client.get(f"/bookings/{booking_id}")).json()["data"]
    assert all(i["status"] == "confirmed" for i in settled["items"])


async def test_a_cancellation_owing_no_refund_is_unaffected_by_the_gateway(
    auth_client: AsyncClient, supply, declining_refunds
):
    """Nothing to refund means nothing to decline."""
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["strict"], quantity=1)]},
    )
    booking_id = created.json()["data"]["id"]
    await auth_client.post(f"/bookings/{booking_id}/payments", json={})

    resp = await auth_client.delete(f"/bookings/{booking_id}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["status"] == "cancelled"


# --------------------------------------------------------------------------
# Budget
# --------------------------------------------------------------------------

async def test_booking_payments_show_up_as_actual_spend(
    auth_client: AsyncClient, supply
):
    """The budget tab read 0 spent while 10,000 had left the traveller's card."""
    trip_id = await make_trip(auth_client)
    before = (await auth_client.get(f"/trips/{trip_id}/budget")).json()["data"]
    assert Decimal(before["actual_cost"]) == Decimal("0")

    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["flexible"], units=1)]},
    )
    await auth_client.post(
        f"/bookings/{created.json()['data']['id']}/payments", json={}
    )

    after = (await auth_client.get(f"/trips/{trip_id}/budget")).json()["data"]
    assert Decimal(after["actual_cost"]) == Decimal("10000.00")
    assert Decimal(after["booking_paid"]) == Decimal("10000.00")
    assert Decimal(after["remaining"]) == Decimal(after["total_budget"]) - Decimal(
        "10000.00"
    )


async def test_booking_spend_lands_in_its_own_category(
    auth_client: AsyncClient, supply
):
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={
            "items": [
                line(supply["flexible"], units=1),   # accommodation, 10000
                line(supply["strict"], quantity=1),  # activity, 500
            ]
        },
    )
    await auth_client.post(
        f"/bookings/{created.json()['data']['id']}/payments", json={}
    )

    data = (await auth_client.get(f"/trips/{trip_id}/budget")).json()["data"]
    buckets = {b["category"]: Decimal(b["actual"]) for b in data["breakdown"]}
    assert buckets["accommodation"] == Decimal("10000.00")
    assert buckets["activities"] == Decimal("500.00")
    assert sum(buckets.values()) == Decimal("10500.00")


async def test_a_refunded_booking_stops_counting_against_the_budget(
    auth_client: AsyncClient, supply
):
    """Netting captures against refunds is why this is not an Expense row."""
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["flexible"], units=1)]},
    )
    booking_id = created.json()["data"]["id"]
    await auth_client.post(f"/bookings/{booking_id}/payments", json={})
    await auth_client.delete(f"/bookings/{booking_id}")

    data = (await auth_client.get(f"/trips/{trip_id}/budget")).json()["data"]
    assert Decimal(data["actual_cost"]) == Decimal("0")


async def test_a_penalty_kept_on_cancellation_stays_counted_as_spend(
    auth_client: AsyncClient, supply
):
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bookings",
        json={"items": [line(supply["strict"], quantity=1)]},  # non-refundable 500
    )
    booking_id = created.json()["data"]["id"]
    await auth_client.post(f"/bookings/{booking_id}/payments", json={})
    await auth_client.delete(f"/bookings/{booking_id}")

    data = (await auth_client.get(f"/trips/{trip_id}/budget")).json()["data"]
    assert Decimal(data["actual_cost"]) == Decimal("500.00")
