# Deferred verification

The suite runs against hosted Neon in Singapore. `NullPool` (required because
pytest-asyncio runs fixtures and tests on different event loops) means every
session pays a fresh TLS handshake, so it is ~6.5s per test — 25-40 minutes
for the whole thing. Rather than block each phase on that, these runs are
deferred to a single pass once all phases are in.

## Run once, at the end

```bash
cd backend
./.venv/Scripts/python.exe -u -m pytest -q --tb=short
```

## Status at time of writing

| Suite | State |
|---|---|
| `tests/test_bill_splits.py` (31) | **passing** — run in full |
| `tests/test_inventory.py` (25) | **passing** — run in full |
| `tests/test_auth.py` (25) | **passing** — run in full |
| `tests/test_bookings.py` (13 of ~30) | **partially run.** The pure refund-arithmetic and gateway tests pass. The API tests (quote / pay / cancel) have **not** been run — but the same flows were verified live against the seeded database by hand, including the deposit-then-balance path and both cancellation-policy extremes. |
| `tests/test_operator.py` (26) | **not run.** Every test needs the database. Collection and imports verified only. The console was exercised live end to end instead — see below. |
| `tests/test_adaptation.py` (59) | **partially run.** The 33 pure tests -- impact arithmetic, conflict detection, proposal validation, the narration fallback -- were run in full and pass. The 26 database-backed ones have **not** been run; the same flows were driven live instead by `scripts/adaptation_check.py`, 57 assertions, all green. |
| `tests/test_engagement.py` (32) | **partially run.** The 8 pure tests -- schema bounds, the subject/column mapping, the concierge's offline fallback -- were run in full and pass. The 24 database-backed ones have **not** been run; the same flows were driven live by `scripts/engagement_check.py`, 29 assertions, all green. |
| Everything else | **not yet run to completion.** Last partial run reached 23% (107 tests) with zero failures before being stopped. |

The two highest-value deferred runs are the newest code, which has no
full-suite coverage at all:

```bash
./.venv/Scripts/python.exe -u -m pytest tests/test_bookings.py tests/test_operator.py tests/test_adaptation.py tests/test_engagement.py -q --tb=short
```

### What was verified by hand instead

**Bookings** — quote → book → 20% deposit (`pending_payment`) → balance
(`confirmed`) → paying again rejected with 409; cancelling a flexible stay
refunded in full, cancelling a non-refundable activity refunded nothing and
retained the penalty.

**Operator console** — owner and coordinator admitted, traveller refused 403;
a coordinator blocked from creating a departure (manager-only); two travellers
booked through the operator and appeared as customers with lifetime value;
schedule grouped 4 committed services across 2 days; a departure auto-flipped
to `full` at 4/4 seats; a duplicate booking rejected with 409; payments ledger
reconciled to INR 21,840 captured.

The cross-operator **scoping** assertions in `test_operator.py` are the ones
that most need the real run — they are the security boundary, and the live
check used only a single operator's own data.

Files never yet run end to end in this checkout: `test_admin.py`,
`test_budget.py`, `test_community.py`, `test_itinerary.py`,
`test_places_router.py`, `test_search.py`, `test_trips.py`.

`test_itinerary.py` and `test_trips.py` deserve particular attention on the
full run: Phase 5 hooked the shared conflict engine into all four itinerary
write paths, so those endpoints now return **more** warnings than they did.
The two existing assertions only check that warnings are non-empty, so they
should still pass -- but that is the change most likely to surprise.

**Assist and reviews** -- `scripts/engagement_check.py` drove the loop live:
a thread opened and routed to the operator; the concierge answered immediately
and was labelled AI with no author; an AI reply did *not* resolve the thread;
a bystander was refused (403); the thread reached the operator queue; a
coordinator's reply claimed it and resolved it; a traveller reply reopened it.
Then reviews: the booked component appeared as pending, the review was created
and marked verified against its booking, **the rating the ranker reads actually
moved**, the public listing carried a distribution, reviewing something never
booked was refused (403), a duplicate was refused (409), editing someone
else's was refused (403), and deleting recomputed the aggregate.

`test_trips.py` was run separately earlier and was green apart from
`test_search_by_title`, which caught a real bug (the `/trips` router never
declared its `q` parameter) — since fixed, but the fix has not been re-run
against that file.

## Making it fast (optional)

Needs `pytest-asyncio >= 0.26` for `asyncio_default_test_loop_scope = session`,
which would allow a real connection pool instead of `NullPool`. The pin in
`requirements.txt` is 0.25.0, which has no such option. This is a dependency
bump, so it is called out rather than done silently.

## While running

Leave the network alone. Running `alembic`, `npm run build`, or a smoke script
alongside the suite slowed it to minutes per test and once caused a
mid-migration connection drop. Never run two suites at once either — they
share the `tripzyy_test` schema.
