"""Sharing, the community feed and cloning (spec sections 16, 35)."""

from datetime import date, timedelta

from httpx import AsyncClient

TODAY = date.today()
START = TODAY + timedelta(days=30)
END = TODAY + timedelta(days=36)


def d(offset: int) -> str:
    return (START + timedelta(days=offset)).isoformat()


async def build_trip(client: AsyncClient, title="West Coast Run") -> str:
    """A trip with two stops, activities, a stay and a transport leg."""
    resp = await client.post(
        "/trips",
        json={
            "title": title,
            "description": "Mumbai to Goa",
            "start_date": START.isoformat(),
            "end_date": END.isoformat(),
            "budget": "40000.00",
            "traveller_count": 2,
        },
    )
    trip_id = resp.json()["data"]["id"]

    stops = []
    for city, arrive, depart in [("Mumbai", 0, 1), ("Goa", 2, 4)]:
        r = await client.post(
            f"/trips/{trip_id}/stops",
            json={
                "city_name": city,
                "country": "India",
                "arrival_date": d(arrive),
                "departure_date": d(depart),
            },
        )
        stops.append(r.json()["data"]["id"])

    await client.post(
        f"/stops/{stops[0]}/activities",
        json={
            "title": "Gateway of India",
            "activity_date": d(0),
            "start_time": "10:00:00",
            "end_time": "12:00:00",
            "estimated_cost": "800.00",
        },
    )
    await client.post(
        f"/stops/{stops[1]}/activities",
        json={"title": "Palolem beach", "activity_date": d(3),
              "estimated_cost": "700.00"},
    )
    await client.post(
        f"/stops/{stops[1]}/accommodations",
        json={"name": "Beach shack", "check_in": d(2), "check_out": d(4),
              "estimated_cost": "5000.00"},
    )
    await client.post(
        f"/trips/{trip_id}/transport",
        json={
            "origin_stop_id": stops[0],
            "destination_stop_id": stops[1],
            "transport_type": "train",
            "departure_time": f"{d(2)}T08:00:00+00:00",
            "arrival_time": f"{d(2)}T12:00:00+00:00",
            "cost": "850.00",
        },
    )
    return trip_id


async def share(client: AsyncClient, trip_id: str) -> str:
    resp = await client.post(f"/trips/{trip_id}/share")
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["share_slug"]


async def second_user(client: AsyncClient, registration, email="other@example.com"):
    resp = await client.post(
        "/auth/register",
        json={**registration, "email": email, "first_name": "Priya"},
    )
    return {"Authorization": f"Bearer {resp.json()['data']['access_token']}"}


# --------------------------------------------------------------------------
# Sharing
# --------------------------------------------------------------------------

async def test_share_generates_a_slug(auth_client: AsyncClient):
    trip_id = await build_trip(auth_client)
    resp = await auth_client.post(f"/trips/{trip_id}/share")
    assert resp.status_code == 200

    data = resp.json()["data"]
    assert data["is_public"] is True
    assert data["share_slug"].startswith("west-coast-run-")


async def test_cannot_share_a_trip_with_no_stops(auth_client: AsyncClient):
    """An empty itinerary is not worth publishing."""
    resp = await auth_client.post(
        "/trips",
        json={
            "title": "Empty plan",
            "start_date": START.isoformat(),
            "end_date": END.isoformat(),
            "budget": "1000.00",
        },
    )
    trip_id = resp.json()["data"]["id"]

    assert (await auth_client.post(f"/trips/{trip_id}/share")).status_code == 422


async def test_sharing_twice_keeps_the_same_slug(auth_client: AsyncClient):
    trip_id = await build_trip(auth_client)
    first = await share(auth_client, trip_id)
    second = (await auth_client.post(f"/trips/{trip_id}/share")).json()["data"]["share_slug"]
    assert first == second


async def test_unshare_makes_the_link_dead(
    auth_client: AsyncClient, client: AsyncClient
):
    trip_id = await build_trip(auth_client)
    slug = await share(auth_client, trip_id)
    assert (await client.get(f"/public/trips/{slug}")).status_code == 200

    assert (await auth_client.delete(f"/trips/{trip_id}/share")).status_code == 200
    assert (await client.get(f"/public/trips/{slug}")).status_code == 404


async def test_another_user_cannot_share_your_trip(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    trip_id = await build_trip(auth_client)
    headers = await second_user(client, registration)
    resp = await client.post(f"/trips/{trip_id}/share", headers=headers)
    assert resp.status_code == 403


# --------------------------------------------------------------------------
# Public view
# --------------------------------------------------------------------------

async def test_public_trip_needs_no_authentication(
    auth_client: AsyncClient, client: AsyncClient
):
    """Spec section 16: 'No authentication required'."""
    trip_id = await build_trip(auth_client)
    slug = await share(auth_client, trip_id)

    resp = await client.get(f"/public/trips/{slug}")
    assert resp.status_code == 200

    data = resp.json()["data"]
    assert data["title"] == "West Coast Run"
    assert data["cities"] == ["Mumbai", "Goa"]
    assert len(data["stops"]) == 2
    assert len(data["transport"]) == 1


async def test_public_trip_hides_the_owners_contact_details(
    auth_client: AsyncClient, client: AsyncClient
):
    trip_id = await build_trip(auth_client)
    slug = await share(auth_client, trip_id)

    owner = (await client.get(f"/public/trips/{slug}")).json()["data"]["owner"]
    assert owner["first_name"] == "Rahul"
    assert "email" not in owner
    assert "phone" not in owner


async def test_public_trip_hides_expenses(
    auth_client: AsyncClient, client: AsyncClient
):
    """Actual spending stays private even on a published trip."""
    trip_id = await build_trip(auth_client)
    await auth_client.post(
        f"/trips/{trip_id}/expenses",
        json={"category": "meals", "title": "Private dinner",
              "amount": "2400.00", "date": d(1)},
    )
    slug = await share(auth_client, trip_id)

    body = (await client.get(f"/public/trips/{slug}")).text
    assert "Private dinner" not in body


async def test_a_private_trip_is_not_publicly_reachable(
    auth_client: AsyncClient, client: AsyncClient
):
    await build_trip(auth_client)
    assert (await client.get("/public/trips/not-a-real-slug")).status_code == 404


async def test_public_trip_totals_the_estimate(
    auth_client: AsyncClient, client: AsyncClient
):
    trip_id = await build_trip(auth_client)
    slug = await share(auth_client, trip_id)

    data = (await client.get(f"/public/trips/{slug}")).json()["data"]
    # 800 + 700 activities, 5000 stay, 850 transport.
    assert data["estimated_cost"] == "7350.00"


async def test_viewer_flags(auth_client: AsyncClient, client: AsyncClient, registration):
    trip_id = await build_trip(auth_client)
    slug = await share(auth_client, trip_id)

    anon = (await client.get(f"/public/trips/{slug}")).json()["data"]["viewer"]
    assert anon["is_authenticated"] is False
    assert anon["can_clone"] is False

    owner = (await auth_client.get(f"/public/trips/{slug}")).json()["data"]["viewer"]
    assert owner["is_owner"] is True
    assert owner["can_clone"] is False

    headers = await second_user(client, registration)
    other = (
        await client.get(f"/public/trips/{slug}", headers=headers)
    ).json()["data"]["viewer"]
    assert other["can_clone"] is True


# --------------------------------------------------------------------------
# Community feed
# --------------------------------------------------------------------------

async def test_community_lists_only_public_trips(
    auth_client: AsyncClient, client: AsyncClient
):
    shared = await build_trip(auth_client, title="Shared Trip")
    await build_trip(auth_client, title="Private Trip")
    await share(auth_client, shared)

    resp = await client.get("/community/trips")
    titles = [t["title"] for t in resp.json()["data"]["items"]]
    assert titles == ["Shared Trip"]


async def test_community_search(auth_client: AsyncClient, client: AsyncClient):
    a = await build_trip(auth_client, title="Kerala Backwaters")
    b = await build_trip(auth_client, title="Rajasthan Forts")
    await share(auth_client, a)
    await share(auth_client, b)

    resp = await client.get("/community/trips?q=kerala")
    titles = [t["title"] for t in resp.json()["data"]["items"]]
    assert titles == ["Kerala Backwaters"]


async def test_community_entries_carry_cities_and_owner(
    auth_client: AsyncClient, client: AsyncClient
):
    trip_id = await build_trip(auth_client)
    await share(auth_client, trip_id)

    item = (await client.get("/community/trips")).json()["data"]["items"][0]
    assert item["cities"] == ["Mumbai", "Goa"]
    assert item["owner"]["first_name"] == "Rahul"
    assert item["stop_count"] == 2


# --------------------------------------------------------------------------
# Cloning (spec section 35)
# --------------------------------------------------------------------------

async def test_clone_copies_the_whole_itinerary(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    trip_id = await build_trip(auth_client)
    slug = await share(auth_client, trip_id)
    headers = await second_user(client, registration)

    resp = await client.post(
        f"/public/trips/{slug}/clone", json={}, headers=headers
    )
    assert resp.status_code == 201, resp.text

    clone = resp.json()["data"]
    assert clone["title"] == "West Coast Run (copy)"
    assert clone["cities"] == ["Mumbai", "Goa"]
    assert clone["stop_count"] == 2
    assert clone["activity_count"] == 2


async def test_clone_is_private_and_unshared(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    trip_id = await build_trip(auth_client)
    slug = await share(auth_client, trip_id)
    headers = await second_user(client, registration)

    clone = (
        await client.post(f"/public/trips/{slug}/clone", json={}, headers=headers)
    ).json()["data"]

    assert clone["is_public"] is False
    assert clone["share_slug"] is None
    assert clone["cloned_from_trip_id"] == trip_id


async def test_clone_is_independent_of_the_original(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    """Spec section 16: 'The cloned trip must become an independent copy'."""
    trip_id = await build_trip(auth_client)
    slug = await share(auth_client, trip_id)
    headers = await second_user(client, registration)

    clone_id = (
        await client.post(f"/public/trips/{slug}/clone", json={}, headers=headers)
    ).json()["data"]["id"]

    # Edit the clone.
    await client.put(
        f"/trips/{clone_id}", json={"title": "My Own Version"}, headers=headers
    )
    clone_stops = (
        await client.get(f"/trips/{clone_id}/stops", headers=headers)
    ).json()["data"]["items"]
    await client.delete(f"/stops/{clone_stops[0]['id']}", headers=headers)

    # The original must be untouched.
    original = (await auth_client.get(f"/trips/{trip_id}")).json()["data"]
    assert original["title"] == "West Coast Run"
    assert original["stop_count"] == 2


async def test_clone_rebases_dates(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    trip_id = await build_trip(auth_client)
    slug = await share(auth_client, trip_id)
    headers = await second_user(client, registration)

    new_start = TODAY + timedelta(days=100)
    clone = (
        await client.post(
            f"/public/trips/{slug}/clone",
            json={"start_date": new_start.isoformat(), "title": "Rebased"},
            headers=headers,
        )
    ).json()["data"]

    assert clone["start_date"] == new_start.isoformat()
    # The original spanned 7 days; spacing must be preserved.
    assert clone["duration_days"] == 7

    stops = (
        await client.get(f"/trips/{clone['id']}/stops", headers=headers)
    ).json()["data"]["items"]
    assert stops[0]["arrival_date"] == new_start.isoformat()


async def test_clone_remaps_transport_onto_the_new_stops(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    """Pointing at the original's stops would couple the two trips."""
    trip_id = await build_trip(auth_client)
    slug = await share(auth_client, trip_id)
    headers = await second_user(client, registration)

    clone_id = (
        await client.post(f"/public/trips/{slug}/clone", json={}, headers=headers)
    ).json()["data"]["id"]

    clone_stop_ids = {
        s["id"]
        for s in (
            await client.get(f"/trips/{clone_id}/stops", headers=headers)
        ).json()["data"]["items"]
    }
    legs = (
        await client.get(f"/trips/{clone_id}/transport", headers=headers)
    ).json()["data"]["items"]

    assert len(legs) == 1
    assert legs[0]["origin_stop_id"] in clone_stop_ids
    assert legs[0]["destination_stop_id"] in clone_stop_ids


async def test_clone_does_not_copy_expenses(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    """Expenses are the original traveller's actual spend, not the plan."""
    trip_id = await build_trip(auth_client)
    await auth_client.post(
        f"/trips/{trip_id}/expenses",
        json={"category": "meals", "title": "Their dinner",
              "amount": "2400.00", "date": d(1)},
    )
    slug = await share(auth_client, trip_id)
    headers = await second_user(client, registration)

    clone_id = (
        await client.post(f"/public/trips/{slug}/clone", json={}, headers=headers)
    ).json()["data"]["id"]

    expenses = (
        await client.get(f"/trips/{clone_id}/expenses", headers=headers)
    ).json()["data"]
    assert expenses["pagination"]["total"] == 0


async def test_cloning_requires_authentication(
    auth_client: AsyncClient, client: AsyncClient
):
    trip_id = await build_trip(auth_client)
    slug = await share(auth_client, trip_id)
    assert (
        await client.post(f"/public/trips/{slug}/clone", json={})
    ).status_code == 401


async def test_cannot_clone_your_own_trip(auth_client: AsyncClient):
    trip_id = await build_trip(auth_client)
    slug = await share(auth_client, trip_id)
    resp = await auth_client.post(f"/public/trips/{slug}/clone", json={})
    assert resp.status_code == 422


async def test_cloning_an_unknown_slug_is_404(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    headers = await second_user(client, registration)
    resp = await client.post(
        "/public/trips/does-not-exist/clone", json={}, headers=headers
    )
    assert resp.status_code == 404
