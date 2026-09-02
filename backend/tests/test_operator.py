"""The operator console.

The scoping tests matter most here. Every endpoint resolves its operator from
the caller's membership rather than a parameter, so the thing worth proving is
that one operator can never see another's customers, vendors or money.
"""

from datetime import date, timedelta
from decimal import Decimal

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
    Trip,
    User,
    Vendor,
    VendorService,
)
from app.models.enums import (
    BookingItemStatus,
    BookingStatus,
    ComfortTier,
    OperatorRole,
    ServiceType,
    UserRole,
)

TODAY = date.today()
SOON = TODAY + timedelta(days=10)


async def _make_user(db: AsyncSession, email: str, first: str) -> User:
    user = User(
        first_name=first,
        last_name="Staff",
        email=email,
        phone="+919876500001",
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
async def two_operators(db: AsyncSession) -> dict:
    """Two rival operators, each with staff, a vendor and a booking.

    The second exists purely so the scoping assertions have something real to
    fail against — a single-operator fixture would pass even if the scoping
    were missing entirely.
    """
    alpha = Operator(name="Alpha Tours", slug="alpha-tours")
    beta = Operator(name="Beta Voyages", slug="beta-voyages")
    db.add_all([alpha, beta])
    await db.flush()

    owner = await _make_user(db, "owner@alpha.test", "Owner")
    coordinator = await _make_user(db, "coord@alpha.test", "Coordinator")
    rival = await _make_user(db, "owner@beta.test", "Rival")
    traveller = await _make_user(db, "customer@alpha.test", "Customer")

    alpha_owner = OperatorMember(
        operator_id=alpha.id, user_id=owner.id, role=OperatorRole.OWNER
    )
    alpha_coord = OperatorMember(
        operator_id=alpha.id, user_id=coordinator.id, role=OperatorRole.COORDINATOR
    )
    beta_owner = OperatorMember(
        operator_id=beta.id, user_id=rival.id, role=OperatorRole.OWNER
    )
    db.add_all([alpha_owner, alpha_coord, beta_owner])

    alpha_vendor = Vendor(
        operator_id=alpha.id, name="Alpha Stays", category=ServiceType.ACCOMMODATION,
        city="Goa",
    )
    beta_vendor = Vendor(
        operator_id=beta.id, name="Beta Stays", category=ServiceType.ACCOMMODATION,
        city="Goa",
    )
    db.add_all([alpha_vendor, beta_vendor])
    await db.flush()

    service = VendorService(
        vendor_id=alpha_vendor.id,
        service_type=ServiceType.ACCOMMODATION,
        name="Alpha Room",
        comfort_tier=ComfortTier.STANDARD,
        unit_price=Decimal("2000.00"),
        city="Goa",
    )
    db.add(service)

    trip = Trip(
        user_id=traveller.id,
        title="Customer Trip",
        start_date=SOON,
        end_date=SOON + timedelta(days=3),
        budget=Decimal("20000.00"),
        traveller_count=2,
    )
    db.add(trip)
    await db.flush()

    booking = Booking(
        trip_id=trip.id,
        traveller_id=traveller.id,
        operator_id=alpha.id,
        reference="TZALPHA001",
        status=BookingStatus.CONFIRMED,
        subtotal=Decimal("6000.00"),
        total=Decimal("6000.00"),
    )
    db.add(booking)
    await db.flush()
    db.add(
        BookingItem(
            booking_id=booking.id,
            component_type=ServiceType.ACCOMMODATION,
            title="Alpha Room",
            vendor_name="Alpha Stays",
            city="Goa",
            service_date=SOON,
            quantity=1,
            units=3,
            unit_price=Decimal("2000.00"),
            total_price=Decimal("6000.00"),
            status=BookingItemStatus.CONFIRMED,
        )
    )
    await db.commit()

    return {
        "alpha": alpha,
        "beta": beta,
        "owner": owner,
        "coordinator": coordinator,
        "rival": rival,
        "traveller": traveller,
        "booking": booking,
        "alpha_vendor": alpha_vendor,
        "beta_vendor": beta_vendor,
    }


async def token_for(client: AsyncClient, email: str) -> str:
    resp = await client.post(
        "/auth/login", json={"email": email, "password": "Str0ng!Pass"}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------------
# Access
# --------------------------------------------------------------------------

async def test_the_console_requires_authentication(client: AsyncClient):
    assert (await client.get("/operator/me")).status_code == 401


async def test_a_traveller_is_refused(
    client: AsyncClient, two_operators, auth_client: AsyncClient
):
    """Access comes from a roster, not from an account type."""
    resp = await auth_client.get("/operator/me")
    assert resp.status_code == 403
    assert "not linked to an operator" in resp.json()["message"]


async def test_an_admin_is_not_automatically_operator_staff(
    admin_client: AsyncClient, two_operators
):
    """Platform admin and operator staff are different jobs."""
    assert (await admin_client.get("/operator/me")).status_code == 403


async def test_staff_see_their_own_operator(client: AsyncClient, two_operators):
    token = await token_for(client, "owner@alpha.test")
    resp = await client.get("/operator/me", headers=auth(token))
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["name"] == "Alpha Tours"
    assert data["your_role"] == "owner"


async def test_a_coordinator_gets_in_with_their_own_role(
    client: AsyncClient, two_operators
):
    token = await token_for(client, "coord@alpha.test")
    data = (await client.get("/operator/me", headers=auth(token))).json()["data"]
    assert data["your_role"] == "coordinator"


async def test_deactivating_a_membership_revokes_access(
    client: AsyncClient, two_operators, db: AsyncSession
):
    """Revocation is a row update, not an enum migration."""
    from sqlalchemy import update

    token = await token_for(client, "coord@alpha.test")
    assert (await client.get("/operator/me", headers=auth(token))).status_code == 200

    await db.execute(
        update(OperatorMember)
        .where(OperatorMember.user_id == two_operators["coordinator"].id)
        .values(is_active=False)
    )
    await db.commit()

    assert (await client.get("/operator/me", headers=auth(token))).status_code == 403


# --------------------------------------------------------------------------
# Scoping — the security boundary
# --------------------------------------------------------------------------

async def test_customers_are_scoped_to_your_operator(
    client: AsyncClient, two_operators
):
    alpha = await token_for(client, "owner@alpha.test")
    beta = await token_for(client, "owner@beta.test")

    mine = await client.get("/operator/customers", headers=auth(alpha))
    assert [c["email"] for c in mine.json()["data"]["items"]] == [
        "customer@alpha.test"
    ]

    theirs = await client.get("/operator/customers", headers=auth(beta))
    assert theirs.json()["data"]["items"] == []


async def test_bookings_are_scoped_to_your_operator(
    client: AsyncClient, two_operators
):
    alpha = await token_for(client, "owner@alpha.test")
    beta = await token_for(client, "owner@beta.test")

    assert len(
        (await client.get("/operator/bookings", headers=auth(alpha)))
        .json()["data"]["items"]
    ) == 1
    assert (
        (await client.get("/operator/bookings", headers=auth(beta)))
        .json()["data"]["items"]
    ) == []


async def test_vendors_are_scoped_to_your_operator(
    client: AsyncClient, two_operators
):
    alpha = await token_for(client, "owner@alpha.test")
    names = {
        v["name"]
        for v in (await client.get("/operator/vendors", headers=auth(alpha)))
        .json()["data"]["items"]
    }
    assert names == {"Alpha Stays"}
    assert "Beta Stays" not in names


async def test_you_cannot_read_another_operators_vendor_by_id(
    client: AsyncClient, two_operators
):
    """The one place an id *is* accepted, so the check has to be explicit."""
    alpha = await token_for(client, "owner@alpha.test")
    rival_vendor = two_operators["beta_vendor"].id
    resp = await client.get(
        f"/operator/vendors/{rival_vendor}/services", headers=auth(alpha)
    )
    assert resp.status_code == 403


async def test_money_is_scoped_to_your_operator(client: AsyncClient, two_operators):
    beta = await token_for(client, "owner@beta.test")
    data = (await client.get("/operator/dashboard", headers=auth(beta))).json()["data"]
    assert data["bookings"]["total"] == 0
    assert Decimal(data["money"]["booked_value"]) == Decimal("0.00")


# --------------------------------------------------------------------------
# Dashboard and schedule
# --------------------------------------------------------------------------

async def test_the_dashboard_counts_distinct_customers(
    client: AsyncClient, two_operators
):
    alpha = await token_for(client, "owner@alpha.test")
    data = (await client.get("/operator/dashboard", headers=auth(alpha))).json()["data"]
    assert data["bookings"]["total"] == 1
    assert data["bookings"]["customers"] == 1
    assert Decimal(data["money"]["booked_value"]) == Decimal("6000.00")


async def test_the_schedule_lists_committed_services_by_day(
    client: AsyncClient, two_operators
):
    alpha = await token_for(client, "owner@alpha.test")
    resp = await client.get("/operator/schedule?days=30", headers=auth(alpha))
    data = resp.json()["data"]
    assert data["total_events"] == 1
    day = data["days"][0]
    assert day["date"] == SOON.isoformat()
    assert day["events"][0]["title"] == "Alpha Room"
    assert day["events"][0]["traveller_name"] == "Customer Staff"


async def test_a_cancelled_component_leaves_the_schedule(
    client: AsyncClient, two_operators, db: AsyncSession
):
    """Nobody needs to staff a service that is no longer happening."""
    from sqlalchemy import update

    await db.execute(
        update(BookingItem).values(status=BookingItemStatus.CANCELLED)
    )
    await db.commit()

    alpha = await token_for(client, "owner@alpha.test")
    resp = await client.get("/operator/schedule?days=30", headers=auth(alpha))
    assert resp.json()["data"]["total_events"] == 0


# --------------------------------------------------------------------------
# Departures
# --------------------------------------------------------------------------

async def make_group(client: AsyncClient, token: str, **overrides) -> dict:
    payload = {
        "name": "October Departure",
        "destination": "Goa",
        "start_date": SOON.isoformat(),
        "end_date": (SOON + timedelta(days=4)).isoformat(),
        "capacity": 4,
        **overrides,
    }
    resp = await client.post(
        "/operator/tour-groups", json=payload, headers=auth(token)
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def test_a_manager_can_create_a_departure(client: AsyncClient, two_operators):
    token = await token_for(client, "owner@alpha.test")
    group = await make_group(client, token)
    assert group["status"] == "forming"
    assert group["seats_taken"] == 0
    assert group["coordinator_id"] is None


async def test_a_coordinator_cannot_create_a_departure(
    client: AsyncClient, two_operators
):
    """Coordinators run departures; creating them is a manager's job."""
    token = await token_for(client, "coord@alpha.test")
    resp = await client.post(
        "/operator/tour-groups",
        json={
            "name": "Unauthorised",
            "start_date": SOON.isoformat(),
            "end_date": (SOON + timedelta(days=2)).isoformat(),
        },
        headers=auth(token),
    )
    assert resp.status_code == 403


async def test_a_departure_cannot_end_before_it_starts(
    client: AsyncClient, two_operators
):
    token = await token_for(client, "owner@alpha.test")
    resp = await client.post(
        "/operator/tour-groups",
        json={
            "name": "Time Travel",
            "start_date": SOON.isoformat(),
            "end_date": (SOON - timedelta(days=1)).isoformat(),
        },
        headers=auth(token),
    )
    assert resp.status_code == 422


async def test_assigning_a_coordinator_clears_the_unstaffed_count(
    client: AsyncClient, two_operators
):
    """The number the console exists to make actionable."""
    token = await token_for(client, "owner@alpha.test")
    group = await make_group(client, token)

    before = (await client.get("/operator/dashboard", headers=auth(token))).json()
    assert before["data"]["operations"]["unstaffed_departures"] == 1

    roster = (await client.get("/operator/coordinators", headers=auth(token))).json()
    coordinator = next(c for c in roster["data"] if c["role"] == "coordinator")

    resp = await client.put(
        f"/operator/tour-groups/{group['id']}/coordinator",
        json={"coordinator_id": coordinator["id"]},
        headers=auth(token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["coordinator_name"] == "Coordinator Staff"

    after = (await client.get("/operator/dashboard", headers=auth(token))).json()
    assert after["data"]["operations"]["unstaffed_departures"] == 0


async def test_you_cannot_assign_another_operators_staff(
    client: AsyncClient, two_operators, db: AsyncSession
):
    from sqlalchemy import select

    alpha = await token_for(client, "owner@alpha.test")
    group = await make_group(client, alpha)

    rival_member = await db.scalar(
        select(OperatorMember).where(
            OperatorMember.user_id == two_operators["rival"].id
        )
    )
    resp = await client.put(
        f"/operator/tour-groups/{group['id']}/coordinator",
        json={"coordinator_id": str(rival_member.id)},
        headers=auth(alpha),
    )
    assert resp.status_code == 403


async def test_adding_a_booking_fills_the_departure(
    client: AsyncClient, two_operators
):
    token = await token_for(client, "owner@alpha.test")
    group = await make_group(client, token, capacity=2)

    resp = await client.post(
        f"/operator/tour-groups/{group['id']}/members",
        json={"booking_id": str(two_operators["booking"].id), "seats": 2},
        headers=auth(token),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["seats_taken"] == 2
    assert data["seats_left"] == 0
    # A full departure says so rather than waiting to be noticed.
    assert data["status"] == "full"


async def test_a_departure_cannot_be_overfilled(client: AsyncClient, two_operators):
    token = await token_for(client, "owner@alpha.test")
    group = await make_group(client, token, capacity=1)
    resp = await client.post(
        f"/operator/tour-groups/{group['id']}/members",
        json={"booking_id": str(two_operators["booking"].id), "seats": 5},
        headers=auth(token),
    )
    assert resp.status_code == 409
    assert "seat" in resp.json()["message"].lower()


async def test_the_same_booking_cannot_join_twice(
    client: AsyncClient, two_operators
):
    token = await token_for(client, "owner@alpha.test")
    group = await make_group(client, token)
    body = {"booking_id": str(two_operators["booking"].id), "seats": 1}

    assert (
        await client.post(
            f"/operator/tour-groups/{group['id']}/members",
            json=body,
            headers=auth(token),
        )
    ).status_code == 200
    second = await client.post(
        f"/operator/tour-groups/{group['id']}/members", json=body, headers=auth(token)
    )
    assert second.status_code == 409


async def test_removing_a_booking_reopens_a_full_departure(
    client: AsyncClient, two_operators
):
    token = await token_for(client, "owner@alpha.test")
    group = await make_group(client, token, capacity=1)
    added = await client.post(
        f"/operator/tour-groups/{group['id']}/members",
        json={"booking_id": str(two_operators["booking"].id), "seats": 1},
        headers=auth(token),
    )
    assert added.json()["data"]["status"] == "full"
    member_id = added.json()["data"]["members"][0]["id"]

    removed = await client.delete(
        f"/operator/tour-groups/{group['id']}/members/{member_id}",
        headers=auth(token),
    )
    assert removed.status_code == 200
    assert removed.json()["data"]["seats_taken"] == 0
    assert removed.json()["data"]["status"] != "full"


async def test_you_cannot_touch_another_operators_departure(
    client: AsyncClient, two_operators
):
    alpha = await token_for(client, "owner@alpha.test")
    beta = await token_for(client, "owner@beta.test")
    group = await make_group(client, alpha)

    resp = await client.put(
        f"/operator/tour-groups/{group['id']}/status",
        json={"status": "confirmed"},
        headers=auth(beta),
    )
    assert resp.status_code == 403


# --------------------------------------------------------------------------
# Roster and money
# --------------------------------------------------------------------------

async def test_the_roster_reports_each_persons_load(
    client: AsyncClient, two_operators
):
    token = await token_for(client, "owner@alpha.test")
    roster = (await client.get("/operator/coordinators", headers=auth(token))).json()
    names = {c["name"] for c in roster["data"]}
    assert names == {"Owner Staff", "Coordinator Staff"}
    assert all(c["active_departures"] == 0 for c in roster["data"])
    # A rival operator's staff never appear.
    assert "Rival Staff" not in names


async def test_money_is_a_string_throughout(client: AsyncClient, two_operators):
    token = await token_for(client, "owner@alpha.test")
    data = (await client.get("/operator/dashboard", headers=auth(token))).json()["data"]
    assert all(isinstance(v, str) for v in data["money"].values())
