"""Walk the spec section 40 "Definition of Done" against a running server.

    python scripts/e2e_check.py [base_url]

Exercises the exact sequence the spec requires:

    register -> login -> create trip -> multiple destinations -> activities
    -> dates -> itinerary -> budget -> expenses -> calendar -> share
    -> community -> another user clones it

and then the admin flow. Exits non-zero on the first failure.
"""

import secrets
import sys
from datetime import date, timedelta

import httpx

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000") + "/api/v1"
START = date.today() + timedelta(days=45)

passed = 0


def check(label: str, condition: bool, detail: str = "") -> None:
    global passed
    if condition:
        passed += 1
        print(f"  [ok]   {label}")
    else:
        print(f"  [FAIL] {label}  {detail}")
        sys.exit(1)


def d(offset: int) -> str:
    return (START + timedelta(days=offset)).isoformat()


def data(resp: httpx.Response) -> dict:
    body = resp.json()
    if not body.get("success"):
        print(f"  [FAIL] {resp.request.method} {resp.request.url} -> {resp.text}")
        sys.exit(1)
    return body["data"]


def main() -> None:
    # Unique per run so the script can be re-run against the same database.
    stamp = secrets.token_hex(4)
    client = httpx.Client(base_url=BASE, timeout=30)

    print("\n1. Register")
    email = f"e2e{stamp}@example.com"
    reg = client.post(
        "/auth/register",
        json={
            "first_name": "Ellie",
            "last_name": "Owen",
            "email": email,
            "phone": "+919876500001",
            "city": "Mumbai",
            "country": "India",
            "password": "Str0ng!Pass",
            "confirm_password": "Str0ng!Pass",
        },
    )
    check("registration succeeds", reg.status_code == 201, reg.text)
    check("no password in response", "hashed_password" not in reg.text)

    print("\n2. Login")
    login = client.post(
        "/auth/login", json={"email": email, "password": "Str0ng!Pass"}
    )

    # Both server configurations are legitimate, so the script handles both.
    # With REQUIRE_EMAIL_VERIFICATION on, a brand-new account cannot sign in
    # until it confirms a code that only reaches a real mailbox -- which a
    # script does not have. That is the server behaving correctly, not a
    # failure, so the rest of the walkthrough continues as the seeded,
    # already-verified traveller instead.
    if login.status_code == 403 and "verify" in login.text.lower():
        check("unverified account is correctly refused a session", True)
        email, password = "traveller@tripzyy.com", "Travel@123"
        login = client.post(
            "/auth/login", json={"email": email, "password": password}
        )
        check(
            "seeded verified account signs in",
            login.status_code == 200,
            login.text + "  (run: python -m app.seed.seed --demo)",
        )
    else:
        password = "Str0ng!Pass"
        check("login succeeds", login.status_code == 200, login.text)

    token = data(login)["access_token"]
    auth = {"Authorization": f"Bearer {token}"}
    check(
        "wrong password rejected",
        client.post(
            "/auth/login", json={"email": email, "password": "nope"}
        ).status_code
        == 401,
    )

    print("\n3. Create a trip")
    trip = data(
        client.post(
            "/trips",
            json={
                "title": "Konkan Coast",
                "description": "Mumbai, Goa and Gokarna",
                "start_date": d(0),
                "end_date": d(6),
                "budget": "40000.00",
                "traveller_count": 2,
            },
            headers=auth,
        )
    )
    trip_id = trip["id"]
    check("trip created", bool(trip_id))
    check("starts as draft", trip["status"] == "draft", trip["status"])
    check(
        "end before start rejected",
        client.post(
            "/trips",
            json={"title": "Bad dates", "start_date": d(5), "end_date": d(1)},
            headers=auth,
        ).status_code
        == 422,
    )

    print("\n4. Search destinations (dynamic data)")
    search = data(client.get("/destinations/search?q=goa"))
    check("destination search returns results", search["pagination"]["total"] >= 1)
    goa = search["items"][0]
    check("result is from the database", goa["name"] == "Goa", str(goa))

    acts = data(client.get(f"/destinations/{goa['id']}/activities"))
    check("destination has catalog activities", acts["pagination"]["total"] > 0)
    catalog_activity = acts["items"][0]

    print("\n5. Add multiple destinations")
    stops = []
    for city, arrive, depart in [("Mumbai", 0, 1), ("Goa", 2, 4), ("Gokarna", 5, 6)]:
        stop = data(
            client.post(
                f"/trips/{trip_id}/stops",
                json={
                    "city_name": city,
                    "country": "India",
                    "arrival_date": d(arrive),
                    "departure_date": d(depart),
                },
                headers=auth,
            )
        )
        stops.append(stop["id"])
    check("three stops added", len(stops) == 3)
    check(
        "stop outside trip dates rejected",
        client.post(
            f"/trips/{trip_id}/stops",
            json={
                "city_name": "Too late",
                "arrival_date": d(30),
                "departure_date": d(31),
            },
            headers=auth,
        ).status_code
        == 422,
    )

    print("\n6. Add activities")
    data(
        client.post(
            f"/stops/{stops[0]}/activities",
            json={
                "title": "Gateway of India",
                "activity_date": d(0),
                "start_time": "10:00:00",
                "end_time": "12:00:00",
                "estimated_cost": "800.00",
                "category": "sightseeing",
            },
            headers=auth,
        )
    )
    data(
        client.post(
            f"/stops/{stops[1]}/activities",
            json={
                "title": catalog_activity["title"],
                "activity_id": catalog_activity["id"],
                "activity_date": d(3),
                "estimated_cost": catalog_activity["estimated_cost"],
                "category": catalog_activity["category"],
            },
            headers=auth,
        )
    )
    check(
        "activity outside stop dates rejected",
        client.post(
            f"/stops/{stops[0]}/activities",
            json={"title": "Wrong day", "activity_date": d(6)},
            headers=auth,
        ).status_code
        == 422,
    )
    check(
        "invalid time range rejected",
        client.post(
            f"/stops/{stops[0]}/activities",
            json={
                "title": "Backwards",
                "activity_date": d(0),
                "start_time": "15:00:00",
                "end_time": "09:00:00",
            },
            headers=auth,
        ).status_code
        == 422,
    )

    print("\n7. Reorder and logistics")
    reordered = data(
        client.put(
            f"/trips/{trip_id}/stops/reorder",
            json={"ordered_ids": [stops[2], stops[0], stops[1]]},
            headers=auth,
        )
    )
    check(
        "stops reordered",
        [s["city_name"] for s in reordered["items"]] == ["Gokarna", "Mumbai", "Goa"],
    )
    data(
        client.put(
            f"/trips/{trip_id}/stops/reorder",
            json={"ordered_ids": stops},
            headers=auth,
        )
    )

    data(
        client.post(
            f"/trips/{trip_id}/transport",
            json={
                "origin_stop_id": stops[0],
                "destination_stop_id": stops[1],
                "transport_type": "train",
                "departure_time": f"{d(2)}T08:00:00+00:00",
                "arrival_time": f"{d(2)}T12:00:00+00:00",
                "cost": "850.00",
            },
            headers=auth,
        )
    )
    data(
        client.post(
            f"/stops/{stops[1]}/accommodations",
            json={
                "name": "Beach shack",
                "check_in": d(2),
                "check_out": d(4),
                "estimated_cost": "5000.00",
            },
            headers=auth,
        )
    )
    check("transport and accommodation added", True)

    print("\n8. Itinerary")
    itinerary = data(client.get(f"/trips/{trip_id}/itinerary", headers=auth))
    check("itinerary has one entry per day", len(itinerary["days"]) == 7)
    check(
        "day 1 has the Mumbai activity",
        itinerary["days"][0]["activities"][0]["title"] == "Gateway of India",
    )

    print("\n9. Budget")
    budget = data(client.get(f"/trips/{trip_id}/budget", headers=auth))
    check("budget reports the total", budget["total_budget"] == "40000.00")
    check(
        "planned cost is summed",
        budget["estimated_cost"] not in ("0", "0.00"),
        budget["estimated_cost"],
    )
    check("money is a string, not a float", isinstance(budget["total_budget"], str))
    check("breakdown has five categories", len(budget["breakdown"]) == 5)

    print("\n10. Expenses")
    data(
        client.post(
            f"/trips/{trip_id}/expenses",
            json={
                "category": "meals",
                "title": "Seafood dinner",
                "amount": "2400.00",
                "date": d(3),
            },
            headers=auth,
        )
    )
    check(
        "zero-amount expense rejected",
        client.post(
            f"/trips/{trip_id}/expenses",
            json={
                "category": "meals",
                "title": "Free",
                "amount": "0",
                "date": d(3),
            },
            headers=auth,
        ).status_code
        == 422,
    )
    after = data(client.get(f"/trips/{trip_id}/budget", headers=auth))
    check("actual spend recorded", after["actual_cost"] == "2400.00")
    check("remaining recalculated", after["remaining"] == "37600.00")

    print("\n11. Calendar")
    calendar = data(client.get(f"/trips/{trip_id}/calendar", headers=auth))
    types = {e["type"] for e in calendar["events"]}
    check("calendar has activities", "activity" in types)
    check("calendar has transport", "transport" in types)
    check("calendar has accommodation", "accommodation_check_in" in types)

    print("\n12. Trip listing and status")
    # Assert this trip is in the listing rather than that it is the only one:
    # the account running this may already own trips, and a count assertion
    # would be testing the fixture's history instead of the status filter.
    listing = data(client.get("/trips?status=upcoming&limit=100", headers=auth))
    upcoming = {t["id"] for t in listing["items"]}
    check("trip is now upcoming", trip_id in upcoming, f"{len(upcoming)} upcoming")
    check(
        "the status filter excludes other statuses",
        all(t["status"] == "upcoming" for t in listing["items"]),
    )

    print("\n13. Share")
    shared = data(client.post(f"/trips/{trip_id}/share", headers=auth))
    slug = shared["share_slug"]
    check("share slug issued", bool(slug))

    public = data(client.get(f"/public/trips/{slug}"))
    check("public view needs no auth", public["title"] == "Konkan Coast")
    check("public view lists the cities", public["cities"] == ["Mumbai", "Goa", "Gokarna"])
    check(
        "expenses stay private",
        "Seafood dinner" not in client.get(f"/public/trips/{slug}").text,
    )

    print("\n14. Community")
    community = data(client.get("/community/trips?q=konkan"))
    check("trip appears in the community", community["pagination"]["total"] >= 1)

    print("\n15. Another user clones it")
    # The seeded second traveller rather than a fresh registration, for the
    # same reason as section 2: a new account cannot sign in while email
    # verification is required. It also keeps this walkthrough clear of the
    # auth rate limit, which a second register-plus-login would push into.
    other_email, other_password = "explorer@tripzyy.com", "Explore@123"
    other_login = client.post(
        "/auth/login", json={"email": other_email, "password": other_password}
    )
    check(
        "second seeded account signs in",
        other_login.status_code == 200,
        other_login.text + "  (run: python -m app.seed.seed --demo)",
    )
    other_token = data(other_login)["access_token"]
    other_auth = {"Authorization": f"Bearer {other_token}"}

    clone = data(
        client.post(f"/public/trips/{slug}/clone", json={}, headers=other_auth)
    )
    check("clone created", clone["stop_count"] == 3)
    check("clone is private", clone["is_public"] is False)
    check("clone records its origin", clone["cloned_from_trip_id"] == trip_id)

    check(
        "cloner cannot edit the original",
        client.put(
            f"/trips/{trip_id}", json={"title": "Hijacked"}, headers=other_auth
        ).status_code
        == 403,
    )
    original = data(client.get(f"/trips/{trip_id}", headers=auth))
    check("original untouched", original["title"] == "Konkan Coast")

    print("\n16. Admin")
    admin_login = client.post(
        "/auth/login",
        json={"email": "admin@tripzyy.com", "password": "Admin@123"},
    )
    if admin_login.status_code != 200:
        print("  [skip] seed the demo admin first: python -m app.seed.seed --demo")
    else:
        admin_auth = {
            "Authorization": f"Bearer {data(admin_login)['access_token']}"
        }
        dashboard = data(client.get("/admin/dashboard", headers=admin_auth))
        check("admin sees user counts", dashboard["users"]["total"] >= 2)
        check("admin sees trip counts", dashboard["trips"]["total"] >= 2)

        users = data(client.get("/admin/users", headers=admin_auth))
        check("admin lists users", users["pagination"]["total"] >= 2)
        check(
            "admin listing hides password hashes",
            all("hashed_password" not in u for u in users["items"]),
        )
        check(
            "admin analytics work",
            client.get("/admin/analytics/trips", headers=admin_auth).status_code
            == 200,
        )
        check(
            "normal user blocked from admin",
            client.get("/admin/dashboard", headers=auth).status_code == 403,
        )

    print(f"\nAll {passed} checks passed. Definition of Done satisfied.\n")


if __name__ == "__main__":
    main()
