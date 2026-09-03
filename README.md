# Tripzyy

**A personalised and dynamic tour planning and operations platform.**

Two sides, one system. Travellers compose a tour out of swappable components
instead of buying a fixed package. Tour operators get a console to run the
customers, vendors, bookings, payments, departures and coordinators behind it.

The part worth looking at is what happens when something goes wrong.

---

## The differentiator: dynamic tour management

Most planners describe a trip that is going to plan. Tripzyy describes what
happens when it is not.

Any proposed change — a date shift, a swapped hotel, a cancelled activity, a
bigger party — is turned into a costed **impact report** before anyone commits
to it:

| The report answers | Computed from |
|---|---|
| What does it cost? | Cancellation terms **snapshotted onto the booking** at purchase, not the vendor's current policy |
| What breaks? | Schedule clashes, orphaned transfers, hotels stranded by a moved stop, paid-for components now outside the trip |
| Can it even be done? | Real per-date capacity in `service_availability` |
| Does it suit *this* traveller? | Their stated pace, comfort tier and interests |
| What else could work? | A ranked shortlist, each option carrying the score breakdown that put it there |

Every figure traces to a row. The AI layer *narrates* that report in plain
English; it never produces it. When a language model and the engine disagree
about a refund, the engine is right — a model guessing at somebody's money is
precisely the failure this architecture is arranged to avoid.

Three properties hold it together:

**Assessment never writes.** Previewing "what if I moved this to Thursday"
simulates the shifted itinerary in memory to run the conflict checks against
it, then discards the simulation. A preview must not move anything.

**The report is frozen at submission.** Prices and availability drift between a
traveller submitting and an operator reviewing. The stored report is what was
agreed; a live one is only ever a preview. The operator approves the same
numbers the traveller saw.

**Approving *is* applying, in one transaction.** Cancelling the old hotel,
booking the replacement, refunding the difference and rewriting the itinerary
all land together or none of them do. There is no second "now apply it" step to
forget — an approved-but-unapplied change is how a traveller ends up believing
they have a bed they do not have.

Operators can also fire a **disruption** — a storm in Goa, a vendor pulling
out — and the engine immediately costs the blast radius: every committed
component at risk, what each is worth, what cancelling each would refund under
the terms already agreed, and a ranked replacement for every one. That is the
difference between an alert and an answer.

---

## The lifecycle, end to end

Discover → Personalize → Plan → Price → Book → Prepare → Operate → **Assist** →
**Adapt** → Complete → **Review**

| Stage | What's there |
|---|---|
| **Discover** | 40 destinations, 212 activities, Google Places lookup, community trips to clone |
| **Personalize** | Travel style, pace, comfort tier, interests, dietary and mobility needs — all nullable, because "not stated" is not "no preference" |
| **Plan** | Multi-city stops, day-by-day itinerary, drag-to-reorder, interactive Leaflet route map |
| **Price** | Live itemised quote from real vendor inventory, with seasonal per-date overrides |
| **Book** | Bookings, booking items, and a simulated payment gateway with a real state machine — deposits, instalments, partial refunds, injectable failure. No external keys, nothing to fail mid-demo |
| **Prepare** | Itinerary PDF, budget breakdown, bill splitting across real accounts |
| **Operate** | Operator console: dashboard, customers, bookings, vendors, inventory, departures, coordinators, payments ledger, schedule board |
| **Assist** | Traveller ↔ coordinator threads, with an AI concierge that answers from the trip's own data — always labelled as AI, and unable to change anything |
| **Adapt** | The impact engine, change-request queue and disruption simulator described above |
| **Complete / Review** | Verified reviews that feed straight back into the component ranker |

Review closes the loop: a rating is written onto the row the ranker reads, so
it changes what the *next* traveller is recommended. That is why a review is
refused unless the author holds a booking that actually contains the thing
being reviewed — an unverifiable rating is not noise, it is a wrong
recommendation.

---

## Stack

| | |
|---|---|
| **Backend** | FastAPI · SQLAlchemy 2.0 (async, `asyncpg`) · Alembic · Pydantic v2 · PyJWT + Passlib |
| **Database** | PostgreSQL on [Neon](https://neon.tech) — hosted, nothing to install locally |
| **Frontend** | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Framer Motion · Leaflet · Recharts |
| **AI** | Groq (`openai/gpt-oss-120b`), for narration and the concierge only — never for arithmetic |
| **Email** | `aiosmtplib` for OTP verification |
| **Tests** | pytest + pytest-asyncio |

**458 tests · 142 endpoints · 31 tables.**

---

## Setup

Requires **Python 3.12** and **Node 20+**. PostgreSQL is hosted on Neon, so
there is no local database to install or start.

### Backend

```bash
cd backend
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.txt   # Windows
# source .venv/bin/activate && pip install -r requirements.txt  # macOS/Linux
```

Copy `.env.example` to `.env` and fill it in. The one value with no sensible
default is `DATABASE_URL` — your Neon connection string, with the driver prefix
changed to `postgresql+asyncpg://`. Generate `SECRET_KEY` with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Apply the schema and load the catalogue. `--demo` also creates an admin, two
travellers, an operator with staff, a vendor book with graded inventory, and a
fully-built shared trip — so every flow is demonstrable immediately:

```bash
python -m alembic upgrade head
python -m app.seed.seed --demo
python -m uvicorn app.main:app --reload
```

Re-running the seed is safe: existing rows are updated in place, never
duplicated. Interactive API docs at <http://127.0.0.1:8000/docs>.

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local     # set NEXT_PUBLIC_API_URL
npm run dev
```

Open <http://localhost:3000>.

### Demo accounts

| Email | Password | What they see |
|---|---|---|
| `traveller@tripzyy.com` | `Travel@123` | The traveller app |
| `explorer@tripzyy.com` | `Explore@123` | A second traveller |
| `operator@tripzyy.com` | `Operate@123` | The operator console (owner) |
| `coordinator@tripzyy.com` | `Coord@123` | The console as a coordinator |
| `admin@tripzyy.com` | `Admin@123` | Platform admin |

Operator access comes from being on an operator's **roster**, not from an
account type — the same person can be a traveller on their own trips and a
coordinator at work, and a platform admin is not automatically operator staff.

---

## Walking the demo

```bash
python scripts/e2e_check.py         # the core traveller flow
python scripts/adaptation_check.py  # the differentiator, 57 assertions
python scripts/engagement_check.py  # assist + reviews, 29 assertions
```

Each drives a running server end to end and exits non-zero on the first
failure. They assert on *figures the engine produced*, not merely on status
codes — an impact report that is cheerfully wrong is worse than one that
errors.

`adaptation_check.py` doubles as the demo script: book → pay → preview a change
and see it costed → submit → the operator reviews the same frozen numbers →
approve → the itinerary, the bookings and the money all move together → fire a
disruption → recover from it.

---

## Key endpoints

Everything is under `/api/v1`.

**Adaptation**

| Endpoint | |
|---|---|
| `POST /trips/{id}/assess-change` | Cost a change. Writes nothing. `?explain=true` adds the narration |
| `POST /trips/{id}/change-requests` | Submit one, freezing the report onto it |
| `GET /trips/{id}/conflicts` | Standing health check on an itinerary |
| `POST /operator/change-requests/{id}/decision` | approve / counter / reject |
| `POST /operator/disruptions` | Raise an incident, costed on creation |
| `POST /operator/disruptions/{id}/items/{item}/recover` | Raise the recommended swap for the traveller |

**Assist & reviews**

| Endpoint | |
|---|---|
| `POST /trips/{id}/assist` | Ask for help; the concierge answers immediately |
| `POST /operator/assist/{id}/messages` | Coordinator replies, optionally resolving |
| `POST /reviews` | Rate something you actually booked |
| `GET /reviews/pending` | What you went to and have not yet rated |
| `GET /reviews/{subject}/{target_id}` | Public reviews plus rating distribution |

---

## Conventions

**Every** response uses one envelope:

```json
{ "success": true, "message": "...", "data": {}, "error": null }
```

Errors carry a stable code — `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`,
`NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`,
`INTERNAL_ERROR` — so the frontend branches on `error.code`, never on message
text. Field-level problems arrive as `error.details.fields`. Paginated payloads
nest `{ "items": [], "pagination": {} }` inside `data`.

**Money is always a string** (`"40000.00"`), never a JSON float. Values are
`Numeric(12,2)` in PostgreSQL and `Decimal` in Python; encoding them as strings
keeps the exact value intact across the wire. Coerce with `Number(...)` in the
frontend before formatting or doing arithmetic.

**Validation happens three times**: Pydantic, then the service layer, then a
PostgreSQL `CHECK` or unique constraint wherever the database can express the
rule.

**Ownership is resolved server-side** through the parent chain — activity →
stop → trip → user. Someone else's resource returns 403; one that does not
exist returns 404. Operator scoping is resolved from the caller's membership,
and **no operator endpoint accepts an `operator_id`** — there is deliberately
no parameter anyone could change to reach another operator's customers,
vendors or money. The frontend is never the security boundary.

**Conflicts are reported, never enforced.** The database's `CHECK` constraints
already reject data that is *invalid*; the conflict engine is about
arrangements that are merely unwise, and a traveller who genuinely wants ninety
minutes between landing and a walking tour is allowed to have it.

---

## Layout

```
backend/
├── app/
│   ├── core/          config, security, deps, exceptions, response envelope
│   ├── db/            engine, session, declarative base
│   ├── models/        SQLAlchemy models (31 tables)
│   ├── schemas/       Pydantic request/response models
│   ├── services/      business rules and cross-table transactions
│   ├── routers/       HTTP layer
│   └── seed/          catalogue JSON + idempotent loader
├── alembic/versions/  migration chain
├── scripts/           end-to-end check scripts
└── tests/

frontend/src/
├── app/(app)/         authenticated pages
├── app/(auth)/        login, register
├── components/        adaptation, engagement, booking, budget, itinerary, map, ui
├── services/          typed API clients
└── types/             shared response types
```

The seed JSON is a **loader input only**. The running application always reads
PostgreSQL.

The three modules that carry the differentiator are worth reading in order:
`services/conflict_service.py` (the rules, held once and called from both the
itinerary endpoints and the engine), `services/inventory_service.py` (the
ranker, deterministic and explainable), and `services/adaptation_service.py`
(the impact report, and applying it atomically).

---

## Notes on the implementation

- **Neon's pooler breaks asyncpg.** PgBouncer transaction pooling is
  incompatible with asyncpg's prepared-statement cache; both caches are
  disabled, at different layers. Tests run against the *direct* endpoint —
  recreating the test schema gives enum types new OIDs, and a pooled backend
  introspected against the old ones fails the next insert.
- **Tests use a `tripzyy_test` schema** inside the same Neon database via
  SQLAlchemy's `schema_translate_map`, never `search_path` (PgBouncer silently
  discards it). A guard refuses to run if that mapping is missing, so the suite
  can never touch `public`.
- **Payments are simulated but not simplified.** Authorisation and capture stay
  distinct because refund arithmetic depends on the difference: an authorised
  but uncaptured payment is voided, a captured one is refunded.
- **Cancellation terms are snapshotted** onto each booking item at purchase.
  The refund a traveller is owed is the one that applied when they paid, not
  whatever the vendor's policy says today.
- **A booking item is the spine.** It ties an itinerary element to a piece of
  vendor inventory on a date at an agreed price, and it is what the adaptation
  engine operates on. A replaced item survives with a pointer to its
  successor, so a change has an auditable before and after.
- **Logout is real.** JWTs are stateless, so `POST /auth/logout` records the
  token's `jti` until it would have expired anyway.
- **Trip deletion is soft.** `deleted_at` is set; the row survives so clones
  and analytics stay coherent.
- **Demo data is behind `NEXT_PUBLIC_DEMO_MODE`** and is never silently
  substituted for a failed API call — a broken integration shows an error
  state, not fabricated trips.
- **AI is optional everywhere.** Every model call has a deterministic fallback,
  and a rate-limited or missing `GROQ_API_KEY` degrades the prose while leaving
  every number and every flow intact.
