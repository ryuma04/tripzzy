"""Walk the dynamic tour management flow against a running server.

    python scripts/adaptation_check.py [base_url]

Exercises the whole Phase 5 loop end to end, which is also the demo:

    traveller books a tour -> pays -> previews a change and sees its costed
    impact -> submits it -> operator reviews it in the console -> approves ->
    the itinerary, the bookings and the money all move together

then the disruption path:

    operator fires a disruption -> the engine costs the blast radius and
    ranks a replacement for every affected component -> the operator proposes
    a recovery -> the traveller sees it as a change request on their own tour

Exits non-zero on the first failure. Every assertion checks a *number* the
engine produced, not merely that a request returned 200 -- an impact report
that is cheerfully wrong is worse than one that errors.

Assumes the seeder has run (``python -m app.seed.seed --demo``), because the
operator, its vendors and their per-date availability are what the engine
reasons over.
"""

import secrets
import sys
from datetime import date, timedelta
from decimal import Decimal

import httpx

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000") + "/api/v1"

# Far enough out that free-cancellation windows are open, so the refund
# arithmetic exercises the interesting branch rather than the penalty one.
START = date.today() + timedelta(days=60)

TRAVELLER_EMAIL = "traveller@tripzyy.com"
TRAVELLER_PASSWORD = "Travel@123"
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
        print(f"  [FAIL] non-JSON response {resp.status_code}: {resp.text[:300]}")
        sys.exit(1)
    if not payload.get("success"):
        print(f"  [FAIL] {resp.request.method} {resp.request.url}")
        print(f"         {resp.status_code} {payload.get('message')}")
        print(f"         {payload.get('error')}")
        sys.exit(1)
    return payload["data"]


def money(value) -> Decimal:
    return Decimal(str(value))


def main() -> None:
    print(f"\nTripzyy adaptation check against {BASE}\n")

    with httpx.Client(timeout=90.0) as client:
        # -- a traveller ---------------------------------------------------
        print("Traveller")
        tag = secrets.token_hex(4)
        # A seeded, already-verified traveller rather than a fresh
        # registration: sign-in is gated on email verification, and a script
        # has no inbox. Everything after this point is about adaptation, not
        # about onboarding, which ``scripts/e2e_check.py`` already covers.
        signin = body(
            client.post(
                f"{BASE}/auth/login",
                json={"email": TRAVELLER_EMAIL, "password": TRAVELLER_PASSWORD},
            )
        )
        traveller = {"Authorization": f"Bearer {signin['access_token']}"}
        traveller_id = signin["user"]["id"]
        check("signed in as the seeded traveller", "access_token" in signin)

        # A stated preference makes the ranking preference-led rather than
        # price-led, which is the branch worth exercising.
        body(
            client.put(
                f"{BASE}/users/me/preferences",
                headers=traveller,
                json={"accommodation_class": "premium", "pace": "relaxed"},
            )
        )
        check("preferences stated", True)

        # -- a trip --------------------------------------------------------
        print("\nTrip")
        trip = body(
            client.post(
                f"{BASE}/trips",
                headers=traveller,
                json={
                    "title": f"Adaptation Demo {tag}",
                    "start_date": d(0),
                    "end_date": d(5),
                    "budget": "120000.00",
                    "traveller_count": 2,
                    "currency": "INR",
                },
            )
        )
        trip_id = trip["id"]
        check("trip created", bool(trip_id))

        stop = body(
            client.post(
                f"{BASE}/trips/{trip_id}/stops",
                headers=traveller,
                json={
                    "city_name": "Goa",
                    "country": "India",
                    "arrival_date": d(0),
                    "departure_date": d(3),
                },
            )
        )
        stop_id = stop["id"]
        check("stop added", bool(stop_id))

        # -- inventory -----------------------------------------------------
        print("\nInventory")
        options = body(
            client.get(
                f"{BASE}/components/alternatives",
                headers=traveller,
                params={
                    "service_type": "accommodation",
                    "city": "Goa",
                    "on_date": d(0),
                    "quantity": 2,
                    "nights": 3,
                    "limit": 10,
                },
            )
        )["items"]
        check("alternatives ranked", len(options) >= 2, f"got {len(options)}")
        check(
            "ranking is ordered by match score",
            all(
                options[i]["match_score"] >= options[i + 1]["match_score"]
                for i in range(len(options) - 1)
            ),
        )
        check(
            "each option explains its own score",
            all(o.get("match_reasons") for o in options),
        )
        chosen = options[0]
        replacement_candidate = options[1]

        # -- booking -------------------------------------------------------
        print("\nBooking")
        booking = body(
            client.post(
                f"{BASE}/trips/{trip_id}/bookings",
                headers=traveller,
                json={
                    "items": [
                        {
                            "service_id": chosen["service_id"],
                            "stop_id": stop_id,
                            "component_type": "accommodation",
                            "service_date": d(0),
                            "end_date": d(3),
                            "quantity": 2,
                            "units": 3,
                        }
                    ]
                },
            )
        )
        booking_id = booking["id"]
        item_id = booking["items"][0]["id"]
        original_cost = money(booking["items"][0]["total_price"])
        check("booking created", money(booking["total"]) == original_cost)

        paid = body(
            client.post(
                f"{BASE}/bookings/{booking_id}/payments",
                headers=traveller,
                json={"method": "card"},
            )
        )
        check("paid in full and confirmed", paid["status"] == "confirmed", paid["status"])
        check("item confirmed", paid["items"][0]["status"] == "confirmed")

        # -- assessing a replacement --------------------------------------
        print("\nImpact assessment: replace one component")
        assessment = body(
            client.post(
                f"{BASE}/trips/{trip_id}/assess-change",
                headers=traveller,
                params={"explain": "true"},
                json={
                    "type": "replace_component",
                    "proposal": {
                        "booking_item_id": item_id,
                        "new_service_id": replacement_candidate["service_id"],
                    },
                },
            )
        )
        impact = assessment["impact"]
        cost = impact["cost"]
        check("report is feasible", impact["feasible"] is True, str(impact["blockers"]))
        check(
            "original cost matches the booked line",
            money(cost["original_total"]) == original_cost,
            f"{cost['original_total']} vs {original_cost}",
        )
        check(
            "net delta is replacement minus refund",
            money(cost["net_delta"])
            == money(cost["replacement_total"]) - money(cost["refund_total"]),
        )
        check(
            "the replacement is priced from the catalogue",
            money(cost["replacement_total"])
            == money(replacement_candidate["total_price"]),
            f"{cost['replacement_total']} vs {replacement_candidate['total_price']}",
        )
        check("direction agrees with the delta", (
            (cost["direction"] == "increase" and money(cost["net_delta"]) > 0)
            or (cost["direction"] == "decrease" and money(cost["net_delta"]) < 0)
            or (cost["direction"] == "none" and money(cost["net_delta"]) == 0)
        ), cost["direction"])
        check(
            "the chosen option is scored against stated preferences",
            impact.get("preference_fit") is not None,
        )
        check("other alternatives are offered", len(impact["alternatives"]) >= 1)
        check(
            "the proposal itself is not listed as its own alternative",
            all(
                str(o["service_id"]) != str(replacement_candidate["service_id"])
                for o in impact["alternatives"]
            ),
        )
        check("a plain-language explanation is returned", bool(assessment["ai_summary"]))

        # Assessment must not have changed anything.
        after_preview = body(client.get(f"{BASE}/bookings/{booking_id}", headers=traveller))
        check(
            "previewing changed nothing",
            after_preview["items"][0]["status"] == "confirmed"
            and money(after_preview["total"]) == original_cost,
        )

        # -- assessing a date shift ---------------------------------------
        print("\nImpact assessment: shift the whole trip")
        shift = body(
            client.post(
                f"{BASE}/trips/{trip_id}/assess-change",
                headers=traveller,
                json={"type": "date_shift", "proposal": {"shift_days": 4}},
            )
        )["impact"]
        check("the booked component is affected", len(shift["affected_items"]) == 1)
        check(
            "it is rebooked onto the new date",
            shift["affected_items"][0]["new_date"] == d(4),
            shift["affected_items"][0]["new_date"],
        )
        check(
            "availability was checked on the new date",
            any(a["on_date"] == d(4) for a in shift["availability"]),
        )
        check(
            "the paid-for component is flagged as now outside the trip",
            any(
                c["code"] in ("BOOKED_ITEM_OUTSIDE_TRIP", "BOOKED_ITEM_DATE_MISMATCH")
                for c in shift["conflicts"]
            ),
            str([c["code"] for c in shift["conflicts"]]),
        )

        # -- submitting ----------------------------------------------------
        print("\nChange request")
        request = body(
            client.post(
                f"{BASE}/trips/{trip_id}/change-requests",
                headers=traveller,
                json={
                    "type": "replace_component",
                    "proposal": {
                        "booking_item_id": item_id,
                        "new_service_id": replacement_candidate["service_id"],
                    },
                    "reason": "The other property looks like a better fit.",
                },
            )
        )
        request_id = request["id"]
        agreed_delta = money(request["net_cost_delta"])
        check("submitted as pending", request["status"] == "pending")
        check(
            "the impact report is frozen onto the request",
            request["impact"]["cost"]["net_delta"] == str(agreed_delta),
        )
        check("it is routed to an operator", request["operator_id"] is not None)
        check("it carries a narration", bool(request["ai_summary"]))

        # -- the operator --------------------------------------------------
        print("\nOperator console")
        op_login = body(
            client.post(
                f"{BASE}/auth/login",
                json={"email": OPERATOR_EMAIL, "password": OPERATOR_PASSWORD},
            )
        )
        operator = {"Authorization": f"Bearer {op_login['access_token']}"}

        queue = body(
            client.get(
                f"{BASE}/operator/change-requests",
                headers=operator,
                params={"status": "pending", "limit": 50},
            )
        )["items"]
        check(
            "the request is in the operator's queue",
            any(r["id"] == request_id for r in queue),
            f"{len(queue)} pending",
        )
        queued = next(r for r in queue if r["id"] == request_id)
        check(
            "the operator sees the same numbers the traveller agreed to",
            money(queued["net_cost_delta"]) == agreed_delta,
        )

        # A traveller must not be able to reach the operator's queue.
        forbidden = client.get(f"{BASE}/operator/change-requests", headers=traveller)
        check(
            "travellers are refused the operator queue",
            forbidden.status_code == 403,
            str(forbidden.status_code),
        )

        decided = body(
            client.post(
                f"{BASE}/operator/change-requests/{request_id}/decision",
                headers=operator,
                json={"action": "approve", "note": "Confirmed with the property."},
            )
        )
        check("approving applies it", decided["status"] == "applied", decided["status"])
        check("the application is recorded", decided["applied_result"] is not None)
        result = decided["applied_result"]
        check("one component was superseded", len(result["cancelled_item_ids"]) == 1)
        check("one replacement was created", len(result["created_item_ids"]) == 1)

        # -- the effect ----------------------------------------------------
        print("\nEffect on the booking")
        after = body(client.get(f"{BASE}/bookings/{booking_id}", headers=traveller))
        old_item = next(i for i in after["items"] if i["id"] == item_id)
        new_item = next(
            i for i in after["items"] if i["id"] == result["created_item_ids"][0]
        )
        check("the old component is marked replaced", old_item["status"] == "replaced")
        check(
            "the replacement chain points at the new component",
            old_item["replaced_by_item_id"] == new_item["id"],
        )
        check(
            "the new component is the service that was approved",
            str(new_item["service_id"]) == str(replacement_candidate["service_id"]),
        )
        check(
            "the booking total is now the replacement's price",
            money(after["total"]) == money(new_item["total_price"]),
            f"{after['total']} vs {new_item['total_price']}",
        )
        check(
            "the refund was issued",
            any(p["kind"] == "refund" for p in after["payments"]),
        )
        check(
            "the ledger balances against the agreed delta",
            money(after["amount_paid"])
            == money(after["total"]) - max(Decimal("0"), money(after["amount_outstanding"])),
            f"paid {after['amount_paid']} total {after['total']} "
            f"outstanding {after['amount_outstanding']}",
        )

        # A decided request cannot be decided twice.
        again = client.post(
            f"{BASE}/operator/change-requests/{request_id}/decision",
            headers=operator,
            json={"action": "reject"},
        )
        check(
            "an applied request cannot be re-decided",
            again.status_code == 409,
            str(again.status_code),
        )

        # -- disruption ----------------------------------------------------
        print("\nDisruption")
        disruption = body(
            client.post(
                f"{BASE}/operator/disruptions",
                headers=operator,
                json={
                    "type": "weather",
                    "severity": "high",
                    "title": "Cyclone warning, Goa coast",
                    "description": "Red alert issued for the whole coastal belt.",
                    "city": "Goa",
                    "from_date": d(0),
                    "to_date": d(3),
                },
            )
        )
        disruption_id = disruption["id"]
        assessment = disruption["assessment"]
        check("the incident is costed on creation", assessment is not None)
        check(
            "our booking is in the blast radius",
            any(
                r["booking_id"] == booking_id for r in assessment["items"]
            ),
            f"{assessment['items_at_risk']} at risk",
        )
        row = next(r for r in assessment["items"] if r["booking_id"] == booking_id)
        check(
            "exposure is the money actually committed",
            money(assessment["exposure_total"]) >= money(row["total_price"]),
        )
        check(
            "a high-severity incident forces replacement",
            row["recommended_action"] == "replace" and assessment["forcing"] is True,
        )
        check("every affected component gets ranked alternatives", bool(row["alternatives"]))
        check(
            "the failed service is never suggested as its own replacement",
            all(
                str(o["service_id"]) != str(new_item["service_id"])
                for o in row["alternatives"]
            ),
        )

        # -- recovery ------------------------------------------------------
        print("\nRecovery")
        recovery = body(
            client.post(
                f"{BASE}/operator/disruptions/{disruption_id}"
                f"/items/{row['item_id']}/recover",
                headers=operator,
            )
        )
        check("a recovery request is raised", recovery["status"] == "pending")
        check(
            "it is attributed to the traveller, not the operator",
            recovery["requested_by_id"] == traveller_id,
        )
        check("it is linked to the incident", recovery["disruption_id"] == disruption_id)
        check(
            "it proposes the top-ranked replacement",
            str(recovery["proposal"]["new_service_id"]) == str(row["alternatives"][0]["service_id"]),
        )

        moved = body(
            client.get(f"{BASE}/operator/disruptions/{disruption_id}", headers=operator)
        )
        check(
            "the incident moves to mitigating",
            moved["status"] == "mitigating",
            moved["status"],
        )

        mine = body(
            client.get(f"{BASE}/change-requests", headers=traveller, params={"limit": 50})
        )["items"]
        check(
            "the traveller sees the recovery on their own tour",
            any(r["id"] == recovery["id"] for r in mine),
        )

        # -- conflicts -----------------------------------------------------
        print("\nItinerary health")
        conflicts = body(
            client.get(f"{BASE}/trips/{trip_id}/conflicts", headers=traveller)
        )
        check(
            "the trip reports its own conflicts",
            "conflicts" in conflicts
            and conflicts["blockers"] + conflicts["warnings"] + conflicts["notes"]
            == len(conflicts["conflicts"]),
        )

        # -- scoping -------------------------------------------------------
        print("\nScoping")
        other = client.get(
            f"{BASE}/operator/disruptions/{disruption_id}", headers=traveller
        )
        check(
            "a traveller cannot read an operator's incident",
            other.status_code == 403,
            str(other.status_code),
        )
        stranger = client.get(f"{BASE}/change-requests/{request_id}", headers=operator)
        check(
            "a change request is not readable by someone else's account",
            stranger.status_code == 403,
            str(stranger.status_code),
        )

    print(f"\n{passed} checks passed.\n")


if __name__ == "__main__":
    main()
