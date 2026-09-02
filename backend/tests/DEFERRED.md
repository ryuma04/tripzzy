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
| Everything else | **not yet run to completion.** Last partial run reached 23% (107 tests) with zero failures before being stopped. |

The two highest-value deferred runs are the newest code, which has no
full-suite coverage at all:

```bash
./.venv/Scripts/python.exe -u -m pytest tests/test_bookings.py tests/test_operator.py -q --tb=short
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
