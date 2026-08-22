"""Stops, itinerary activities, reordering and the ownership chain.

Covers spec sections 8, 9, 13, 24 and 31.
"""

from datetime import date, timedelta

import pytest
from httpx import AsyncClient

TODAY = date.today()
START = TODAY + timedelta(days=30)
END = TODAY + timedelta(days=36)


def d(offset: int) -> str:
    return (START + timedelta(days=offset)).isoformat()


async def make_trip(client: AsyncClient, **overrides) -> str:
    payload = {
        "title": "West Coast Run",
        "start_date": START.isoformat(),
        "end_date": END.isoformat(),
        "budget": "40000.00",
        "traveller_count": 2,
    }
    payload.update(overrides)
    resp = await client.post("/trips", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


async def make_stop(client: AsyncClient, trip_id: str, **overrides) -> str:
    payload = {
        "city_name": "Mumbai",
        "country": "India",
        "arrival_date": d(0),
        "departure_date": d(1),
    }
    payload.update(overrides)
    resp = await client.post(f"/trips/{trip_id}/stops", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


# --------------------------------------------------------------------------
# Stops
# --------------------------------------------------------------------------

async def test_add_stop(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/stops",
        json={
            "city_name": "Mumbai",
            "country": "India",
            "arrival_date": d(0),
            "departure_date": d(1),
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["city_name"] == "Mumbai"
    assert data["order_index"] == 0
    assert data["nights"] == 1


async def test_adding_a_stop_moves_the_trip_out_of_draft(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    assert (await auth_client.get(f"/trips/{trip_id}")).json()["data"]["status"] == "draft"

    await make_stop(auth_client, trip_id)

    detail = await auth_client.get(f"/trips/{trip_id}")
    assert detail.json()["data"]["status"] == "upcoming"


async def test_stop_before_the_trip_starts_is_rejected(auth_client: AsyncClient):
    """Spec section 31: trip.start_date <= stop.arrival_date."""
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/stops",
        json={
            "city_name": "Mumbai",
            "arrival_date": (START - timedelta(days=3)).isoformat(),
            "departure_date": d(1),
        },
    )
    assert resp.status_code == 422
    assert "arrival_date" in resp.json()["error"]["details"]["fields"]


async def test_stop_after_the_trip_ends_is_rejected(auth_client: AsyncClient):
    """Spec section 31: stop.departure_date <= trip.end_date."""
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/stops",
        json={
            "city_name": "Mumbai",
            "arrival_date": d(1),
            "departure_date": (END + timedelta(days=3)).isoformat(),
        },
    )
    assert resp.status_code == 422
    assert "departure_date" in resp.json()["error"]["details"]["fields"]


async def test_stop_departure_before_arrival_is_rejected(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/stops",
        json={
            "city_name": "Mumbai",
            "arrival_date": d(4),
            "departure_date": d(1),
        },
    )
    assert resp.status_code == 422


async def test_stop_with_unknown_destination_is_rejected(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/stops",
        json={
            "city_name": "Nowhere",
            "arrival_date": d(0),
            "departure_date": d(1),
            "destination_id": "00000000-0000-0000-0000-000000000000",
        },
    )
    assert resp.status_code == 422


async def test_stop_can_link_a_real_destination(
    auth_client: AsyncClient, seeded_destination
):
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/stops",
        json={
            "city_name": "Goa",
            "arrival_date": d(0),
            "departure_date": d(1),
            "destination_id": str(seeded_destination.id),
        },
    )
    assert resp.status_code == 201
    assert resp.json()["data"]["destination_id"] == str(seeded_destination.id)


async def test_overlapping_stops_warn_rather_than_fail(auth_client: AsyncClient):
    """Refinement R6: plausible mistake, not invalid data."""
    trip_id = await make_trip(auth_client)
    await make_stop(auth_client, trip_id, city_name="Mumbai",
                    arrival_date=d(0), departure_date=d(3))

    resp = await auth_client.post(
        f"/trips/{trip_id}/stops",
        json={
            "city_name": "Goa",
            "arrival_date": d(1),
            "departure_date": d(4),
        },
    )
    assert resp.status_code == 201
    assert resp.json()["data"]["warnings"]


async def test_stops_are_appended_in_order(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    await make_stop(auth_client, trip_id, city_name="Mumbai",
                    arrival_date=d(0), departure_date=d(1))
    await make_stop(auth_client, trip_id, city_name="Goa",
                    arrival_date=d(2), departure_date=d(4))
    await make_stop(auth_client, trip_id, city_name="Gokarna",
                    arrival_date=d(5), departure_date=d(6))

    resp = await auth_client.get(f"/trips/{trip_id}/stops")
    items = resp.json()["data"]["items"]
    assert [s["city_name"] for s in items] == ["Mumbai", "Goa", "Gokarna"]
    assert [s["order_index"] for s in items] == [0, 1, 2]


async def test_deleting_a_stop_closes_the_order_gap(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    a = await make_stop(auth_client, trip_id, city_name="Mumbai",
                        arrival_date=d(0), departure_date=d(1))
    await make_stop(auth_client, trip_id, city_name="Goa",
                    arrival_date=d(2), departure_date=d(4))
    await make_stop(auth_client, trip_id, city_name="Gokarna",
                    arrival_date=d(5), departure_date=d(6))

    assert (await auth_client.delete(f"/stops/{a}")).status_code == 200

    items = (await auth_client.get(f"/trips/{trip_id}/stops")).json()["data"]["items"]
    assert [s["city_name"] for s in items] == ["Goa", "Gokarna"]
    assert [s["order_index"] for s in items] == [0, 1]


async def test_narrowing_a_stop_that_strands_an_activity_is_rejected(
    auth_client: AsyncClient
):
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id, arrival_date=d(0),
                              departure_date=d(4))
    await auth_client.post(
        f"/stops/{stop_id}/activities",
        json={"title": "Gateway of India", "activity_date": d(3)},
    )

    resp = await auth_client.put(
        f"/stops/{stop_id}", json={"departure_date": d(1)}
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["details"]["stranded_activities"]


# --------------------------------------------------------------------------
# Reordering
# --------------------------------------------------------------------------

async def test_reorder_stops(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    a = await make_stop(auth_client, trip_id, city_name="Mumbai",
                        arrival_date=d(0), departure_date=d(1))
    b = await make_stop(auth_client, trip_id, city_name="Goa",
                        arrival_date=d(2), departure_date=d(4))
    c = await make_stop(auth_client, trip_id, city_name="Gokarna",
                        arrival_date=d(5), departure_date=d(6))

    resp = await auth_client.put(
        f"/trips/{trip_id}/stops/reorder", json={"ordered_ids": [c, a, b]}
    )
    assert resp.status_code == 200, resp.text
    items = resp.json()["data"]["items"]
    assert [s["city_name"] for s in items] == ["Gokarna", "Mumbai", "Goa"]
    assert [s["order_index"] for s in items] == [0, 1, 2]


async def test_reorder_rejects_a_partial_list(auth_client: AsyncClient):
    """A stale client view must not silently drop a stop."""
    trip_id = await make_trip(auth_client)
    a = await make_stop(auth_client, trip_id, city_name="Mumbai",
                        arrival_date=d(0), departure_date=d(1))
    await make_stop(auth_client, trip_id, city_name="Goa",
                    arrival_date=d(2), departure_date=d(4))

    resp = await auth_client.put(
        f"/trips/{trip_id}/stops/reorder", json={"ordered_ids": [a]}
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["details"]["missing_ids"]


async def test_reorder_rejects_a_foreign_id(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    a = await make_stop(auth_client, trip_id)

    resp = await auth_client.put(
        f"/trips/{trip_id}/stops/reorder",
        json={"ordered_ids": [a, "00000000-0000-0000-0000-000000000000"]},
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["details"]["unknown_ids"]


async def test_reorder_rejects_duplicates(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    a = await make_stop(auth_client, trip_id)
    resp = await auth_client.put(
        f"/trips/{trip_id}/stops/reorder", json={"ordered_ids": [a, a]}
    )
    assert resp.status_code == 422


# --------------------------------------------------------------------------
# Itinerary activities
# --------------------------------------------------------------------------

async def test_add_activity(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id, arrival_date=d(0),
                              departure_date=d(2))

    resp = await auth_client.post(
        f"/stops/{stop_id}/activities",
        json={
            "title": "Gateway of India",
            "activity_date": d(1),
            "start_time": "10:00:00",
            "end_time": "12:00:00",
            "estimated_cost": "800.00",
            "category": "sightseeing",
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["title"] == "Gateway of India"
    assert data["estimated_cost"] == "800.00"


async def test_activity_outside_the_stop_dates_is_rejected(auth_client: AsyncClient):
    """Spec section 31."""
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id, arrival_date=d(0),
                              departure_date=d(1))

    resp = await auth_client.post(
        f"/stops/{stop_id}/activities",
        json={"title": "Too late", "activity_date": d(5)},
    )
    assert resp.status_code == 422
    assert "activity_date" in resp.json()["error"]["details"]["fields"]


async def test_end_time_before_start_time_is_rejected(auth_client: AsyncClient):
    """Spec section 2.3: 'Activity with invalid time range -> reject'."""
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id)

    resp = await auth_client.post(
        f"/stops/{stop_id}/activities",
        json={
            "title": "Backwards",
            "activity_date": d(0),
            "start_time": "15:00:00",
            "end_time": "09:00:00",
        },
    )
    assert resp.status_code == 422


async def test_equal_start_and_end_time_is_rejected(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id)
    resp = await auth_client.post(
        f"/stops/{stop_id}/activities",
        json={
            "title": "Zero length",
            "activity_date": d(0),
            "start_time": "10:00:00",
            "end_time": "10:00:00",
        },
    )
    assert resp.status_code == 422


async def test_end_time_without_start_time_is_rejected(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id)
    resp = await auth_client.post(
        f"/stops/{stop_id}/activities",
        json={"title": "Dangling", "activity_date": d(0), "end_time": "12:00:00"},
    )
    assert resp.status_code == 422


async def test_negative_activity_cost_is_rejected(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id)
    resp = await auth_client.post(
        f"/stops/{stop_id}/activities",
        json={"title": "Free", "activity_date": d(0), "estimated_cost": "-5"},
    )
    assert resp.status_code == 422


async def test_overlapping_activity_times_warn(auth_client: AsyncClient):
    """Refinement R6."""
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id, arrival_date=d(0),
                              departure_date=d(2))

    await auth_client.post(
        f"/stops/{stop_id}/activities",
        json={
            "title": "Museum",
            "activity_date": d(0),
            "start_time": "10:00:00",
            "end_time": "13:00:00",
        },
    )
    resp = await auth_client.post(
        f"/stops/{stop_id}/activities",
        json={
            "title": "Lunch",
            "activity_date": d(0),
            "start_time": "12:00:00",
            "end_time": "14:00:00",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["data"]["warnings"]


async def test_update_activity_rechecks_time_against_stored_value(
    auth_client: AsyncClient
):
    """Only end_time is sent, but it would land before the stored start_time."""
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id)
    created = await auth_client.post(
        f"/stops/{stop_id}/activities",
        json={
            "title": "Museum",
            "activity_date": d(0),
            "start_time": "14:00:00",
            "end_time": "16:00:00",
        },
    )
    activity_id = created.json()["data"]["id"]

    resp = await auth_client.put(
        f"/itinerary-activities/{activity_id}", json={"end_time": "09:00:00"}
    )
    assert resp.status_code == 422


async def test_reorder_activities(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id, arrival_date=d(0),
                              departure_date=d(2))

    ids = []
    for title in ["First", "Second", "Third"]:
        r = await auth_client.post(
            f"/stops/{stop_id}/activities",
            json={"title": title, "activity_date": d(0)},
        )
        ids.append(r.json()["data"]["id"])

    resp = await auth_client.put(
        f"/stops/{stop_id}/activities/reorder",
        json={"ordered_ids": [ids[2], ids[0], ids[1]]},
    )
    assert resp.status_code == 200, resp.text
    titles = [a["title"] for a in resp.json()["data"]["items"]]
    assert titles == ["Third", "First", "Second"]


async def test_delete_activity_closes_the_gap(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id, arrival_date=d(0),
                              departure_date=d(2))
    ids = []
    for title in ["First", "Second", "Third"]:
        r = await auth_client.post(
            f"/stops/{stop_id}/activities",
            json={"title": title, "activity_date": d(0)},
        )
        ids.append(r.json()["data"]["id"])

    await auth_client.delete(f"/itinerary-activities/{ids[0]}")

    items = (await auth_client.get(f"/stops/{stop_id}/activities")).json()["data"]["items"]
    assert [a["order_index"] for a in items] == [0, 1]


# --------------------------------------------------------------------------
# Ownership chain (spec section 24)
# --------------------------------------------------------------------------

@pytest.fixture
async def intruder_headers(client: AsyncClient, registration) -> dict:
    resp = await client.post(
        "/auth/register",
        json={**registration, "email": "intruder@example.com", "first_name": "Nosy"},
    )
    return {"Authorization": f"Bearer {resp.json()['data']['access_token']}"}


async def test_another_user_cannot_add_a_stop(
    auth_client: AsyncClient, client: AsyncClient, intruder_headers
):
    trip_id = await make_trip(auth_client)
    resp = await client.post(
        f"/trips/{trip_id}/stops",
        json={
            "city_name": "Hijack",
            "arrival_date": d(0),
            "departure_date": d(1),
        },
        headers=intruder_headers,
    )
    assert resp.status_code == 403


async def test_another_user_cannot_touch_a_stop(
    auth_client: AsyncClient, client: AsyncClient, intruder_headers
):
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id)

    assert (
        await client.get(f"/stops/{stop_id}", headers=intruder_headers)
    ).status_code == 403
    assert (
        await client.put(
            f"/stops/{stop_id}", json={"city_name": "Hijacked"},
            headers=intruder_headers,
        )
    ).status_code == 403
    assert (
        await client.delete(f"/stops/{stop_id}", headers=intruder_headers)
    ).status_code == 403


async def test_another_user_cannot_touch_an_activity(
    auth_client: AsyncClient, client: AsyncClient, intruder_headers
):
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id)
    created = await auth_client.post(
        f"/stops/{stop_id}/activities",
        json={"title": "Mine", "activity_date": d(0)},
    )
    activity_id = created.json()["data"]["id"]

    assert (
        await client.put(
            f"/itinerary-activities/{activity_id}",
            json={"title": "Hijacked"},
            headers=intruder_headers,
        )
    ).status_code == 403
    assert (
        await client.delete(
            f"/itinerary-activities/{activity_id}", headers=intruder_headers
        )
    ).status_code == 403


# --------------------------------------------------------------------------
# Itinerary view (spec section 13)
# --------------------------------------------------------------------------

async def test_itinerary_groups_activities_by_day(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id, city_name="Mumbai",
                              arrival_date=d(0), departure_date=d(2))

    await auth_client.post(
        f"/stops/{stop_id}/activities",
        json={"title": "Day one A", "activity_date": d(0), "start_time": "09:00:00", "end_time": "10:00:00"},
    )
    await auth_client.post(
        f"/stops/{stop_id}/activities",
        json={"title": "Day one B", "activity_date": d(0), "start_time": "11:00:00", "end_time": "12:00:00"},
    )
    await auth_client.post(
        f"/stops/{stop_id}/activities",
        json={"title": "Day two", "activity_date": d(1)},
    )

    resp = await auth_client.get(f"/trips/{trip_id}/itinerary")
    assert resp.status_code == 200, resp.text
    days = resp.json()["data"]["days"]

    # One entry per calendar day of the trip.
    assert len(days) == 7
    assert days[0]["day_number"] == 1
    assert [a["title"] for a in days[0]["activities"]] == ["Day one A", "Day one B"]
    assert [a["title"] for a in days[1]["activities"]] == ["Day two"]
    assert days[0]["city_name"] == "Mumbai"
    assert days[6]["activities"] == []


async def test_itinerary_sums_cost_per_day(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    stop_id = await make_stop(auth_client, trip_id, arrival_date=d(0),
                              departure_date=d(2))
    for cost in ["500.00", "250.50"]:
        await auth_client.post(
            f"/stops/{stop_id}/activities",
            json={"title": f"Cost {cost}", "activity_date": d(0),
                  "estimated_cost": cost},
        )

    days = (await auth_client.get(f"/trips/{trip_id}/itinerary")).json()["data"]["days"]
    assert days[0]["estimated_cost"] == "750.50"
