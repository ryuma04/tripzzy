"""Bill splitting, notifications, and the traveller directory search.

The feature previously lived entirely in the browser, so none of it was
covered. These tests pin down the parts that were actually wrong: the share
arithmetic, where the total comes from, and who is allowed to see or settle a
split.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient

from app.services.bill_split_service import divide_evenly

TODAY = date.today()
START = TODAY + timedelta(days=30)
END = TODAY + timedelta(days=36)


async def make_trip(client: AsyncClient, budget="40000.00") -> str:
    resp = await client.post(
        "/trips",
        json={
            "title": "Coastal Circuit",
            "start_date": START.isoformat(),
            "end_date": END.isoformat(),
            "budget": budget,
            "traveller_count": 3,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


async def add_expense(client: AsyncClient, trip_id: str, amount: str) -> None:
    resp = await client.post(
        f"/trips/{trip_id}/expenses",
        json={
            "category": "meals",
            "title": "Dinner",
            "amount": amount,
            "date": START.isoformat(),
        },
    )
    assert resp.status_code == 201, resp.text


async def register_other(client: AsyncClient, registration, email, first="Nosy"):
    resp = await client.post(
        "/auth/register",
        json={**registration, "email": email, "first_name": first},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    return data["access_token"], data["user"]


# --------------------------------------------------------------------------
# Share arithmetic
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "total,count",
    [
        ("40000.00", 3),
        ("100.00", 3),
        ("0.03", 2),
        ("999.99", 7),
        ("1.00", 3),
        ("12345.67", 4),
        ("50.00", 1),
    ],
)
def test_shares_always_re_add_to_the_total(total, count):
    """The remainder has to land somewhere, and nowhere else.

    This is the bug the UI had: the table handed the whole remainder to the
    initiator while the summary line printed round(total / n), so the parts
    and the whole disagreed on screen.
    """
    shares = divide_evenly(Decimal(total), count)
    assert len(shares) == count
    assert sum(shares) == Decimal(total)


def test_shares_differ_by_at_most_one_paisa():
    shares = divide_evenly(Decimal("100.00"), 3)
    assert max(shares) - min(shares) <= Decimal("0.01")
    assert sorted(shares, reverse=True) == shares


def test_a_split_needs_at_least_one_member():
    with pytest.raises(Exception):
        divide_evenly(Decimal("10.00"), 0)


# --------------------------------------------------------------------------
# Creating a split
# --------------------------------------------------------------------------

async def test_equal_split_shares_sum_to_the_total(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/bill-splits",
        json={
            "total_amount": "40000.00",
            "split_method": "equal",
            "members": [
                {"display_name": "Yash"},
                {"display_name": "Rahul"},
                {"display_name": "Priya"},
            ],
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]

    shares = [Decimal(m["share_amount"]) for m in data["members"]]
    assert sum(shares) == Decimal("40000.00")
    assert data["member_count"] == 3
    # Money crosses the wire as a string, never a float.
    assert isinstance(data["total_amount"], str)


async def test_total_defaults_to_recorded_expenses_not_the_budget(
    auth_client: AsyncClient,
):
    """The UI read `trip.budget` while labelling it 'from verified receipts'."""
    trip_id = await make_trip(auth_client, budget="40000.00")
    await add_expense(auth_client, trip_id, "1200.00")
    await add_expense(auth_client, trip_id, "800.00")

    resp = await auth_client.post(
        f"/trips/{trip_id}/bill-splits",
        json={"members": [{"display_name": "A"}, {"display_name": "B"}]},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    # 2000 actually spent, not the 40000 budgeted.
    assert Decimal(data["total_amount"]) == Decimal("2000.00")
    assert Decimal(data["members"][0]["share_amount"]) == Decimal("1000.00")


async def test_splitting_a_trip_with_no_expenses_is_rejected(
    auth_client: AsyncClient,
):
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/bill-splits",
        json={"members": [{"display_name": "A"}, {"display_name": "B"}]},
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_custom_shares_must_match_the_total(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/bill-splits",
        json={
            "total_amount": "1000.00",
            "split_method": "custom",
            "members": [
                {"display_name": "A", "share_amount": "400.00"},
                {"display_name": "B", "share_amount": "400.00"},
            ],
        },
    )
    assert resp.status_code == 422


async def test_custom_split_is_accepted_when_shares_add_up(
    auth_client: AsyncClient,
):
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/bill-splits",
        json={
            "total_amount": "1000.00",
            "split_method": "custom",
            "members": [
                {"display_name": "A", "share_amount": "700.00"},
                {"display_name": "B", "share_amount": "300.00"},
            ],
        },
    )
    assert resp.status_code == 201, resp.text
    shares = [Decimal(m["share_amount"]) for m in resp.json()["data"]["members"]]
    assert shares == [Decimal("700.00"), Decimal("300.00")]


async def test_the_payer_starts_settled(auth_client: AsyncClient, user_token):
    _, me = user_token
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/bill-splits",
        json={
            "total_amount": "300.00",
            "members": [
                {"user_id": me["id"], "display_name": "Me"},
                {"display_name": "B"},
                {"display_name": "C"},
            ],
        },
    )
    assert resp.status_code == 201, resp.text
    members = resp.json()["data"]["members"]
    payer = next(m for m in members if m["is_payer"])
    assert payer["user_id"] == me["id"]
    assert payer["status"] == "paid"
    assert all(m["status"] == "pending" for m in members if not m["is_payer"])


async def test_members_must_reference_real_accounts(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    resp = await auth_client.post(
        f"/trips/{trip_id}/bill-splits",
        json={
            "total_amount": "100.00",
            "members": [
                {"user_id": "00000000-0000-0000-0000-000000000000", "display_name": "Ghost"}
            ],
        },
    )
    assert resp.status_code == 422


async def test_cannot_split_someone_elses_trip(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    trip_id = await make_trip(auth_client)
    token, _ = await register_other(client, registration, "intruder@example.com")

    resp = await client.post(
        f"/trips/{trip_id}/bill-splits",
        json={"total_amount": "100.00", "members": [{"display_name": "X"}]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


# --------------------------------------------------------------------------
# Visibility and settlement
# --------------------------------------------------------------------------

async def test_a_member_can_see_a_split_on_a_trip_they_do_not_own(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    """The whole point of moving this server-side."""
    token, other = await register_other(client, registration, "friend@example.com", "Rahul")
    trip_id = await make_trip(auth_client)

    created = await auth_client.post(
        f"/trips/{trip_id}/bill-splits",
        json={
            "total_amount": "500.00",
            "members": [
                {"display_name": "Owner"},
                {"user_id": other["id"], "display_name": "Rahul"},
            ],
        },
    )
    split_id = created.json()["data"]["id"]

    resp = await client.get(
        f"/bill-splits/{split_id}", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["id"] == split_id


async def test_an_unrelated_user_cannot_see_a_split(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bill-splits",
        json={"total_amount": "500.00", "members": [{"display_name": "Owner"}]},
    )
    split_id = created.json()["data"]["id"]

    token, _ = await register_other(client, registration, "stranger@example.com")
    resp = await client.get(
        f"/bill-splits/{split_id}", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 403


async def test_split_settles_once_every_member_has_paid(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bill-splits",
        json={
            "total_amount": "300.00",
            "members": [{"display_name": "A"}, {"display_name": "B"}],
        },
    )
    split = created.json()["data"]
    split_id = split["id"]
    assert split["status"] == "pending"

    for index, member in enumerate(split["members"]):
        resp = await auth_client.put(
            f"/bill-splits/{split_id}/members/{member['id']}",
            json={"status": "paid"},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()["data"]
        expected = "settled" if index == len(split["members"]) - 1 else "pending"
        assert body["status"] == expected

    assert Decimal(body["outstanding_amount"]) == Decimal("0.00")
    assert Decimal(body["settled_amount"]) == Decimal("300.00")


async def test_reopening_a_share_reopens_the_split(auth_client: AsyncClient):
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bill-splits",
        json={"total_amount": "200.00", "members": [{"display_name": "A"}]},
    )
    split = created.json()["data"]
    member_id = split["members"][0]["id"]

    paid = await auth_client.put(
        f"/bill-splits/{split['id']}/members/{member_id}", json={"status": "paid"}
    )
    assert paid.json()["data"]["status"] == "settled"

    reopened = await auth_client.put(
        f"/bill-splits/{split['id']}/members/{member_id}", json={"status": "owes"}
    )
    assert reopened.json()["data"]["status"] == "pending"


async def test_only_the_creator_can_delete_a_split(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    token, other = await register_other(client, registration, "member@example.com")
    trip_id = await make_trip(auth_client)
    created = await auth_client.post(
        f"/trips/{trip_id}/bill-splits",
        json={
            "total_amount": "100.00",
            "members": [{"user_id": other["id"], "display_name": "Them"}],
        },
    )
    split_id = created.json()["data"]["id"]

    denied = await client.delete(
        f"/bill-splits/{split_id}", headers={"Authorization": f"Bearer {token}"}
    )
    assert denied.status_code == 403

    assert (await auth_client.delete(f"/bill-splits/{split_id}")).status_code == 200
    assert (await auth_client.get(f"/bill-splits/{split_id}")).status_code == 404


# --------------------------------------------------------------------------
# Notifications
# --------------------------------------------------------------------------

async def test_members_are_notified_and_the_creator_is_not(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    """The old localStorage version notified only the person who clicked."""
    token, other = await register_other(client, registration, "friend2@example.com", "Priya")
    trip_id = await make_trip(auth_client)

    await auth_client.post(
        f"/trips/{trip_id}/bill-splits",
        json={
            "total_amount": "600.00",
            "members": [
                {"display_name": "Owner"},
                {"user_id": other["id"], "display_name": "Priya"},
            ],
        },
    )

    theirs = await client.get(
        "/notifications", headers={"Authorization": f"Bearer {token}"}
    )
    assert theirs.status_code == 200, theirs.text
    body = theirs.json()["data"]
    assert body["unread_count"] == 1
    assert body["items"][0]["type"] == "bill_split"

    mine = await auth_client.get("/notifications")
    assert mine.json()["data"]["unread_count"] == 0


async def test_marking_a_notification_read(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    token, other = await register_other(client, registration, "friend3@example.com")
    trip_id = await make_trip(auth_client)
    await auth_client.post(
        f"/trips/{trip_id}/bill-splits",
        json={
            "total_amount": "100.00",
            "members": [{"user_id": other["id"], "display_name": "Them"}],
        },
    )

    headers = {"Authorization": f"Bearer {token}"}
    listed = await client.get("/notifications", headers=headers)
    notif_id = listed.json()["data"]["items"][0]["id"]

    resp = await client.put(f"/notifications/{notif_id}/read", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["is_read"] is True

    after = await client.get("/notifications", headers=headers)
    assert after.json()["data"]["unread_count"] == 0


async def test_cannot_read_someone_elses_notification(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    token, other = await register_other(client, registration, "friend4@example.com")
    trip_id = await make_trip(auth_client)
    await auth_client.post(
        f"/trips/{trip_id}/bill-splits",
        json={
            "total_amount": "100.00",
            "members": [{"user_id": other["id"], "display_name": "Them"}],
        },
    )
    headers = {"Authorization": f"Bearer {token}"}
    notif_id = (
        (await client.get("/notifications", headers=headers))
        .json()["data"]["items"][0]["id"]
    )

    # The trip owner did not receive this one and must not be able to touch it.
    resp = await auth_client.put(f"/notifications/{notif_id}/read")
    assert resp.status_code == 404


# --------------------------------------------------------------------------
# Directory search
# --------------------------------------------------------------------------

async def test_search_finds_a_user_by_name_prefix(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    await register_other(client, registration, "priya@example.com", "Priya")
    resp = await auth_client.get("/users/search?q=pri")
    assert resp.status_code == 200, resp.text
    names = [u["first_name"] for u in resp.json()["data"]]
    assert "Priya" in names


async def test_search_excludes_yourself(auth_client: AsyncClient, user_token):
    _, me = user_token
    resp = await auth_client.get(f"/users/search?q={me['first_name'][:3]}")
    assert all(u["id"] != me["id"] for u in resp.json()["data"])


async def test_search_never_returns_contact_details(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    await register_other(client, registration, "quiet@example.com", "Quiet")
    resp = await auth_client.get("/users/search?q=quiet@example.com")
    results = resp.json()["data"]
    assert len(results) == 1
    assert "email" not in results[0]
    assert "phone" not in results[0]


async def test_search_does_not_match_a_partial_email(
    auth_client: AsyncClient, client: AsyncClient, registration
):
    """A prefix of an address must not confirm that the address exists."""
    await register_other(client, registration, "hidden@example.com", "Zed")
    resp = await auth_client.get("/users/search?q=hidden@exa")
    assert resp.json()["data"] == []


async def test_search_requires_authentication(client: AsyncClient):
    assert (await client.get("/users/search?q=abc")).status_code == 401


async def test_search_rejects_a_one_character_query(auth_client: AsyncClient):
    assert (await auth_client.get("/users/search?q=a")).status_code == 422
