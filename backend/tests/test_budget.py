"""Budget, expenses, transport, accommodation and calendar.

Covers spec sections 14, 15, 17, 19, 20 and the section 31 data rules.
"""

from datetime import date, timedelta

import pytest
from httpx import AsyncClient

TODAY = date.today()
START = TODAY + timedelta(days=30)
END = TODAY + timedelta(days=36)


def d(offset: int) -> str:
    return (START + timedelta(days=offset)).isoformat()


def dt(offset: int, hour: int) -> str:
    return f"{(START + timedelta(days=offset)).isoformat()}T{hour:02d}:00:00+00:00"


async def make_trip(client: AsyncClient, budget="40000.00") -> str:
    resp = await client.post(
        "/trips",
        json={
            "title": "West Coast Run",
            "start_date": START.isoformat(),
            "end_date": END.isoformat(),
            "budget": budget,
            "traveller_count": 2,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


async def make_stop(client: AsyncClient, trip_id: str, city="Mumbai",
                    arrive=0, depart=2) -> str:
    resp = await client.post(
        f"/trips/{trip_id}/stops",
        json={
            "city_name": city,
            "country": "India",
            "arrival_date": d(arrive),
            "departure_date": d(depart),
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


# --------------------------------------------------------------------------
# Expenses (spec section 15)
# --------------------------------------------------------------------------

async def test_record_an_expense(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/expenses",
        json={
            "category": "food",
            "title": "Dinner",
            "amount": "850.00",
            "date": d(1),
            "notes": "Dinner for two",
        },
    )
    # "food" is not one of the five categories the budget breakdown uses.
    assert resp.status_code == 422


async def test_valid_expense_categories(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    for category in [
        "transport", "accommodation", "activities", "meals", "miscellaneous"
    ]:
        resp = await auth_client.post(
            f"/trips/{trip_id}/expenses",
            json={
                "category": category,
                "title": f"Spend on {category}",
                "amount": "100.00",
                "date": d(1),
            },
        )
        assert resp.status_code == 201, resp.text


@pytest.mark.parametrize("amount", ["0", "0.00", "-1", "-0.01"])
async def test_non_positive_expense_is_rejected(auth_client: AsyncClient, amount):
    """Spec section 31 requires amount > 0 strictly."""
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/expenses",
        json={
            "category": "meals",
            "title": "Nothing",
            "amount": amount,
            "date": d(1),
        },
    )
    assert resp.status_code == 422


async def test_expense_far_outside_the_trip_is_rejected(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/expenses",
        json={
            "category": "meals",
            "title": "Way off",
            "amount": "100.00",
            "date": (START - timedelta(days=60)).isoformat(),
        },
    )
    assert resp.status_code == 422
    assert "date" in resp.json()["error"]["details"]["fields"]


async def test_expense_one_day_before_the_trip_is_allowed(auth_client: AsyncClient):
    """Travel spills over at the edges: an airport taxi the night before."""
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/expenses",
        json={
            "category": "transport",
            "title": "Airport taxi",
            "amount": "600.00",
            "date": (START - timedelta(days=1)).isoformat(),
        },
    )
    assert resp.status_code == 201


async def test_expense_amount_precision_is_enforced(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/expenses",
        json={
            "category": "meals",
            "title": "Too precise",
            "amount": "10.999",
            "date": d(1),
        },
    )
    assert resp.status_code == 422


async def test_list_expenses_totals_them(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    for amount in ["850.00", "1200.50"]:
        await auth_client.post(
            f"/trips/{trip_id}/expenses",
            json={
                "category": "meals",
                "title": f"Meal {amount}",
                "amount": amount,
                "date": d(1),
            },
        )

    resp = await auth_client.get(f"/trips/{trip_id}/expenses")
    body = resp.json()["data"]
    assert body["pagination"]["total"] == 2
    assert body["total_amount"] == "2050.50"


async def test_update_and_delete_an_expense(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/expenses",
        json={
            "category": "meals",
            "title": "Dinner",
            "amount": "850.00",
            "date": d(1),
        },
    )
    expense_id = created.json()["data"]["id"]

    updated = await auth_client.put(
        f"/expenses/{expense_id}", json={"amount": "900.00"}
    )
    assert updated.json()["data"]["amount"] == "900.00"

    assert (await auth_client.delete(f"/expenses/{expense_id}")).status_code == 200
    assert (await auth_client.get(f"/expenses/{expense_id}")).status_code == 404


async def test_another_user_cannot_touch_your_expense(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/expenses",
        json={
            "category": "meals",
            "title": "Dinner",
            "amount": "850.00",
            "date": d(1),
        },
    )
    expense_id = created.json()["data"]["id"]

    other = await client.post(
        "/auth/register",
        json={**registration, "email": "nosy@example.com", "first_name": "Nosy"},
    )
    headers = {"Authorization": f"Bearer {other.json()['data']['access_token']}"}

    assert (
        await client.put(
            f"/expenses/{expense_id}", json={"amount": "1.00"}, headers=headers
        )
    ).status_code == 403
    assert (
        await client.delete(f"/expenses/{expense_id}", headers=headers)
    ).status_code == 403


# --------------------------------------------------------------------------
# Budget (spec section 14)
# --------------------------------------------------------------------------

async def test_budget_on_an_empty_trip(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    body = (await auth_client.get(f"/trips/{trip_id}/budget")).json()["data"]

    assert body["total_budget"] == "40000.00"
    assert body["estimated_cost"] == "0"
    assert body["actual_cost"] == "0"
    assert body["remaining"] == "40000.00"
    assert body["over_budget"] is False
    assert len(body["breakdown"]) == 5


async def test_budget_sums_planned_costs(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id)

    await auth_client.post(
        f"/stops/{stop_id}/activities",
        json={"title": "Museum", "activity_date": d(0), "estimated_cost": "500.00"},
    )
    await auth_client.post(
        f"/stops/{stop_id}/accommodations",
        json={
            "name": "Beach shack",
            "check_in": d(0),
            "check_out": d(2),
            "estimated_cost": "5000.00",
        },
    )

    body = (await auth_client.get(f"/trips/{trip_id}/budget")).json()["data"]
    assert body["estimated_cost"] == "5500.00"

    by_category = {b["category"]: b for b in body["breakdown"]}
    assert by_category["activities"]["estimated"] == "500.00"
    assert by_category["accommodation"]["estimated"] == "5000.00"


async def test_budget_tracks_actual_spend_separately(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id)
    await auth_client.post(
        f"/stops/{stop_id}/activities",
        json={"title": "Museum", "activity_date": d(0), "estimated_cost": "500.00"},
    )
    await auth_client.post(
        f"/trips/{trip_id}/expenses",
        json={
            "category": "meals",
            "title": "Dinner",
            "amount": "2400.00",
            "date": d(1),
        },
    )

    body = (await auth_client.get(f"/trips/{trip_id}/budget")).json()["data"]
    assert body["estimated_cost"] == "500.00"
    assert body["actual_cost"] == "2400.00"
    assert body["remaining"] == "37600.00"


async def test_budget_flags_going_over(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client, budget="1000.00")
    await auth_client.post(
        f"/trips/{trip_id}/expenses",
        json={
            "category": "meals",
            "title": "Blowout",
            "amount": "1500.00",
            "date": d(1),
        },
    )

    body = (await auth_client.get(f"/trips/{trip_id}/budget")).json()["data"]
    assert body["over_budget"] is True
    assert body["remaining"] == "-500.00"
    assert body["percent_used"] == 150.0


async def test_budget_divides_per_traveller(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    body = (await auth_client.get(f"/trips/{trip_id}/budget")).json()["data"]
    # 40000 across 2 travellers.
    assert body["per_traveller"]["budget"] == "20000.00"


async def test_budget_requires_ownership(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    trip_id = await make_trip(auth_client)
    other = await client.post(
        "/auth/register",
        json={**registration, "email": "nosy@example.com", "first_name": "Nosy"},
    )
    headers = {"Authorization": f"Bearer {other.json()['data']['access_token']}"}
    assert (
        await client.get(f"/trips/{trip_id}/budget", headers=headers)
    ).status_code == 403


# --------------------------------------------------------------------------
# Transport (spec section 19)
# --------------------------------------------------------------------------

async def test_add_transport_between_stops(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    a = await make_stop(auth_client, trip_id, "Mumbai", 0, 1)
    b = await make_stop(auth_client, trip_id, "Goa", 2, 4)

    resp = await auth_client.post(
        f"/trips/{trip_id}/transport",
        json={
            "origin_stop_id": a,
            "destination_stop_id": b,
            "transport_type": "train",
            "departure_time": dt(2, 8),
            "arrival_time": dt(2, 12),
            "cost": "850.00",
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["origin_city"] == "Mumbai"
    assert data["destination_city"] == "Goa"
    assert data["duration_minutes"] == 240


async def test_transport_arrival_before_departure_is_rejected(
    auth_client: AsyncClient
):
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/transport",
        json={
            "transport_type": "train",
            "departure_time": dt(2, 12),
            "arrival_time": dt(2, 8),
        },
    )
    assert resp.status_code == 422


async def test_transport_with_identical_stops_is_rejected(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    a = await make_stop(auth_client, trip_id)
    resp = await auth_client.post(
        f"/trips/{trip_id}/transport",
        json={
            "origin_stop_id": a,
            "destination_stop_id": a,
            "transport_type": "car",
            "departure_time": dt(0, 8),
            "arrival_time": dt(0, 10),
        },
    )
    assert resp.status_code == 422


async def test_transport_cannot_reference_another_trips_stop(
    auth_client: AsyncClient
):
    """Otherwise a user could probe for stop ids outside their own trip."""
    trip_a = await make_trip(auth_client)
    trip_b = await make_trip(auth_client)
    foreign_stop = await make_stop(auth_client, trip_b)

    resp = await auth_client.post(
        f"/trips/{trip_a}/transport",
        json={
            "origin_stop_id": foreign_stop,
            "transport_type": "train",
            "departure_time": dt(0, 8),
            "arrival_time": dt(0, 12),
        },
    )
    assert resp.status_code == 422
    assert "origin_stop_id" in resp.json()["error"]["details"]["fields"]


async def test_transport_outside_the_trip_dates_is_rejected(
    auth_client: AsyncClient
):
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/transport",
        json={
            "transport_type": "flight",
            "departure_time": f"{(START - timedelta(days=5)).isoformat()}T08:00:00+00:00",
            "arrival_time": f"{(START - timedelta(days=5)).isoformat()}T11:00:00+00:00",
        },
    )
    assert resp.status_code == 422


async def test_negative_transport_cost_is_rejected(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/transport",
        json={
            "transport_type": "bus",
            "departure_time": dt(1, 8),
            "arrival_time": dt(1, 12),
            "cost": "-100",
        },
    )
    assert resp.status_code == 422


async def test_update_and_delete_transport(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/transport",
        json={
            "transport_type": "bus",
            "departure_time": dt(1, 8),
            "arrival_time": dt(1, 12),
            "cost": "400.00",
        },
    )
    transport_id = created.json()["data"]["id"]

    updated = await auth_client.put(
        f"/transport/{transport_id}", json={"cost": "500.00", "provider": "RedBus"}
    )
    assert updated.json()["data"]["cost"] == "500.00"

    assert (await auth_client.delete(f"/transport/{transport_id}")).status_code == 200


# --------------------------------------------------------------------------
# Accommodation (spec section 20)
# --------------------------------------------------------------------------

async def test_add_accommodation(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id, arrive=0, depart=2)

    resp = await auth_client.post(
        f"/stops/{stop_id}/accommodations",
        json={
            "name": "Example Hotel",
            "check_in": d(0),
            "check_out": d(2),
            "estimated_cost": "5000.00",
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["nights"] == 2


async def test_accommodation_outside_the_stop_is_rejected(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id, arrive=0, depart=2)

    resp = await auth_client.post(
        f"/stops/{stop_id}/accommodations",
        json={"name": "Too long", "check_in": d(0), "check_out": d(5)},
    )
    assert resp.status_code == 422
    assert "check_out" in resp.json()["error"]["details"]["fields"]


async def test_accommodation_checkout_before_checkin_is_rejected(
    auth_client: AsyncClient
):
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id, arrive=0, depart=2)
    resp = await auth_client.post(
        f"/stops/{stop_id}/accommodations",
        json={"name": "Backwards", "check_in": d(2), "check_out": d(0)},
    )
    assert resp.status_code == 422


@pytest.mark.parametrize("url", ["not-a-url", "ftp://example.com", "javascript:alert(1)"])
async def test_invalid_booking_url_is_rejected(auth_client: AsyncClient, url):
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id, arrive=0, depart=2)
    resp = await auth_client.post(
        f"/stops/{stop_id}/accommodations",
        json={
            "name": "Hotel",
            "check_in": d(0),
            "check_out": d(1),
            "booking_url": url,
        },
    )
    assert resp.status_code == 422


async def test_valid_booking_url_is_accepted(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id, arrive=0, depart=2)
    resp = await auth_client.post(
        f"/stops/{stop_id}/accommodations",
        json={
            "name": "Hotel",
            "check_in": d(0),
            "check_out": d(1),
            "booking_url": "https://example.com/booking/123",
        },
    )
    assert resp.status_code == 201


# --------------------------------------------------------------------------
# Calendar (spec section 17)
# --------------------------------------------------------------------------

async def test_trip_calendar_returns_events(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id, "Mumbai", 0, 2)

    await auth_client.post(
        f"/stops/{stop_id}/activities",
        json={
            "title": "Gateway of India",
            "activity_date": d(0),
            "start_time": "10:00:00",
            "end_time": "12:00:00",
        },
    )

    resp = await auth_client.get(f"/trips/{trip_id}/calendar")
    assert resp.status_code == 200, resp.text

    events = resp.json()["data"]["events"]
    activity = next(e for e in events if e["type"] == "activity")
    assert activity["title"] == "Gateway of India"
    assert activity["city"] == "Mumbai"
    assert activity["start_time"] == "10:00:00"


async def test_calendar_includes_transport_and_accommodation(
    auth_client: AsyncClient
):
    trip_id = await make_trip(auth_client)
    a = await make_stop(auth_client, trip_id, "Mumbai", 0, 1)
    b = await make_stop(auth_client, trip_id, "Goa", 2, 4)

    await auth_client.post(
        f"/trips/{trip_id}/transport",
        json={
            "origin_stop_id": a,
            "destination_stop_id": b,
            "transport_type": "train",
            "departure_time": dt(2, 8),
            "arrival_time": dt(2, 12),
        },
    )
    await auth_client.post(
        f"/stops/{b}/accommodations",
        json={"name": "Beach shack", "check_in": d(2), "check_out": d(4)},
    )

    events = (
        await auth_client.get(f"/trips/{trip_id}/calendar")
    ).json()["data"]["events"]
    types = {e["type"] for e in events}
    assert "transport" in types
    assert "accommodation_check_in" in types
    assert "accommodation_check_out" in types


async def test_calendar_month_filter_needs_both_parts(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    resp = await auth_client.get(f"/trips/{trip_id}/calendar?month=9")
    assert resp.status_code == 422


@pytest.mark.parametrize("bad", ["month=13&year=2026", "month=0&year=2026"])
async def test_calendar_rejects_an_impossible_month(auth_client: AsyncClient, bad):
    trip_id = await make_trip(auth_client)
    assert (
        await auth_client.get(f"/trips/{trip_id}/calendar?{bad}")
    ).status_code == 422


async def test_user_calendar_spans_trips(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id, "Mumbai", 0, 2)
    await auth_client.post(
        f"/stops/{stop_id}/activities",
        json={"title": "Across trips", "activity_date": d(0)},
    )

    resp = await auth_client.get("/calendar")
    assert resp.status_code == 200
    titles = [e["title"] for e in resp.json()["data"]["events"]]
    assert "Across trips" in titles


async def test_user_calendar_rejects_an_inverted_window(auth_client: AsyncClient):
    resp = await auth_client.get(
        f"/calendar?start={END.isoformat()}&end={START.isoformat()}"
    )
    assert resp.status_code == 422
