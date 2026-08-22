# Tripzyy — Implementation Plan

Derived from `Tripzyy_MASTER_SPEC.md`. This plan covers the full 12-screen
application: FastAPI + PostgreSQL 18 + Alembic + JWT backend, Next.js +
Tailwind frontend, with validation enforced on both sides and the backend
treated as the final authority.

---

## 0. Current State

| Area | State |
|---|---|
| `backend/` | Flat scaffold: `main.py`, `database.py`, `models.py` (only `User`), `schemas.py`, `auth.py`, `utils.py`. Async SQLAlchemy + asyncpg already chosen. OTP-over-SMTP registration + ImageKit upload helper present. |
| `frontend/` | Empty. |
| Alembic | Not set up. `create_all()` is called on startup. |
| DB | PostgreSQL 18 service running locally. No `tripzyy` database yet. |
| Git | Branch `squib`, single commit, single contributor. |

**Keep:** async SQLAlchemy/asyncpg, passlib bcrypt, python-jose, the general
dependency set.

**Restructure:** flat modules become the layered `app/` package the spec
mandates (§28).

**Replace:** the OTP/SMTP flow is torn out and rebuilt properly — see R1.
ImageKit becomes optional with a local-storage fallback.

### Decisions taken (2026-08-22)

| Question | Decision |
|---|---|
| Email verification | Remove the existing in-memory OTP; rebuild it DB-backed and properly validated (R1). |
| Scope order | **Backend first** — P0–P7 complete and tested, then the frontend. |
| §37 enhancements | All three: smart suggestions, AI itinerary generation, maps. Built **after** the core, per §37. |
| AI provider | **Groq** (OpenAI-compatible API), not Anthropic. Key supplied at that phase. |
| Git | The user handles all branching, committing and merging. This plan makes no commits. |


---

## 1. Target Backend Structure

```
backend/
├── app/
│   ├── main.py                  # app factory, CORS, routers, exception handlers
│   ├── core/
│   │   ├── config.py            # pydantic-settings, typed env
│   │   ├── security.py          # bcrypt, JWT encode/decode, jti
│   │   ├── deps.py              # get_db, get_current_user, require_admin
│   │   ├── exceptions.py        # AppError hierarchy + handlers
│   │   └── responses.py         # success/error envelope helpers (§25)
│   ├── db/
│   │   ├── base.py              # Base + model imports for Alembic autogenerate
│   │   └── session.py           # engine, AsyncSessionLocal, get_db
│   ├── models/                  # user, preference, trip, stop, destination,
│   │                            # activity, itinerary, transport,
│   │                            # accommodation, expense, saved_destination,
│   │                            # revoked_token
│   ├── schemas/                 # auth, user, trip, stop, activity, itinerary,
│   │                            # budget, expense, transport, accommodation,
│   │                            # community, admin, common
│   ├── routers/                 # auth, users, trips, stops, destinations,
│   │                            # activities, itinerary, budget, expenses,
│   │                            # transport, accommodations, community,
│   │                            # public, admin
│   ├── services/                # auth, trip, itinerary, budget, community,
│   │                            # admin — business rules + cross-table txns
│   ├── repositories/            # user, trip, stop, destination, activity,
│   │                            # expense — query layer
│   └── seed/
│       ├── destinations.json    # dev seed source (loaded INTO Postgres)
│       ├── activities.json
│       └── seed.py              # idempotent, run as `python -m app.seed.seed`
├── alembic/
├── tests/
├── requirements.txt
└── .env
```

Seed JSON is a **loader input only** — the running app always reads from
Postgres (§2.1, §38).

---

## 2. Database Schema

UUID primary keys throughout, exposed as strings (matching the spec's
`"stop_1"` / `"item_123"` string-ID examples). `Numeric(12,2)` for all money,
never float. All tables carry `created_at` / `updated_at`.

### `users`
`id`, `first_name`, `last_name`, `email` (unique, stored lowercased),
`phone`, `city`, `country`, `additional_info`, `hashed_password`,
`role` (`user` / `admin`), `status` (`active` / `suspended` / `deleted`),
`is_email_verified`, `avatar_url`

### `user_preferences` (1:1 with user)
`user_id` (unique FK), `currency`, `default_traveller_count`,
`preferred_categories` (JSONB), `home_city`, `home_country`,
`email_notifications`

### `destinations`
`id`, `name`, `country`, `region`, `description`, `cost_index`,
`popularity_score`, `image_url`, `latitude`, `longitude`

Unique on `(lower(name), lower(country))`. GIN trigram index on `name`.

### `activities` — the catalog of available activities per destination
`id`, `destination_id` FK, `title`, `description`, `category`
(`adventure` / `sightseeing` / `food` / `culture` / `nature` / `nightlife` /
`shopping` / `relaxation` / `other`), `estimated_cost`, `duration_minutes`,
`image_url`, `rating`, `is_active`

### `trips`
`id`, `user_id` FK, `title`, `description`, `start_date`, `end_date`,
`budget`, `traveller_count`, `currency`, `cover_image_url`, `status`
(`draft` / `upcoming` / `ongoing` / `completed`), `is_public`, `share_slug`
(unique, nullable), `cloned_from_trip_id` (nullable self-FK), `deleted_at`

### `trip_stops`
`id`, `trip_id` FK cascade, `destination_id` FK nullable, `city_name`,
`country`, `arrival_date`, `departure_date`, `order_index`, `notes`

Unique `(trip_id, order_index)`, **deferrable** so a reorder works inside one
transaction without tripping the constraint mid-update.

### `itinerary_activities`
`id`, `stop_id` FK cascade, `activity_id` FK nullable (catalog link),
`title`, `description`, `activity_date`, `start_time`, `end_time`,
`estimated_cost`, `category`, `order_index`, `notes`

Unique `(stop_id, order_index)`, deferrable.

### `transport`
`id`, `trip_id` FK cascade, `origin_stop_id` / `destination_stop_id`
(nullable FK), `transport_type` (`flight` / `train` / `bus` / `car` /
`ferry` / `other`), `provider`, `departure_time`, `arrival_time`, `cost`,
`booking_ref`, `notes`

### `accommodations`
`id`, `stop_id` FK cascade, `name`, `address`, `check_in`, `check_out`,
`estimated_cost`, `booking_url`, `notes`

### `expenses`
`id`, `trip_id` FK cascade, `stop_id` nullable FK, `category` (`transport` /
`accommodation` / `activities` / `meals` / `miscellaneous`), `title`,
`amount`, `expense_date`, `notes`

### `saved_destinations`
Composite PK `(user_id, destination_id)`

### `revoked_tokens`
`jti` PK, `user_id`, `expires_at` — backs a real `POST /auth/logout` (R2).

---

## 3. Validation Matrix

Every rule below is enforced in **Pydantic v2 + the service layer + a
Postgres constraint** wherever the DB can express it. The frontend gets the
mirrored rules via Zod in `lib/validation.ts`, but the backend is the final
authority (§2.3).

### Registration / user

| Field | Rule |
|---|---|
| `first_name`, `last_name` | required, trimmed, 1–50 chars, letters / space / period / apostrophe / hyphen only |
| `email` | required, RFC-checked via `EmailStr`, lowercased, max 255, **unique** (DB unique index plus a friendly 409) |
| `phone` | required, `^\+?[0-9]{7,15}$` after stripping spaces and dashes |
| `city`, `country` | required, 2–100 chars |
| `additional_info` | optional, max 1000 chars |
| `password` | 8–128 chars, at least one upper, one lower, one digit, one symbol; rejected if it contains the email local-part |
| `confirm_password` | must equal `password` (model validator) |
| `role` | **never accepted from the client** — always `user` on register |

### Trip

| Rule | Enforcement |
|---|---|
| `title` 3–120 chars, non-blank | Pydantic + CHECK |
| `start_date <= end_date` | model validator + `CHECK (start_date <= end_date)` |
| trip span at most 365 days | validator (sanity guard) |
| `budget >= 0`, max 2 decimal places | validator + `CHECK (budget >= 0)` |
| `traveller_count >= 1` and at most 50 | validator + `CHECK (traveller_count >= 1)` |
| `currency` 3-letter ISO-4217 | validator, default `INR` |
| shrinking dates would orphan stops | **409** listing the conflicts, unless `?cascade=true` (R9) |

### Stop

- `trip.start_date <= arrival_date`
- `departure_date <= trip.end_date`
- `arrival_date <= departure_date`
- `city_name` required, 2–100 chars
- `destination_id`, if supplied, must exist
- overlapping stop date ranges produce a **warning, not a rejection** (R6)
- `order_index >= 0`, kept contiguous after every mutation

### Itinerary activity

- parent stop must exist and belong to the caller's trip
- `stop.arrival_date <= activity_date <= stop.departure_date`
- `start_time < end_time` when both are present
- `end_time` without `start_time` is rejected
- `estimated_cost >= 0`
- `title` 2–120 chars
- overlapping times on the same day produce a **warning** (R6)

### Transport

`departure_time < arrival_time`; `cost >= 0`; both stops must belong to the
same trip; `origin_stop_id != destination_stop_id`; times must fall inside
the trip's date range.

### Accommodation

`check_in <= check_out`; the range must sit inside the parent stop's dates;
`estimated_cost >= 0`; `booking_url` must be a valid http(s) URL if present.

### Expense

`amount > 0` strictly (§31) plus `CHECK (amount > 0)`; `category` must be one
of the five enum values; `expense_date` must fall within the trip range with
a one-day grace on each side; `title` 2–120 chars.

### Pagination and search

`page >= 1`; `1 <= limit <= 100`; `sort_by` restricted to a per-endpoint
allowlist; `sort_order` in `{asc, desc}`; `min_cost <= max_cost`; `q` at most
100 chars and escaped before it reaches `ILIKE`.

### Authorization — every private resource

`current_user.id == trip.user_id`, resolved through the parent chain for
stops, activities, expenses, transport and accommodations. Wrong owner gives
**403**; a non-existent resource gives **404**. Admin routes additionally
require `role == "admin"`.

---

## 4. API Surface

The full §27 tree, all under `/api/v1`, every response wrapped in the §25
envelope:

```json
{ "success": true, "message": "...", "data": {}, "error": null }
```

Paginated payloads put `{ "items": [], "pagination": {} }` **inside** `data`,
which reconciles §25 with §26. Errors use stable codes: `VALIDATION_ERROR`,
`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`,
`INTERNAL_ERROR`. FastAPI's own `RequestValidationError` is remapped into the
same shape with per-field `details`.

Behaviours worth calling out:

- `GET /trips` — filters `status`, `page`, `limit`, `sort_by`, `sort_order`,
  plus a `q` title search.
- `PUT /trips/{id}/stops/reorder` — takes the full ordered ID list, verifies
  it is an exact permutation of that trip's stops, applies it in one
  transaction against the deferrable unique constraint.
- `GET /trips/{id}/budget` — planned cost (activities + transport +
  accommodation) against `budget` against actual expenses, broken down by the
  five categories, plus `remaining` and `over_budget`.
- `GET /trips/{id}/calendar` — flattens activities, transport legs and
  accommodation check-in/check-out into `events[]` per §17.
- `POST /trips/{id}/share` — generates a URL-safe slug; `DELETE` clears it and
  flips `is_public`.
- `POST /public/trips/{slug}/clone` — deep copy inside one transaction, dates
  rebased onto the cloner's requested start date, `cloned_from_trip_id` set,
  `is_public` reset to false.
- `/admin/*` — dashboard counters, user list and detail, status toggle, and
  three analytics endpoints (trips over time, top destinations, top
  activities).

---

## 5. Frontend Plan

Next.js 15 App Router + TypeScript + Tailwind v4. `lib/api.ts` is a single
typed fetch wrapper that unwraps the envelope and throws a typed `ApiError`.
`lib/validation.ts` holds Zod schemas mirroring §3. Forms use
`react-hook-form` with `@hookform/resolvers/zod`; server state via TanStack
Query.

| Screen | Route |
|---|---|
| 1 Login | `/login` |
| 2 Registration | `/register` |
| 3 Landing | `/dashboard` |
| 4 Create Trip | `/trips/new` |
| 5 Build Itinerary | `/trips/[tripId]/build` |
| 6 Trip Listing | `/trips` with Ongoing / Upcoming / Completed tabs |
| 7 Profile | `/profile` |
| 8 Search | `/destinations`, `/activities` |
| 9 Itinerary + Budget | `/trips/[tripId]` |
| 10 Community | `/community`, plus public `/t/[slug]` |
| 11 Calendar | `/calendar`, `/trips/[tripId]/calendar` |
| 12 Admin | `/admin`, route-guarded on role |

Middleware guards authenticated routes. The admin group checks role
client-side for UX *and* the backend enforces it independently — the frontend
guard is never the security boundary. Responsive at 360 / 768 / 1280.

---

## 6. Build Phases

| Phase | Content | Verification |
|---|---|---|
| **P0** | Restructure backend into `app/`, config, envelope, exception handlers, Alembic init, create the `tripzyy` database | `alembic upgrade head` runs clean; `/health` returns 200 |
| **P1** | All models, first migration, seed script (~40 destinations, ~200 activities) | rows present in Postgres |
| **P2** | Auth: register / login / logout / me, JWT, revocation, password rules; users and preferences | pytest auth suite green |
| **P3** | Trips CRUD, status computation, ownership guard, pagination / filter / sort | pytest trips suite |
| **P4** | Destination and activity search; stops; itinerary activities; reorder; transport; accommodation | pytest itinerary suite |
| **P5** | Budget, expenses, calendar | pytest budget suite |
| **P6** | Share, public trip, community listing, clone | pytest community suite |
| **P7** | Admin dashboard, analytics, user status | pytest admin suite |
| **P8** | Frontend: scaffold, auth screens, dashboard and trips, itinerary builder, budget and calendar, community, admin | manual pass over §40 |
| **P9** | End-to-end §40 walkthrough, seeded demo data, README | full flow works |
| **P10** | §37 enhancements: scored suggestions, Groq itinerary generation, Leaflet maps | each degrades cleanly when unavailable |

Backend-first, as decided: P0–P7 ship a complete, pytest-covered API before
any frontend work begins. `/docs` is the interim demo surface.

---

## 7. Suggested Refinements

**R1 — Rebuild the OTP/SMTP flow.** *Note: the spec does not require email
verification at all — §5 lists nine registration fields and six validation
rules, none of them about verifying the address. This is an addition on top
of the spec.* The existing implementation is torn out and rewritten:

- `email_verification_codes` table replaces the in-process `otp_store` dict,
  which loses every pending code on restart and cannot work across workers.
- Codes are stored **hashed** (bcrypt), never in plaintext.
- 6 digits, 10-minute expiry, max 5 verify attempts, then the code is burned.
- Resend throttled to one per 60 seconds, max 5 per hour per address.
- Single-use: consumed atomically inside the verifying transaction.
- Registration is **transactional** — the current code emails the OTP *before*
  inserting the user, so a failed insert leaves a live code for a
  non-existent account.
- `aiosmtplib` moves behind an `EmailService` with STARTTLS, a timeout, and
  structured logging.
- `REQUIRE_EMAIL_VERIFICATION` config flag exists so pytest and local
  development do not need a live mailbox; it is on by default in `.env`.

ImageKit gets the same treatment — fall back to local `/uploads` static
storage when keys are absent, so §2.1 holds.

**R2 — Real logout.** JWT is stateless, so `POST /auth/logout` is meaningless
without server state. Adding a `jti` claim and a small `revoked_tokens` table
makes logout genuinely invalidate the token. Cheap, and it closes an obvious
demo question.

**R3 — Define `draft` precisely.** §10 lists `draft` as a status but also
says status is computed from dates — and `draft` is not derivable from dates.
Proposal: `draft` is an explicit flag (the trip has no stops yet, or the user
has not pressed Publish); once it has at least one stop it enters the
computed `upcoming` / `ongoing` / `completed` ladder. Status is always
recomputed server-side on read, never trusted from the client.

**R4 — Refresh tokens.** A 30-minute access token is short for a live demo. A
7-day refresh token in an httpOnly cookie avoids mid-demo logouts without
weakening the access token.

**R5 — Rate limit auth endpoints.** An in-process sliding window, no Redis
needed, on `/auth/login` and `/auth/register` at 10/min per IP.

**R6 — Warnings channel.** Overlapping stops and overlapping activity times
are realistic user mistakes but not genuinely invalid. Rather than block,
return `data.warnings[]` alongside the created resource so the UI can flag
them. Hard rules stay hard errors.

**R7 — `pg_trgm` fuzzy search.** Plain `ILIKE '%goa%'` misses typos. Enabling
`pg_trgm` plus a GIN index gives fuzzy destination and activity search in a
one-line migration with no external service.

**R8 — Soft-delete trips.** `deleted_at` rather than a hard `DELETE` protects
against a mis-click wiping a demo trip and keeps admin analytics honest.

**R9 — Cascade-safety on trip date edits.** Shrinking a trip's dates can
strand stops and activities outside the range. Reject by default with the
list of conflicts; allow `?cascade=true` to clamp them explicitly.

**R10 — Seed a demo dataset and an admin user.** A `--demo` flag on the seed
script creates one admin, two normal users, and a fully-built shared
multi-city trip, so the community and clone flows are demonstrable the moment
the app starts.

**R11 — Git is handled by the team.** Per the user's decision, this plan makes
no commits, branches or merges; everything is left in the working tree. §2.5's
`feature/*` flow and multi-contributor history remain the team's to manage.

**R12 — Tests and OpenAPI.** pytest + httpx against a throwaway test
database, focused on the validation matrix in §3. FastAPI's `/docs` comes
free and doubles as API documentation for the judges.

---

## 8. §37 Enhancements (P10 — after the core works)

All three are additive and must degrade cleanly. §38 is explicit that the AI
must not become the main functionality, so none of these sit on the critical
path of §40's Definition of Done.

**E1 — Smart activity suggestions.** *Distinct from the core requirement:* §7
(Screen 4) already requires dynamic destination/activity suggestions, so a
plain `GET /destinations/{id}/suggestions` ships in **P4** as core. The
enhancement is the scoring layer on top — rank catalog activities by
remaining budget, trip duration, the user's `preferred_categories`, and what
is already in the itinerary. Pure SQL plus a scoring function; no API key, no
network call.

**E2 — AI itinerary generation (Groq).** `POST /api/v1/ai/itinerary/generate`
takes a natural-language brief (cities, days, budget, travellers, interests)
and returns a **proposal**, not a saved trip. Design points:

- Groq exposes an OpenAI-compatible API, so the `openai` SDK pointed at
  `https://api.groq.com/openai/v1` is the client; `GROQ_API_KEY` in `.env`.
- The model returns strict JSON, which is then parsed into the *same* Pydantic
  schemas used by the manual endpoints — so §37's "the proposal must be
  validated before being saved" is enforced by construction, not by trusting
  the model.
- Anything failing validation is dropped and reported in
  `data.rejected[]`; the user reviews the proposal and explicitly accepts it
  via a second call that persists inside one transaction.
- Cities and activities are matched against the real `destinations` /
  `activities` tables where possible, so the output is DB-backed rather than
  hallucinated.
- Missing key or a Groq outage returns a clean 503 and the manual builder
  keeps working — §2.1 and §38 both require this.

**E3 — Maps.** Leaflet + OpenStreetMap tiles on the itinerary and calendar
views, plotting stop coordinates from `destinations.latitude/longitude`. No
API key, no vendor account.

---

## 9. Assumptions

1. Currency defaults to `INR` (the spec shows ₹) but is stored per trip.
2. Money is `Numeric(12,2)`, never float.
3. Timestamps are stored UTC; pure date fields (`start_date`,
   `arrival_date`, `activity_date`) are stored as `DATE`.
4. `GET /api/v1/community/trips` lists public trips; the share-slug route is
   the deep link into one.
5. Admin accounts are created by the seed script, never via public
   registration.
