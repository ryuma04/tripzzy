"""Trip CRUD, validation, status computation and authorization.

Covers spec sections 7, 10, 24 and 31.
"""

from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

TODAY = date.today()


def trip_payload(**overrides) -> dict:
    base = {
        "title": "West Coast Run",
        "start_date": (TODAY + timedelta(days=30)).isoformat(),
        "end_date": (TODAY + timedelta(days=36)).isoformat(),
        "budget": "40000.00",
        "traveller_count": 2,
        "currency": "INR",
    }
    base.update(overrides)
    return base


async def make_stop(db: AsyncSession, trip_id, arrival: date, departure: date):
    """Insert a stop directly so trip status leaves 'draft'."""
    from app.models import TripStop

    stop = TripStop(
        trip_id=trip_id,
        city_name="Goa",
        country="India",
        arrival_date=arrival,
        departure_date=departure,
        order_index=0,
    )
    db.add(stop)
    await db.commit()
    await db.refresh(stop)
    return stop


# --------------------------------------------------------------------------
# Creation and validation
# --------------------------------------------------------------------------

async def test_create_trip(auth_client: AsyncClient):
    resp = await auth_client.post("/trips", json=trip_payload())
    assert resp.status_code == 201, resp.text

    data = resp.json()["data"]
    assert data["title"] == "West Coast Run"
    assert data["duration_days"] == 7
    # No stops yet, so it is a draft (refinement R3).
    assert data["status"] == "draft"


async def test_end_date_before_start_date_is_rejected(auth_client: AsyncClient):
    """Spec section 2.3 / 31."""
    resp = await auth_client.post(
        "/trips",
        json=trip_payload(
            start_date=(TODAY + timedelta(days=10)).isoformat(),
            end_date=(TODAY + timedelta(days=5)).isoformat(),
        ),
    )
    assert resp.status_code == 422


async def test_same_start_and_end_date_is_allowed(auth_client: AsyncClient):
    """A one-day trip is valid: the rule is <=, not <."""
    day = (TODAY + timedelta(days=10)).isoformat()
    resp = await auth_client.post(
        "/trips", json=trip_payload(start_date=day, end_date=day)
    )
    assert resp.status_code == 201
    assert resp.json()["data"]["duration_days"] == 1


async def test_negative_budget_is_rejected(auth_client: AsyncClient):
    resp = await auth_client.post("/trips", json=trip_payload(budget="-1"))
    assert resp.status_code == 422


async def test_zero_budget_is_allowed(auth_client: AsyncClient):
    """Spec section 31 says budget >= 0, so zero is legitimate."""
    resp = await auth_client.post("/trips", json=trip_payload(budget="0"))
    assert resp.status_code == 201


@pytest.mark.parametrize("count", [0, -1, 51])
async def test_invalid_traveller_count_is_rejected(auth_client: AsyncClient, count):
    resp = await auth_client.post(
        "/trips", json=trip_payload(traveller_count=count)
    )
    assert resp.status_code == 422


async def test_budget_rejects_more_than_two_decimal_places(auth_client: AsyncClient):
    resp = await auth_client.post("/trips", json=trip_payload(budget="100.999"))
    assert resp.status_code == 422


async def test_trip_longer_than_a_year_is_rejected(auth_client: AsyncClient):
    resp = await auth_client.post(
        "/trips",
        json=trip_payload(
            start_date=TODAY.isoformat(),
            end_date=(TODAY + timedelta(days=400)).isoformat(),
        ),
    )
    assert resp.status_code == 422


@pytest.mark.parametrize("title", ["", "  ", "ab"])
async def test_short_title_is_rejected(auth_client: AsyncClient, title):
    resp = await auth_client.post("/trips", json=trip_payload(title=title))
    assert resp.status_code == 422


@pytest.mark.parametrize("currency", ["RUPEE", "in", "1NR", ""])
async def test_invalid_currency_is_rejected(auth_client: AsyncClient, currency):
    resp = await auth_client.post("/trips", json=trip_payload(currency=currency))
    assert resp.status_code == 422


async def test_currency_is_uppercased(auth_client: AsyncClient):
    resp = await auth_client.post("/trips", json=trip_payload(currency="inr"))
    assert resp.json()["data"]["currency"] == "INR"


# --------------------------------------------------------------------------
# Status computation (spec section 10, refinement R3)
# --------------------------------------------------------------------------

async def test_status_is_computed_not_trusted_from_the_client(
    auth_client: AsyncClient, db: AsyncSession
):
    """Sending status=completed must not make a future trip completed."""
    resp = await auth_client.post(
        "/trips", json={**trip_payload(), "status": "completed"}
    )
    trip_id = resp.json()["data"]["id"]

    await make_stop(
        db, trip_id, TODAY + timedelta(days=30), TODAY + timedelta(days=36)
    )

    detail = await auth_client.get(f"/trips/{trip_id}")
    assert detail.json()["data"]["status"] == "upcoming"


@pytest.mark.parametrize(
    "start_offset,end_offset,expected",
    [
        (30, 36, "upcoming"),
        (-2, 2, "ongoing"),
        (-20, -10, "completed"),
        (0, 0, "ongoing"),
    ],
)
async def test_status_ladder(
    auth_client: AsyncClient,
    db: AsyncSession,
    start_offset,
    end_offset,
    expected,
):
    start = TODAY + timedelta(days=start_offset)
    end = TODAY + timedelta(days=end_offset)
    resp = await auth_client.post(
        "/trips",
        json=trip_payload(start_date=start.isoformat(), end_date=end.isoformat()),
    )
    trip_id = resp.json()["data"]["id"]
    await make_stop(db, trip_id, start, end)

    detail = await auth_client.get(f"/trips/{trip_id}")
    assert detail.json()["data"]["status"] == expected


async def test_a_trip_without_stops_stays_draft(
    auth_client: AsyncClient
):
    """Even a past-dated trip is a draft while it has no stops."""
    resp = await auth_client.post(
        "/trips",
        json=trip_payload(
            start_date=(TODAY - timedelta(days=20)).isoformat(),
            end_date=(TODAY - timedelta(days=10)).isoformat(),
        ),
    )
    assert resp.json()["data"]["status"] == "draft"


# --------------------------------------------------------------------------
# Authorization (spec section 24)
# --------------------------------------------------------------------------

async def test_another_user_cannot_read_your_trip(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    created = await auth_client.post("/trips", json=trip_payload())
    trip_id = created.json()["data"]["id"]

    other = await client.post(
        "/auth/register",
        json={
            **registration,
            "email": "intruder@example.com",
            "first_name": "Nosy",
        },
    )
    token = other.json()["data"]["access_token"]

    resp = await client.get(
        f"/trips/{trip_id}", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "FORBIDDEN"


async def test_another_user_cannot_modify_your_trip(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    """Spec section 2.3: 'Unauthorized user modifying another user's trip -> reject'."""
    created = await auth_client.post("/trips", json=trip_payload())
    trip_id = created.json()["data"]["id"]

    other = await client.post(
        "/auth/register",
        json={**registration, "email": "intruder@example.com", "first_name": "Nosy"},
    )
    headers = {"Authorization": f"Bearer {other.json()['data']['access_token']}"}

    assert (
        await client.put(f"/trips/{trip_id}", json={"title": "Hijacked"}, headers=headers)
    ).status_code == 403
    assert (
        await client.delete(f"/trips/{trip_id}", headers=headers)
    ).status_code == 403


async def test_trips_require_authentication(client: AsyncClient):
    assert (await client.get("/trips")).status_code == 401
    assert (await client.post("/trips", json=trip_payload())).status_code == 401


async def test_a_missing_trip_is_404_not_403(auth_client: AsyncClient):
    ghost = "00000000-0000-0000-0000-000000000000"
    resp = await auth_client.get(f"/trips/{ghost}")
    assert resp.status_code == 404


# --------------------------------------------------------------------------
# Update
# --------------------------------------------------------------------------

async def test_partial_update_leaves_other_fields_alone(auth_client: AsyncClient):
    created = await auth_client.post("/trips", json=trip_payload())
    trip_id = created.json()["data"]["id"]

    resp = await auth_client.put(f"/trips/{trip_id}", json={"title": "New Title"})
    data = resp.json()["data"]
    assert data["title"] == "New Title"
    assert data["traveller_count"] == 2
    assert data["budget"] == "40000.00"


async def test_update_rejects_inverting_dates_via_one_field(
    auth_client: AsyncClient
):
    """Only start_date is sent, but it would move past the stored end_date."""
    created = await auth_client.post("/trips", json=trip_payload())
    trip_id = created.json()["data"]["id"]

    resp = await auth_client.put(
        f"/trips/{trip_id}",
        json={"start_date": (TODAY + timedelta(days=90)).isoformat()},
    )
    assert resp.status_code == 422


async def test_shrinking_dates_that_orphan_a_stop_is_rejected(
    auth_client: AsyncClient, db: AsyncSession
):
    """Refinement R9."""
    created = await auth_client.post("/trips", json=trip_payload())
    trip_id = created.json()["data"]["id"]
    await make_stop(
        db, trip_id, TODAY + timedelta(days=30), TODAY + timedelta(days=36)
    )

    resp = await auth_client.put(
        f"/trips/{trip_id}",
        json={"end_date": (TODAY + timedelta(days=32)).isoformat()},
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["details"]["conflicting_stops"]


async def test_cascade_true_clamps_the_stop_instead(
    auth_client: AsyncClient, db: AsyncSession
):
    created = await auth_client.post("/trips", json=trip_payload())
    trip_id = created.json()["data"]["id"]
    stop = await make_stop(
        db, trip_id, TODAY + timedelta(days=30), TODAY + timedelta(days=36)
    )

    new_end = TODAY + timedelta(days=32)
    resp = await auth_client.put(
        f"/trips/{trip_id}?cascade=true", json={"end_date": new_end.isoformat()}
    )
    assert resp.status_code == 200

    await db.refresh(stop)
    assert stop.departure_date == new_end


# --------------------------------------------------------------------------
# Listing
# --------------------------------------------------------------------------

async def test_list_only_returns_your_own_trips(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    await auth_client.post("/trips", json=trip_payload(title="Mine"))

    other = await client.post(
        "/auth/register",
        json={**registration, "email": "other@example.com", "first_name": "Other"},
    )
    token = other.json()["data"]["access_token"]
    await client.post(
        "/trips",
        json=trip_payload(title="Theirs"),
        headers={"Authorization": f"Bearer {token}"},
    )

    resp = await auth_client.get("/trips")
    items = resp.json()["data"]["items"]
    assert [t["title"] for t in items] == ["Mine"]


async def test_pagination_shape(auth_client: AsyncClient):
    """Spec section 26."""
    for i in range(5):
        await auth_client.post("/trips", json=trip_payload(title=f"Trip {i}"))

    resp = await auth_client.get("/trips?page=1&limit=2")
    body = resp.json()["data"]
    assert len(body["items"]) == 2
    assert body["pagination"] == {
        "page": 1,
        "limit": 2,
        "total": 5,
        "total_pages": 3,
    }


@pytest.mark.parametrize("bad", ["page=0", "limit=0", "limit=101", "page=-1"])
async def test_invalid_pagination_is_rejected(auth_client: AsyncClient, bad):
    assert (await auth_client.get(f"/trips?{bad}")).status_code == 422


async def test_sort_by_is_restricted_to_an_allowlist(auth_client: AsyncClient):
    """An arbitrary column name must not reach ORDER BY."""
    resp = await auth_client.get("/trips?sort_by=hashed_password")
    assert resp.status_code == 422


async def test_filter_by_status(auth_client: AsyncClient, db: AsyncSession):
    draft = await auth_client.post("/trips", json=trip_payload(title="Draft one"))

    upcoming = await auth_client.post("/trips", json=trip_payload(title="Upcoming one"))
    await make_stop(
        db,
        upcoming.json()["data"]["id"],
        TODAY + timedelta(days=30),
        TODAY + timedelta(days=36),
    )
    # Refresh the stored status column.
    await auth_client.get("/trips")

    resp = await auth_client.get("/trips?status=draft")
    titles = [t["title"] for t in resp.json()["data"]["items"]]
    assert titles == ["Draft one"]
    assert draft.status_code == 201


async def test_search_by_title(auth_client: AsyncClient):
    await auth_client.post("/trips", json=trip_payload(title="Kerala Backwaters"))
    await auth_client.post("/trips", json=trip_payload(title="Rajasthan Forts"))

    resp = await auth_client.get("/trips?q=kerala")
    titles = [t["title"] for t in resp.json()["data"]["items"]]
    assert titles == ["Kerala Backwaters"]


# --------------------------------------------------------------------------
# Delete
# --------------------------------------------------------------------------

async def test_delete_hides_the_trip(auth_client: AsyncClient):
    created = await auth_client.post("/trips", json=trip_payload())
    trip_id = created.json()["data"]["id"]

    assert (await auth_client.delete(f"/trips/{trip_id}")).status_code == 200
    assert (await auth_client.get(f"/trips/{trip_id}")).status_code == 404
    assert (await auth_client.get("/trips")).json()["data"]["items"] == []


async def test_delete_is_soft(auth_client: AsyncClient, db: AsyncSession):
    """Refinement R8: the row survives so clones and analytics stay intact."""
    from sqlalchemy import select

    from app.models import Trip

    created = await auth_client.post("/trips", json=trip_payload())
    trip_id = created.json()["data"]["id"]
    await auth_client.delete(f"/trips/{trip_id}")

    row = await db.scalar(select(Trip).where(Trip.id == trip_id))
    assert row is not None
    assert row.deleted_at is not None
