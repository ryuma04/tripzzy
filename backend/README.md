# Tripzyy — Backend

FastAPI + PostgreSQL + SQLAlchemy + Alembic + JWT.

**219 tests, 89 endpoints, 16 tables.**

Section references in the comments (`spec section 14`, `refinement R3`) point at
a master spec and implementation plan that were removed from the repository in
commit `1efb309`. They are kept because they still explain *why* a rule exists,
but the documents themselves are no longer here.

---

## Setup

Requires Python 3.12. PostgreSQL is hosted on Neon — there is nothing to
install or start locally.

```bash
cd backend
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.txt   # Windows
# source .venv/bin/activate && pip install -r requirements.txt  # macOS/Linux
```

Copy `.env.example` to `.env` and fill it in. The one value with no sensible
default is `DATABASE_URL` — the Neon connection string, with the driver prefix
changed to `postgresql+asyncpg://`. Generate `SECRET_KEY` with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Apply the schema. The database itself already exists on Neon:

```bash
python -m alembic upgrade head
```

Load the catalog (40 destinations, 212 activities). `--demo` additionally
creates an admin, two travellers and a fully-built shared trip so the
community and clone flows are demonstrable immediately:

```bash
python -m app.seed.seed --demo
```

Re-running the seed is safe: existing rows are updated in place, never
duplicated.

Run it:

```bash
python -m uvicorn app.main:app --reload
```

Interactive API docs: <http://127.0.0.1:8000/docs>

### Demo accounts

| Email | Password | Role |
|---|---|---|
| `admin@tripzyy.com` | `Admin@123` | admin |
| `traveller@tripzyy.com` | `Travel@123` | user |
| `explorer@tripzyy.com` | `Explore@123` | user |

---

## Tests

```bash
python -m pytest                      # full suite
python -m pytest tests/test_trips.py  # one file
```

The suite creates a `tripzyy_test` **schema** inside the same Neon database,
builds every table and enum inside it, and drops it again at the end. It never
touches `public`, where the real data lives: SQLAlchemy is configured with a
`schema_translate_map`, so table names are fully qualified in the emitted SQL
rather than resolved through `search_path` — which PgBouncer silently discards.
A guard refuses to run at all if that mapping is ever missing.

Tests connect through Neon's *direct* endpoint rather than the `-pooler` one.
Recreating the schema gives the enum types new OIDs each run, and a pooled
backend that was introspected against the old ones fails the next insert with
`cache lookup failed for type NNNNN`.

Set `TEST_DATABASE_URL` to run against a separate instance or a Neon branch.
The suite never sends email: the fixtures blank the SMTP credentials
regardless of what `.env` says.

End-to-end walkthrough of the spec's own "Definition of Done", against a
running server:

```bash
python scripts/e2e_check.py http://127.0.0.1:8000
```

---

## Layout

```
app/
├── core/          config, security, deps, exceptions, response envelope,
│                  validators, rate limiting
├── db/            engine, session, declarative base
├── models/        13 SQLAlchemy models
├── schemas/       Pydantic request/response models
├── repositories/  query layer
├── services/      business rules and cross-table transactions
├── routers/       HTTP layer
└── seed/          catalog JSON + idempotent loader
```

The seed JSON is a **loader input only**. The running application always
reads PostgreSQL (spec §2.1, §38).

---

## Conventions

**Every** response uses one envelope (spec §25):

```json
{ "success": true, "message": "...", "data": {}, "error": null }
```

Errors carry a stable code — `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`,
`NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`,
`INTERNAL_ERROR` — so the frontend branches on `error.code`, never on message
text. Field-level problems arrive as `error.details.fields`.

Paginated payloads nest `{ "items": [], "pagination": {} }` inside `data`,
which satisfies §25 and §26 together.

**Money is always a string** (`"40000.00"`), never a JSON float. Values are
`Numeric(12,2)` in PostgreSQL and `Decimal` in Python; encoding them as
strings keeps the exact value intact across the wire.

**Validation happens three times**: Pydantic, then the service layer, then a
PostgreSQL `CHECK` or unique constraint wherever the database can express the
rule. Cross-field rules that depend on unsent values (partial updates) are
finished in the service, which can see the stored row.

**Ownership is resolved server-side** through the parent chain — activity →
stop → trip → user. A resource belonging to someone else returns 403; one
that does not exist returns 404. The frontend is never the security boundary.

---

## Notes on the implementation

A few decisions worth knowing about, all covered in the plan document:

- **`draft` status.** §10 says status is computed from dates but also lists
  `draft`, which no date arithmetic produces. A trip with no stops is a
  draft; once it has one it enters the `upcoming`/`ongoing`/`completed`
  ladder. Status is derived in SQL on every read and filter, so the stored
  column is only ever a cache.
- **Logout is real.** JWTs are stateless, so `POST /auth/logout` records the
  token's `jti` in `revoked_tokens` until it would have expired anyway.
- **Email verification is optional.** `REQUIRE_EMAIL_VERIFICATION=false` lets
  registration complete with no mailbox, so the core app never depends on an
  external service. Codes are stored bcrypt-hashed with expiry, an attempt
  cap and resend throttling.
- **`/itinerary-activities/{id}`** deviates from §27 deliberately: the spec
  puts catalog reads and scheduled-activity writes on the same
  `/activities/{id}` path, but they are different entities with different
  owners. Catalog reads stay on `/activities`.
- **Trip deletion is soft.** `deleted_at` is set; the row survives so clones
  and analytics stay coherent. Deleted trips disappear from every query.
- **Reordering** takes the complete ordering and verifies it is an exact
  permutation before applying it in one transaction, against a DEFERRABLE
  unique constraint on `(parent_id, order_index)`.
