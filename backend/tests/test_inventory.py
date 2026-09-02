"""Ranked alternatives for a trip component.

Covers the engine behind both "show me other options" and "this fell through,
now what": the same query, asked before and after something goes wrong.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Operator, ServiceAvailability, Vendor, VendorService
from app.models.enums import ComfortTier, ServiceType

TODAY = date.today()
STAY_DATE = TODAY + timedelta(days=30)


@pytest_asyncio.fixture
async def catalogue(db: AsyncSession) -> dict:
    """One city, four graded stays, with capacity published for one date."""
    operator = Operator(name="Test Journeys", slug="test-journeys")
    db.add(operator)
    await db.flush()

    vendor = Vendor(
        operator_id=operator.id,
        name="Goa Stays",
        category=ServiceType.ACCOMMODATION,
        city="Goa",
        country="India",
        rating=Decimal("4.4"),
        reliability_score=90,
    )
    db.add(vendor)
    await db.flush()

    specs = [
        (ComfortTier.BUDGET, "Hostel Bunk", "800.00", Decimal("3.5"), ["stay"], 0, 100),
        (ComfortTier.STANDARD, "Comfort Room", "2400.00", Decimal("4.2"),
         ["stay", "breakfast"], 3, 50),
        (ComfortTier.PREMIUM, "Boutique Suite", "5200.00", Decimal("4.7"),
         ["stay", "street food"], 7, 25),
        (ComfortTier.LUXURY, "Signature Villa", "9800.00", Decimal("4.9"),
         ["stay", "spa"], 14, 0),
    ]
    services = {}
    for tier, name, price, rating, tags, free_days, penalty in specs:
        svc = VendorService(
            vendor_id=vendor.id,
            service_type=ServiceType.ACCOMMODATION,
            name=name,
            comfort_tier=tier,
            unit_price=Decimal(price),
            unit_label="night",
            city="Goa",
            rating=rating,
            tags=tags,
            free_cancellation_days=free_days,
            cancellation_penalty_pct=penalty,
        )
        db.add(svc)
        services[tier] = svc
    await db.flush()

    # Only the luxury villa has published capacity, and only two rooms.
    db.add(
        ServiceAvailability(
            service_id=services[ComfortTier.LUXURY].id,
            on_date=STAY_DATE,
            capacity_total=2,
            capacity_booked=0,
        )
    )
    await db.commit()
    return {"vendor": vendor, "services": services}


async def get_alternatives(client: AsyncClient, **params) -> list[dict]:
    query = "&".join(f"{k}={v}" for k, v in params.items())
    resp = await client.get(f"/components/alternatives?{query}")
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["items"]


# --------------------------------------------------------------------------
# Basics
# --------------------------------------------------------------------------

async def test_returns_every_option_for_the_city(
    auth_client: AsyncClient, catalogue
):
    items = await get_alternatives(
        auth_client, service_type="accommodation", city="Goa"
    )
    assert len(items) == 4
    assert {i["comfort_tier"] for i in items} == {
        "budget", "standard", "premium", "luxury"
    }


async def test_alternatives_require_authentication(client: AsyncClient):
    resp = await client.get("/components/alternatives?service_type=accommodation")
    assert resp.status_code == 401


async def test_a_different_city_returns_nothing(
    auth_client: AsyncClient, catalogue
):
    items = await get_alternatives(
        auth_client, service_type="accommodation", city="Jaipur"
    )
    assert items == []


async def test_service_type_filters_the_pool(auth_client: AsyncClient, catalogue):
    assert await get_alternatives(auth_client, service_type="guide", city="Goa") == []


async def test_the_current_option_is_excluded(auth_client: AsyncClient, catalogue):
    """A replacement must never suggest the thing that just fell through."""
    excluded = catalogue["services"][ComfortTier.PREMIUM]
    items = await get_alternatives(
        auth_client,
        service_type="accommodation",
        city="Goa",
        exclude_service_id=excluded.id,
    )
    assert excluded.name not in {i["name"] for i in items}
    assert len(items) == 3


# --------------------------------------------------------------------------
# Pricing
# --------------------------------------------------------------------------

async def test_total_multiplies_by_nights_and_party_size(
    auth_client: AsyncClient, catalogue
):
    items = await get_alternatives(
        auth_client, service_type="accommodation", city="Goa",
        quantity=2, nights=3,
    )
    hostel = next(i for i in items if i["name"] == "Hostel Bunk")
    # 800 a night, two rooms, three nights.
    assert Decimal(hostel["total_price"]) == Decimal("4800.00")
    assert Decimal(hostel["unit_price"]) == Decimal("800.00")


async def test_max_unit_price_filters_out_dearer_options(
    auth_client: AsyncClient, catalogue
):
    items = await get_alternatives(
        auth_client, service_type="accommodation", city="Goa",
        max_unit_price="3000",
    )
    assert {i["name"] for i in items} == {"Hostel Bunk", "Comfort Room"}


async def test_money_is_a_string_never_a_float(auth_client: AsyncClient, catalogue):
    items = await get_alternatives(
        auth_client, service_type="accommodation", city="Goa"
    )
    assert all(isinstance(i["unit_price"], str) for i in items)
    assert all(isinstance(i["total_price"], str) for i in items)


# --------------------------------------------------------------------------
# Availability
# --------------------------------------------------------------------------

async def test_a_party_larger_than_capacity_drops_the_option(
    auth_client: AsyncClient, catalogue
):
    """The villa publishes two rooms; a party of three cannot use it."""
    items = await get_alternatives(
        auth_client, service_type="accommodation", city="Goa",
        on_date=STAY_DATE.isoformat(), quantity=3,
    )
    assert "Signature Villa" not in {i["name"] for i in items}
    # The others publish no limit, so they stay.
    assert len(items) == 3


async def test_capacity_is_reported_and_scarcity_flagged(
    auth_client: AsyncClient, catalogue
):
    items = await get_alternatives(
        auth_client, service_type="accommodation", city="Goa",
        on_date=STAY_DATE.isoformat(), quantity=1,
    )
    villa = next(i for i in items if i["name"] == "Signature Villa")
    assert villa["seats_left"] == 2
    assert any("Only 2 left" in n for n in villa["notes"])

    # No published limit is not scarcity -- it must not read as sold out.
    hostel = next(i for i in items if i["name"] == "Hostel Bunk")
    assert hostel["seats_left"] is None


async def test_a_blocked_date_removes_the_option(
    auth_client: AsyncClient, catalogue, db: AsyncSession
):
    villa = catalogue["services"][ComfortTier.LUXURY]
    row = await db.scalar(
        ServiceAvailability.__table__.select().where(
            ServiceAvailability.service_id == villa.id
        )
    )
    await db.execute(
        ServiceAvailability.__table__.update()
        .where(ServiceAvailability.service_id == villa.id)
        .values(is_blocked=True)
    )
    await db.commit()

    items = await get_alternatives(
        auth_client, service_type="accommodation", city="Goa",
        on_date=STAY_DATE.isoformat(),
    )
    assert "Signature Villa" not in {i["name"] for i in items}


async def test_a_price_override_beats_the_list_price(
    auth_client: AsyncClient, catalogue, db: AsyncSession
):
    """Seasonal pricing is what makes moving a trip's dates cost something."""
    villa = catalogue["services"][ComfortTier.LUXURY]
    await db.execute(
        ServiceAvailability.__table__.update()
        .where(ServiceAvailability.service_id == villa.id)
        .values(price_override=Decimal("12000.00"))
    )
    await db.commit()

    items = await get_alternatives(
        auth_client, service_type="accommodation", city="Goa",
        on_date=STAY_DATE.isoformat(),
    )
    found = next(i for i in items if i["name"] == "Signature Villa")
    assert Decimal(found["unit_price"]) == Decimal("12000.00")
    assert any("Seasonal price" in n for n in found["notes"])


# --------------------------------------------------------------------------
# Ranking
# --------------------------------------------------------------------------

async def test_every_option_explains_its_own_score(
    auth_client: AsyncClient, catalogue
):
    items = await get_alternatives(
        auth_client, service_type="accommodation", city="Goa"
    )
    for item in items:
        assert 0 <= item["match_score"] <= 100
        assert set(item["match_reasons"]) == {
            "price", "comfort", "rating", "interests", "reliability"
        }


async def test_results_are_ordered_by_score(auth_client: AsyncClient, catalogue):
    items = await get_alternatives(
        auth_client, service_type="accommodation", city="Goa"
    )
    scores = [i["match_score"] for i in items]
    assert scores == sorted(scores, reverse=True)


async def test_stated_comfort_tier_lifts_the_matching_option(
    auth_client: AsyncClient, catalogue
):
    """Preference has to actually move the ranking, or it is decoration."""
    before = await get_alternatives(
        auth_client, service_type="accommodation", city="Goa"
    )
    luxury_before = next(i for i in before if i["comfort_tier"] == "luxury")

    resp = await auth_client.put(
        "/users/me/preferences", json={"accommodation_class": "luxury"}
    )
    assert resp.status_code == 200, resp.text

    after = await get_alternatives(
        auth_client, service_type="accommodation", city="Goa"
    )
    luxury_after = next(i for i in after if i["comfort_tier"] == "luxury")

    assert luxury_after["match_reasons"]["comfort"] > luxury_before["match_reasons"]["comfort"]
    assert luxury_after["match_score"] > luxury_before["match_score"]


@pytest.mark.parametrize("tier", ["budget", "standard", "premium", "luxury"])
async def test_a_stated_tier_is_ranked_first(
    auth_client: AsyncClient, catalogue, tier
):
    """Asking for luxury and being handed the hostel is the wrong answer.

    Price-led weighting ranks the most expensive option last by construction,
    so a single fixed weight set puts the *opposite* of a stated preference on
    top. Once a tier is stated it has to lead the ranking.
    """
    resp = await auth_client.put(
        "/users/me/preferences", json={"accommodation_class": tier}
    )
    assert resp.status_code == 200, resp.text

    items = await get_alternatives(
        auth_client, service_type="accommodation", city="Goa"
    )
    assert items[0]["comfort_tier"] == tier


async def test_with_no_stated_tier_the_cheapest_leads(
    auth_client: AsyncClient, catalogue
):
    """The complement: with nothing stated, price is the strongest signal."""
    items = await get_alternatives(
        auth_client, service_type="accommodation", city="Goa"
    )
    assert items[0]["comfort_tier"] == "budget"


async def test_interests_matching_a_service_tag_are_called_out(
    auth_client: AsyncClient, catalogue
):
    await auth_client.put(
        "/users/me/preferences", json={"interests": ["Street Food"]}
    )
    items = await get_alternatives(
        auth_client, service_type="accommodation", city="Goa"
    )
    suite = next(i for i in items if i["name"] == "Boutique Suite")
    assert suite["match_reasons"]["interests"] == 100
    assert any("street food" in n.lower() for n in suite["notes"])


async def test_cancellation_terms_are_surfaced(auth_client: AsyncClient, catalogue):
    items = await get_alternatives(
        auth_client, service_type="accommodation", city="Goa"
    )
    hostel = next(i for i in items if i["name"] == "Hostel Bunk")
    villa = next(i for i in items if i["name"] == "Signature Villa")
    assert any("Non-refundable" in n for n in hostel["notes"])
    assert any("Free cancellation" in n for n in villa["notes"])


# --------------------------------------------------------------------------
# Preferences round-trip
# --------------------------------------------------------------------------

async def test_personalisation_fields_persist(auth_client: AsyncClient):
    payload = {
        "travel_style": "family",
        "pace": "relaxed",
        "accommodation_class": "premium",
        "transport_class": "standard",
        "preferred_transport_modes": ["train", "car"],
        "interests": ["Street Food", "street food", " Trekking "],
        "dietary_requirements": ["Vegetarian"],
        "mobility_needs": "Step-free access",
        "daily_budget_cap": "4500.00",
    }
    resp = await auth_client.put("/users/me/preferences", json=payload)
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]

    assert data["travel_style"] == "family"
    assert data["pace"] == "relaxed"
    assert data["preferred_transport_modes"] == ["train", "car"]
    # Folded and de-duplicated, so one stated interest is not split in two.
    assert data["interests"] == ["street food", "trekking"]
    assert data["daily_budget_cap"] == "4500.00"

    again = await auth_client.get("/users/me/preferences")
    assert again.json()["data"]["mobility_needs"] == "Step-free access"


async def test_omitted_preference_fields_are_left_alone(auth_client: AsyncClient):
    await auth_client.put("/users/me/preferences", json={"travel_style": "solo"})
    await auth_client.put("/users/me/preferences", json={"pace": "packed"})

    data = (await auth_client.get("/users/me/preferences")).json()["data"]
    assert data["travel_style"] == "solo"
    assert data["pace"] == "packed"


async def test_an_invalid_travel_style_is_rejected(auth_client: AsyncClient):
    resp = await auth_client.put(
        "/users/me/preferences", json={"travel_style": "teleportation"}
    )
    assert resp.status_code == 422
