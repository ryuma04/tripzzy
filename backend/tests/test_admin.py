"""Admin panel and analytics (spec sections 18, 36).

The central rule under test: every admin route requires authentication *and*
``role == admin``, and a normal user must never reach one.
"""

from datetime import date, timedelta

import pytest
from httpx import AsyncClient

TODAY = date.today()
START = TODAY + timedelta(days=30)
END = TODAY + timedelta(days=36)


async def make_trip(client: AsyncClient, title="Test Trip") -> str:
    resp = await client.post(
        "/trips",
        json={
            "title": title,
            "start_date": START.isoformat(),
            "end_date": END.isoformat(),
            "budget": "40000.00",
            "traveller_count": 2,
        },
    )
    return resp.json()["data"]["id"]


ADMIN_ROUTES = [
    "/admin/dashboard",
    "/admin/users",
    "/admin/trips",
    "/admin/analytics/trips",
    "/admin/analytics/destinations",
    "/admin/analytics/activities",
]


# --------------------------------------------------------------------------
# Access control (spec section 18)
# --------------------------------------------------------------------------

@pytest.mark.parametrize("route", ADMIN_ROUTES)
async def test_admin_routes_reject_anonymous_callers(
    client: AsyncClient, route
):
    assert (await client.get(route)).status_code == 401


@pytest.mark.parametrize("route", ADMIN_ROUTES)
async def test_admin_routes_reject_normal_users(
    auth_client: AsyncClient, route
):
    """Authenticated is not sufficient -- the role is checked too."""
    resp = await auth_client.get(route)
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "FORBIDDEN"


@pytest.mark.parametrize("route", ADMIN_ROUTES)
async def test_admin_routes_allow_admins(admin_client: AsyncClient, route):
    assert (await admin_client.get(route)).status_code == 200


async def test_a_user_cannot_register_as_an_admin(client: AsyncClient, registration):
    """Role is server-assigned; the payload cannot escalate it."""
    resp = await client.post(
        "/auth/register", json={**registration, "role": "admin"}
    )
    token = resp.json()["data"]["access_token"]

    check = await client.get(
        "/admin/dashboard", headers={"Authorization": f"Bearer {token}"}
    )
    assert check.status_code == 403


# --------------------------------------------------------------------------
# Dashboard
# --------------------------------------------------------------------------

async def test_dashboard_counts(
    admin_client: AsyncClient, auth_client: AsyncClient
):
    await make_trip(auth_client, "Trip A")
    await make_trip(auth_client, "Trip B")

    body = (await admin_client.get("/admin/dashboard")).json()["data"]

    assert body["users"]["total"] >= 2
    assert body["trips"]["total"] == 2
    assert set(body["trips"]["by_status"]) == {
        "draft", "upcoming", "ongoing", "completed"
    }
    # Both trips have no stops, so both are drafts (refinement R3).
    assert body["trips"]["by_status"]["draft"] == 2
    assert "average_trip_budget" in body["money"]


async def test_dashboard_excludes_soft_deleted_trips(
    admin_client: AsyncClient, auth_client: AsyncClient
):
    trip_id = await make_trip(auth_client)
    await make_trip(auth_client, "Kept")
    await auth_client.delete(f"/trips/{trip_id}")

    body = (await admin_client.get("/admin/dashboard")).json()["data"]
    assert body["trips"]["total"] == 1


# --------------------------------------------------------------------------
# Users
# --------------------------------------------------------------------------

async def test_list_users_is_paginated(admin_client: AsyncClient, auth_client):
    body = (await admin_client.get("/admin/users?page=1&limit=1")).json()["data"]
    assert len(body["items"]) == 1
    assert body["pagination"]["total"] >= 2


async def test_list_users_never_exposes_password_hashes(
    admin_client: AsyncClient, auth_client
):
    body = (await admin_client.get("/admin/users")).json()["data"]
    for user in body["items"]:
        assert "hashed_password" not in user
        assert "password" not in user


async def test_filter_users_by_role(admin_client: AsyncClient, auth_client):
    body = (await admin_client.get("/admin/users?role=admin")).json()["data"]
    assert all(u["role"] == "admin" for u in body["items"])
    assert body["pagination"]["total"] == 1


async def test_search_users(admin_client: AsyncClient, auth_client):
    body = (await admin_client.get("/admin/users?q=rahul")).json()["data"]
    assert [u["email"] for u in body["items"]] == ["rahul@example.com"]


async def test_user_detail_includes_trip_counts(
    admin_client: AsyncClient, auth_client: AsyncClient, user_token
):
    await make_trip(auth_client)
    _, user = user_token

    body = (await admin_client.get(f"/admin/users/{user['id']}")).json()["data"]
    assert body["email"] == "rahul@example.com"
    assert body["trip_count"] == 1


async def test_unknown_user_is_404(admin_client: AsyncClient):
    resp = await admin_client.get(
        "/admin/users/00000000-0000-0000-0000-000000000000"
    )
    assert resp.status_code == 404


async def test_suspend_a_user(
    admin_client: AsyncClient, client: AsyncClient, user_token, registration
):
    _, user = user_token

    resp = await admin_client.put(
        f"/admin/users/{user['id']}/status", json={"status": "suspended"}
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "suspended"

    # A suspended user can no longer sign in.
    login = await client.post(
        "/auth/login",
        json={
            "email": registration["email"],
            "password": registration["password"],
        },
    )
    assert login.status_code == 403


async def test_a_suspended_users_existing_token_stops_working(
    admin_client: AsyncClient, auth_client: AsyncClient, user_token
):
    """Suspension must take effect immediately, not at next login."""
    assert (await auth_client.get("/trips")).status_code == 200

    _, user = user_token
    await admin_client.put(
        f"/admin/users/{user['id']}/status", json={"status": "suspended"}
    )

    assert (await auth_client.get("/trips")).status_code == 403


async def test_reactivating_a_user_restores_access(
    admin_client: AsyncClient, auth_client: AsyncClient, user_token
):
    _, user = user_token
    await admin_client.put(
        f"/admin/users/{user['id']}/status", json={"status": "suspended"}
    )
    await admin_client.put(
        f"/admin/users/{user['id']}/status", json={"status": "active"}
    )
    assert (await auth_client.get("/trips")).status_code == 200


async def test_an_admin_cannot_suspend_themselves(
    admin_client: AsyncClient, db
):
    """Otherwise recovering would need direct database access."""
    from sqlalchemy import select

    from app.models import User

    admin = await db.scalar(
        select(User).where(User.email == "admin@example.com")
    )
    resp = await admin_client.put(
        f"/admin/users/{admin.id}/status", json={"status": "suspended"}
    )
    assert resp.status_code == 422


async def test_invalid_status_value_is_rejected(
    admin_client: AsyncClient, user_token
):
    _, user = user_token
    resp = await admin_client.put(
        f"/admin/users/{user['id']}/status", json={"status": "banished"}
    )
    assert resp.status_code == 422


# --------------------------------------------------------------------------
# Trips
# --------------------------------------------------------------------------

async def test_admin_sees_every_users_trips(
    admin_client: AsyncClient, auth_client: AsyncClient
):
    await make_trip(auth_client, "Someone else's trip")

    body = (await admin_client.get("/admin/trips")).json()["data"]
    assert body["pagination"]["total"] == 1

    item = body["items"][0]
    assert item["title"] == "Someone else's trip"
    assert item["owner_email"] == "rahul@example.com"


async def test_admin_trip_search(
    admin_client: AsyncClient, auth_client: AsyncClient
):
    await make_trip(auth_client, "Kerala Backwaters")
    await make_trip(auth_client, "Rajasthan Forts")

    body = (await admin_client.get("/admin/trips?q=kerala")).json()["data"]
    assert [t["title"] for t in body["items"]] == ["Kerala Backwaters"]


# --------------------------------------------------------------------------
# Analytics
# --------------------------------------------------------------------------

async def test_trip_analytics_shape(
    admin_client: AsyncClient, auth_client: AsyncClient
):
    await make_trip(auth_client)

    body = (await admin_client.get("/admin/analytics/trips")).json()["data"]
    assert len(body["trips_per_month"]) >= 1
    assert body["trips_per_month"][0]["count"] == 1
    assert len(body["budget_distribution"]) == 5
    assert body["average_duration_days"] == 7.0


async def test_budget_distribution_buckets(
    admin_client: AsyncClient, auth_client: AsyncClient
):
    for budget in ["5000.00", "30000.00", "200000.00"]:
        await auth_client.post(
            "/trips",
            json={
                "title": f"Budget {budget}",
                "start_date": START.isoformat(),
                "end_date": END.isoformat(),
                "budget": budget,
            },
        )

    body = (await admin_client.get("/admin/analytics/trips")).json()["data"]
    buckets = {b["bucket"]: b["count"] for b in body["budget_distribution"]}
    assert buckets["under_10k"] == 1
    assert buckets["25k_to_50k"] == 1
    assert buckets["over_100k"] == 1


async def test_destination_analytics_counts_real_usage(
    admin_client: AsyncClient, auth_client: AsyncClient
):
    """Based on actual trip stops, not the catalog's popularity score."""
    trip_id = await make_trip(auth_client)
    for city in ["Goa", "Goa", "Mumbai"]:
        await auth_client.post(
            f"/trips/{trip_id}/stops",
            json={
                "city_name": city,
                "arrival_date": START.isoformat(),
                "departure_date": (START + timedelta(days=1)).isoformat(),
            },
        )

    body = (
        await admin_client.get("/admin/analytics/destinations")
    ).json()["data"]
    top = body["most_visited"][0]
    assert top["city_name"] == "Goa"
    assert top["stop_count"] == 2


async def test_activity_analytics(
    admin_client: AsyncClient, auth_client: AsyncClient
):
    trip_id = await make_trip(auth_client)
    stop = await auth_client.post(
        f"/trips/{trip_id}/stops",
        json={
            "city_name": "Goa",
            "arrival_date": START.isoformat(),
            "departure_date": (START + timedelta(days=2)).isoformat(),
        },
    )
    stop_id = stop.json()["data"]["id"]

    for title, category, cost in [
        ("Scuba", "adventure", "3500.00"),
        ("Cruise", "relaxation", "900.00"),
    ]:
        await auth_client.post(
            f"/stops/{stop_id}/activities",
            json={
                "title": title,
                "activity_date": START.isoformat(),
                "category": category,
                "estimated_cost": cost,
            },
        )

    body = (await admin_client.get("/admin/analytics/activities")).json()["data"]
    categories = {c["category"]: c for c in body["by_category"]}
    assert categories["adventure"]["count"] == 1
    assert categories["adventure"]["average_cost"] == "3500.00"
    assert len(body["most_scheduled"]) == 2


@pytest.mark.parametrize("bad", ["months=0", "months=61", "limit=0", "limit=101"])
async def test_analytics_params_are_validated(admin_client: AsyncClient, bad):
    route = "/admin/analytics/trips" if "months" in bad else "/admin/analytics/destinations"
    assert (await admin_client.get(f"{route}?{bad}")).status_code == 422
