# Tripzyy — Backend

FastAPI + PostgreSQL + SQLAlchemy + Alembic + JWT.

Implements the full API described in `docs/IMPLEMENTATION_PLAN.md`, derived
from `Tripzyy_MASTER_SPEC.md`. **250 tests, 68 endpoints, 13 tables.**

---

## Setup

Requires Python 3.12 and a local PostgreSQL 18 instance.

```bash
cd backend
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.txt   # Windows
# source .venv/bin/activate && pip install -r requirements.txt  # macOS/Linux
```

Copy `.env.example` to `.env` and fill it in. The one value with no sensible
default is `DATABASE_URL`; generate `SECRET_KEY` with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Create the databases and apply the schema:

```bash
createdb -U postgres tripzyy
createdb -U postgres tripzyy_test      # only needed to run the tests
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

The suite runs against `tripzyy_test`, which it drops and rebuilds each run,
and refuses to start against any other database. It never sends email: the
fixtures blank the SMTP credentials regardless of what `.env` says.

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
