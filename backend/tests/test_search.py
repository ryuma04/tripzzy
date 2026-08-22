"""Destination and activity search (spec sections 6, 12).

These endpoints are the proof that the app runs on dynamic database-backed
data rather than static JSON (spec sections 2.1 and 38).
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActivityCatalog, Destination
from app.models.enums import ActivityCategory


@pytest_asyncio.fixture
async def catalog(db: AsyncSession) -> dict[str, Destination]:
    """A small, deterministic catalog to search against."""
    rows = [
        Destination(name="Goa", country="India", region="Western India",
                    cost_index=3, popularity_score=98),
        Destination(name="Mumbai", country="India", region="Western India",
                    cost_index=4, popularity_score=95),
        Destination(name="Munnar", country="India", region="Southern India",
                    cost_index=2, popularity_score=73),
        Destination(name="Bangkok", country="Thailand", region="South East Asia",
                    cost_index=3, popularity_score=96),
    ]
    for r in rows:
        db.add(r)
    await db.commit()
    for r in rows:
        await db.refresh(r)

    by_name = {r.name: r for r in rows}

    activities = [
        ActivityCatalog(destination_id=by_name["Goa"].id, title="Scuba diving",
                        category=ActivityCategory.ADVENTURE,
                        estimated_cost=3500, duration_minutes=300, rating=4.4),
        ActivityCatalog(destination_id=by_name["Goa"].id, title="Sunset cruise",
                        category=ActivityCategory.RELAXATION,
                        estimated_cost=900, duration_minutes=90, rating=4.2),
        ActivityCatalog(destination_id=by_name["Goa"].id, title="Spice plantation tour",
                        category=ActivityCategory.FOOD,
                        estimated_cost=1100, duration_minutes=240, rating=4.3),
        ActivityCatalog(destination_id=by_name["Mumbai"].id,
                        title="Gateway of India walk",
                        category=ActivityCategory.SIGHTSEEING,
                        estimated_cost=0, duration_minutes=120, rating=4.4),
        ActivityCatalog(destination_id=by_name["Bangkok"].id,
                        title="Floating market", category=ActivityCategory.SIGHTSEEING,
                        estimated_cost=2200, duration_minutes=300, rating=4.3),
        ActivityCatalog(destination_id=by_name["Goa"].id, title="Retired activity",
                        category=ActivityCategory.OTHER, estimated_cost=100,
                        is_active=False),
    ]
    for a in activities:
        db.add(a)
    await db.commit()
    return by_name


# --------------------------------------------------------------------------
# Destination search
# --------------------------------------------------------------------------

async def test_destination_search_is_public(client: AsyncClient, catalog):
    """The landing page shows destinations before anyone signs in."""
    resp = await client.get("/destinations/search")
    assert resp.status_code == 200
    assert resp.json()["data"]["pagination"]["total"] == 4


async def test_destination_search_by_name(client: AsyncClient, catalog):
    resp = await client.get("/destinations/search?q=goa")
    names = [d["name"] for d in resp.json()["data"]["items"]]
    assert names == ["Goa"]


async def test_destination_search_is_case_insensitive(client: AsyncClient, catalog):
    resp = await client.get("/destinations/search?q=MUMBAI")
    assert [d["name"] for d in resp.json()["data"]["items"]] == ["Mumbai"]


async def test_destination_search_matches_partial_words(
    client: AsyncClient, catalog
):
    resp = await client.get("/destinations/search?q=mun")
    assert [d["name"] for d in resp.json()["data"]["items"]] == ["Munnar"]


async def test_destination_filter_by_country(client: AsyncClient, catalog):
    resp = await client.get("/destinations/search?country=Thailand")
    assert [d["name"] for d in resp.json()["data"]["items"]] == ["Bangkok"]


async def test_destination_filter_by_region(client: AsyncClient, catalog):
    resp = await client.get("/destinations/search?region=Western India")
    names = {d["name"] for d in resp.json()["data"]["items"]}
    assert names == {"Goa", "Mumbai"}


async def test_destination_default_sort_is_by_popularity(
    client: AsyncClient, catalog
):
    resp = await client.get("/destinations/search")
    scores = [d["popularity_score"] for d in resp.json()["data"]["items"]]
    assert scores == sorted(scores, reverse=True)


async def test_destination_search_includes_activity_counts(
    client: AsyncClient, catalog
):
    """Inactive catalog entries must not be counted."""
    resp = await client.get("/destinations/search?q=goa")
    assert resp.json()["data"]["items"][0]["activity_count"] == 3


async def test_like_wildcards_are_escaped(client: AsyncClient, catalog):
    """A literal '%' must not match everything."""
    resp = await client.get("/destinations/search?q=%25")
    assert resp.json()["data"]["items"] == []


async def test_destination_detail(client: AsyncClient, catalog):
    dest_id = catalog["Goa"].id
    resp = await client.get(f"/destinations/{dest_id}")
    assert resp.status_code == 200

    data = resp.json()["data"]
    assert data["name"] == "Goa"
    assert data["activity_count"] == 3
    assert len(data["top_activities"]) == 3


async def test_unknown_destination_is_404(client: AsyncClient):
    resp = await client.get("/destinations/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


async def test_regions_listing(client: AsyncClient, catalog):
    resp = await client.get("/destinations/regions")
    regions = {r["region"]: r["destination_count"] for r in resp.json()["data"]["regions"]}
    assert regions["Western India"] == 2
    assert regions["Southern India"] == 1


async def test_destination_activities_endpoint(client: AsyncClient, catalog):
    """Spec section 7: dynamic suggestions for the trip-creation screen."""
    resp = await client.get(f"/destinations/{catalog['Goa'].id}/activities")
    assert resp.status_code == 200
    titles = {a["title"] for a in resp.json()["data"]["items"]}
    assert "Scuba diving" in titles
    assert "Retired activity" not in titles


# --------------------------------------------------------------------------
# Activity search
# --------------------------------------------------------------------------

async def test_activity_search_excludes_inactive(client: AsyncClient, catalog):
    resp = await client.get("/activities/search")
    titles = {a["title"] for a in resp.json()["data"]["items"]}
    assert "Retired activity" not in titles
    assert resp.json()["data"]["pagination"]["total"] == 5


async def test_activity_filter_by_city(client: AsyncClient, catalog):
    """Spec section 12's worked example: ?city=goa&category=adventure."""
    resp = await client.get("/activities/search?city=goa&category=adventure")
    titles = [a["title"] for a in resp.json()["data"]["items"]]
    assert titles == ["Scuba diving"]


async def test_activity_filter_by_cost_range(client: AsyncClient, catalog):
    resp = await client.get("/activities/search?min_cost=0&max_cost=1200")
    titles = {a["title"] for a in resp.json()["data"]["items"]}
    assert titles == {"Sunset cruise", "Spice plantation tour", "Gateway of India walk"}


async def test_min_cost_above_max_cost_is_rejected(client: AsyncClient, catalog):
    """Returning nothing silently would hide the user's mistake."""
    resp = await client.get("/activities/search?min_cost=5000&max_cost=100")
    assert resp.status_code == 422


@pytest.mark.parametrize(
    "bad",
    ["min_cost=-1", "max_cost=-5", "min_rating=6", "max_duration_minutes=0",
     "category=teleportation"],
)
async def test_invalid_activity_filters_are_rejected(
    client: AsyncClient, catalog, bad
):
    assert (await client.get(f"/activities/search?{bad}")).status_code == 422


async def test_activity_filter_by_duration(client: AsyncClient, catalog):
    resp = await client.get("/activities/search?max_duration_minutes=120")
    titles = {a["title"] for a in resp.json()["data"]["items"]}
    assert titles == {"Sunset cruise", "Gateway of India walk"}


async def test_activity_search_by_text(client: AsyncClient, catalog):
    resp = await client.get("/activities/search?q=cruise")
    assert [a["title"] for a in resp.json()["data"]["items"]] == ["Sunset cruise"]


async def test_activity_includes_its_destination(client: AsyncClient, catalog):
    resp = await client.get("/activities/search?q=scuba")
    item = resp.json()["data"]["items"][0]
    assert item["destination_name"] == "Goa"
    assert item["country"] == "India"


async def test_activity_sort_by_cost_ascending(client: AsyncClient, catalog):
    resp = await client.get("/activities/search?sort_by=cost&sort_order=asc")
    costs = [float(a["estimated_cost"]) for a in resp.json()["data"]["items"]]
    assert costs == sorted(costs)


async def test_activity_sort_by_is_restricted(client: AsyncClient, catalog):
    assert (
        await client.get("/activities/search?sort_by=id")
    ).status_code == 422


async def test_activity_detail(client: AsyncClient, catalog, db: AsyncSession):
    from sqlalchemy import select

    activity = await db.scalar(
        select(ActivityCatalog).where(ActivityCatalog.title == "Scuba diving")
    )
    resp = await client.get(f"/activities/{activity.id}")
    assert resp.status_code == 200
    assert resp.json()["data"]["title"] == "Scuba diving"


async def test_search_pagination(client: AsyncClient, catalog):
    resp = await client.get("/activities/search?page=1&limit=2")
    body = resp.json()["data"]
    assert len(body["items"]) == 2
    assert body["pagination"]["total"] == 5
    assert body["pagination"]["total_pages"] == 3


async def test_money_is_serialised_as_a_string(client: AsyncClient, catalog):
    """Currency must never round-trip as a float."""
    resp = await client.get("/activities/search?q=scuba")
    assert resp.json()["data"]["items"][0]["estimated_cost"] == "3500.00"
