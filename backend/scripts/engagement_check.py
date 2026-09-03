"""Walk the assist and review flow against a running server.

    python scripts/engagement_check.py [base_url]

Two loops, both ends of the tour lifecycle:

    traveller asks a question -> the concierge answers from real trip data,
    labelled as the concierge -> it reaches the operator's queue -> a
    coordinator answers and resolves it

    traveller reviews a component they actually booked -> the rating is
    written back onto the row the component ranker reads -> an unbooked
    component is refused

Exits non-zero on the first failure. The review assertions check the *ranking
side effect*, not just that a row was written — a review that does not move
the ranker is decoration, and the whole point of this phase is that it is not.

Assumes the seeder has run.
"""

import secrets
import sys
from datetime import date, timedelta
from decimal import Decimal

import httpx

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000") + "/api/v1"
START = date.today() + timedelta(days=75)

TRAVELLER_EMAIL = "traveller@tripzyy.com"
TRAVELLER_PASSWORD = "Travel@123"
OTHER_EMAIL = "explorer@tripzyy.com"
OTHER_PASSWORD = "Explore@123"
OPERATOR_EMAIL = "operator@tripzyy.com"
OPERATOR_PASSWORD = "Operate@123"

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


def body(resp: httpx.Response) -> dict:
    try:
        payload = resp.json()
    except Exception:
        print(f"  [FAIL] non-JSON {resp.status_code}: {resp.text[:300]}")
        sys.exit(1)
    if not payload.get("success"):
        print(f"  [FAIL] {resp.request.method} {resp.request.url}")
        print(f"         {resp.status_code} {payload.get('message')} {payload.get('error')}")
        sys.exit(1)
    return payload["data"]


def login(client: httpx.Client, email: str, password: str) -> dict:
    data = body(client.post(f"{BASE}/auth/login", json={"email": email, "password": password}))
    return {"Authorization": f"Bearer {data['access_token']}"}


def main() -> None:
    print(f"\nTripzyy assist & review check against {BASE}\n")

    with httpx.Client(timeout=120.0) as client:
        tag = secrets.token_hex(4)
        traveller = login(client, TRAVELLER_EMAIL, TRAVELLER_PASSWORD)
        operator = login(client, OPERATOR_EMAIL, OPERATOR_PASSWORD)
        stranger = login(client, OTHER_EMAIL, OTHER_PASSWORD)
        print("Signed in as traveller, operator and a bystander\n")

        # -- a booked tour to talk about ------------------------------------
        print("Setting up a booked tour")
        trip = body(client.post(f"{BASE}/trips", headers=traveller, json={
            "title": f"Assist Demo {tag}", "start_date": d(0), "end_date": d(4),
            "budget": "80000.00", "traveller_count": 2, "currency": "INR"}))
        trip_id = trip["id"]

        stop = body(client.post(f"{BASE}/trips/{trip_id}/stops", headers=traveller, json={
            "city_name": "Goa", "country": "India",
            "arrival_date": d(0), "departure_date": d(3)}))

        options = body(client.get(f"{BASE}/components/alternatives", headers=traveller, params={
            "service_type": "accommodation", "city": "Goa", "on_date": d(0),
            "quantity": 2, "nights": 3, "limit": 5}))["items"]
        check("catalogue has options to book", len(options) >= 2, f"got {len(options)}")
        chosen = options[0]

        booking = body(client.post(f"{BASE}/trips/{trip_id}/bookings", headers=traveller, json={
            "items": [{
                "service_id": chosen["service_id"], "stop_id": stop["id"],
                "component_type": "accommodation", "service_date": d(0),
                "end_date": d(3), "quantity": 2, "units": 3}]}))
        body(client.post(f"{BASE}/bookings/{booking['id']}/payments",
                         headers=traveller, json={"method": "card"}))
        check("tour booked and paid", True)

        # -- assist ----------------------------------------------------------
        print("\nAssist")
        thread = body(client.post(f"{BASE}/trips/{trip_id}/assist", headers=traveller, json={
            "subject": "Airport pickup timing",
            "body": "What time does my accommodation check-in start, and which city am I in on day two?",
            "ask_concierge": True}))
        thread_id = thread["id"]
        check("thread opened", thread["status"] == "open")
        check("routed to an operator", thread["operator_id"] is not None)

        senders = [m["sender"] for m in thread["messages"]]
        check("the traveller's message is recorded", "traveller" in senders)
        check("the concierge answered immediately", "ai" in senders,
              f"senders were {senders}")

        ai_message = next(m for m in thread["messages"] if m["sender"] == "ai")
        check("the AI answer is labelled as the concierge, not a person",
              ai_message["sender_id"] is None
              and "concierge" in (ai_message["sender_name"] or "").lower(),
              str(ai_message["sender_name"]))
        check("the concierge answer is non-empty", len(ai_message["body"]) > 20)
        check("an AI reply does not resolve the thread", thread["status"] == "open")

        # A bystander must not be able to read it.
        peek = client.get(f"{BASE}/assist/{thread_id}", headers=stranger)
        check("a bystander cannot read the conversation", peek.status_code == 403,
              str(peek.status_code))

        # -- the operator side -----------------------------------------------
        print("\nOperator queue")
        queue = body(client.get(f"{BASE}/operator/assist", headers=operator,
                                params={"limit": 50}))["items"]
        check("the thread is in the operator's queue",
              any(t["id"] == thread_id for t in queue), f"{len(queue)} threads")

        refused = client.get(f"{BASE}/operator/assist", headers=traveller)
        check("travellers are refused the operator queue", refused.status_code == 403,
              str(refused.status_code))

        answered = body(client.post(
            f"{BASE}/operator/assist/{thread_id}/messages", headers=operator,
            json={"body": "Check-in is from 2pm. You are in Goa the whole time.",
                  "resolve": True}))
        check("the coordinator's reply is attributed to a person",
              any(m["sender"] == "coordinator" and m["sender_id"] for m in answered["messages"]))
        check("replying claims the thread", answered["assigned_member_id"] is not None)
        check("resolving closes it out", answered["status"] == "resolved",
              answered["status"])
        check("resolution is timestamped", answered["resolved_at"] is not None)

        # A traveller reply reopens it.
        reopened = body(client.post(f"{BASE}/assist/{thread_id}/messages",
                                    headers=traveller,
                                    json={"body": "Thanks — one more thing.",
                                          "ask_concierge": False}))
        check("a traveller reply puts the ball back with staff",
              reopened["status"] == "open", reopened["status"])

        # -- reviews ----------------------------------------------------------
        print("\nReviews")
        # The seeded traveller persists between runs, and a review is one per
        # person per thing — so clear any leftover from an earlier run before
        # asserting, or the "not yet reviewed" assertions test the wrong state.
        mine = body(client.get(f"{BASE}/reviews/mine", headers=traveller,
                               params={"limit": 100}))["items"]
        stale = [r for r in mine
                 if str(r.get("service_id")) == str(chosen["service_id"])]
        for old_review in stale:
            client.delete(f"{BASE}/reviews/{old_review['id']}", headers=traveller)
        if stale:
            print(f"  (cleared {len(stale)} review(s) left by an earlier run)")

        before = body(client.get(f"{BASE}/components/alternatives", headers=traveller, params={
            "service_type": "accommodation", "city": "Goa", "on_date": d(0),
            "quantity": 2, "nights": 3, "limit": 20}))["items"]
        before_rating = next(
            (o["rating"] for o in before if o["service_id"] == chosen["service_id"]), None
        )

        pending = body(client.get(f"{BASE}/reviews/pending", headers=traveller))
        check("the booked component is offered for review",
              any(str(p["target_id"]) == str(chosen["service_id"]) for p in pending),
              f"{len(pending)} pending")

        review = body(client.post(f"{BASE}/reviews", headers=traveller, json={
            "subject": "service", "target_id": chosen["service_id"],
            "rating": 5, "title": "Excellent stay",
            "body": "Spotless, and the staff sorted our transfer."}))
        check("the review is created", review["rating"] == 5)
        check("it is marked verified against the booking",
              review["is_verified"] is True and review["booking_id"] is not None)

        # The point of the whole phase: it moves the ranker's input.
        after = body(client.get(f"{BASE}/components/alternatives", headers=traveller, params={
            "service_type": "accommodation", "city": "Goa", "on_date": d(0),
            "quantity": 2, "nights": 3, "limit": 20}))["items"]
        after_rating = next(
            (o["rating"] for o in after if o["service_id"] == chosen["service_id"]), None
        )
        check("the rating the ranker reads was rewritten",
              after_rating is not None and after_rating != before_rating,
              f"{before_rating} -> {after_rating}")

        listing = body(client.get(f"{BASE}/reviews/service/{chosen['service_id']}"))
        check("the review is publicly listed", listing["summary"]["count"] >= 1)
        check("the summary carries a distribution, not just an average",
              sum(listing["summary"]["distribution"].values()) == listing["summary"]["count"],
              str(listing["summary"]))

        # Provenance is the whole basis for trusting the number. Asserted with
        # the bystander rather than the traveller: the seeded traveller
        # accumulates bookings across runs, so "a service they never booked"
        # is not a stable thing for this script to point at.
        unearned = client.post(f"{BASE}/reviews", headers=stranger, json={
            "subject": "service", "target_id": chosen["service_id"], "rating": 1})
        check("reviewing something you never booked is refused",
              unearned.status_code == 403, str(unearned.status_code))

        duplicate = client.post(f"{BASE}/reviews", headers=traveller, json={
            "subject": "service", "target_id": chosen["service_id"], "rating": 3})
        check("a second review of the same thing is refused",
              duplicate.status_code == 409, str(duplicate.status_code))

        edited = body(client.put(f"{BASE}/reviews/{review['id']}", headers=traveller,
                                 json={"rating": 4}))
        check("editing your own review works", edited["rating"] == 4)

        foreign = client.put(f"{BASE}/reviews/{review['id']}", headers=stranger,
                             json={"rating": 1})
        check("editing someone else's review is refused",
              foreign.status_code == 403, str(foreign.status_code))

        deleted = client.delete(f"{BASE}/reviews/{review['id']}", headers=traveller)
        check("deleting your own review works", deleted.status_code == 200)

        after_delete = body(client.get(f"{BASE}/reviews/service/{chosen['service_id']}"))
        check("the aggregate is recomputed after a delete",
              after_delete["summary"]["count"] == listing["summary"]["count"] - 1,
              str(after_delete["summary"]))

    print(f"\n{passed} checks passed.\n")


if __name__ == "__main__":
    main()
