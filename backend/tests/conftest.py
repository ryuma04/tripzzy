"""Test fixtures.

PostgreSQL is hosted (Neon), and there is no local server to spin a throwaway
database up on. So the suite isolates itself in a dedicated ``tripzyy_test``
**schema** inside the same database instead: every table and enum it creates
lands there, and the whole schema is dropped at the end of the session. The
application's own tables live in ``public`` and are never in the search path,
so a test cannot see -- let alone truncate -- real data.

Set ``TEST_DATABASE_URL`` to point the suite at a different instance (a Neon
branch, say). It falls back to ``DATABASE_URL``.

Email verification and rate limiting are disabled by default; the tests that
cover them turn them back on explicitly.
"""


import os
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio

# The schema the suite owns. Everything it creates is namespaced here, and
# ``_schema`` drops it wholesale on the way out.
TEST_SCHEMA = "tripzyy_test"

# Must be set before app.core.config is imported anywhere.
if os.environ.get("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ["REQUIRE_EMAIL_VERIFICATION"] = "false"
os.environ["RATE_LIMIT_ENABLED"] = "false"
# Blank the SMTP credentials that .env supplies, so the suite can never send
# a real email. Without this, every registration test would try to reach
# Gmail and the run would crawl.
os.environ["SMTP_SERVER"] = ""
os.environ["SMTP_USERNAME"] = ""
os.environ["SMTP_PASSWORD"] = ""
os.environ["ENVIRONMENT"] = "test"
os.environ["DEBUG"] = "false"
# Minimum bcrypt cost: hashing otherwise dominates the run time.
os.environ["BCRYPT_ROUNDS"] = "4"
os.environ.setdefault(
    "SECRET_KEY", "test-secret-key-that-is-definitely-long-enough-1234567890"
)

from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.rate_limit import limiter  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Destination, User  # noqa: E402
from app.models.enums import UserRole  # noqa: E402
from app.core.security import hash_password  # noqa: E402

# NullPool is essential here: pytest-asyncio runs session-scoped fixtures and
# function-scoped tests on *different* event loops, and a pooled asyncpg
# connection cannot be reused across loops. NullPool opens a fresh connection
# per checkout, so every loop gets its own.
#
def _direct_endpoint(url: str) -> str:
    """Route tests at Neon's direct endpoint rather than its PgBouncer one.

    The suite drops and recreates its schema on every run, which gives the
    enum types new OIDs each time. Through the ``-pooler`` endpoint those runs
    land on server connections that were already introspected against the
    previous OIDs, and the next INSERT dies with ``cache lookup failed for
    type NNNNN`` on a cast like ``$9::tripzyy_test.user_role``. Disabling the
    statement caches is not enough, because the stale state lives in the
    pooled backend rather than in the driver.

    The application keeps using the pooler -- it never redefines types, and it
    wants the connection multiplexing. Tests do not.
    """
    return url.replace("-pooler.", ".", 1)


# Isolation is done with ``schema_translate_map``, not ``search_path``.
#
# The obvious approach -- passing ``search_path`` in asyncpg's server_settings
# -- does not survive the connection: PgBouncer does not forward arbitrary
# startup parameters, so it is silently discarded and every name resolves in
# ``public`` instead. ``SET search_path`` per connection is no better, because
# transaction pooling can hand the next transaction to a different backend.
#
# schema_translate_map sidesteps all of that by making SQLAlchemy emit
# fully-qualified ``tripzyy_test.<table>`` in the SQL itself, so correctness
# never depends on connection state.
engine = create_async_engine(
    _direct_endpoint(settings.database_url_str),
    poolclass=NullPool,
).execution_options(schema_translate_map={None: TEST_SCHEMA})

TestSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
)


@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def _schema():
    """Build the test schema once per session, drop it at the end."""
    # The guard that matters is where statements actually land, not what the
    # URL says. If the translate map were ever lost, every unqualified name
    # would silently resolve in ``public`` -- against real data -- so refuse
    # to run rather than find out during a DROP.
    mapped = engine.get_execution_options().get("schema_translate_map") or {}
    assert mapped.get(None) == TEST_SCHEMA, (
        f"Refusing to run: statements are not namespaced to {TEST_SCHEMA!r} "
        f"(schema_translate_map={mapped!r}). Aborting before touching data."
    )

    async with engine.begin() as conn:
        # CASCADE also takes the enum types with it, which drop_all leaves
        # behind and which would otherwise collide on the next run.
        await conn.execute(text(f'DROP SCHEMA IF EXISTS "{TEST_SCHEMA}" CASCADE'))
        await conn.execute(text(f'CREATE SCHEMA "{TEST_SCHEMA}"'))
        await conn.run_sync(Base.metadata.create_all)

    yield

    async with engine.begin() as conn:
        await conn.execute(text(f'DROP SCHEMA IF EXISTS "{TEST_SCHEMA}" CASCADE'))
    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def _clean_tables():
    """Truncate between tests so each one starts from a known state."""
    limiter.reset()
    # Qualified by hand: schema_translate_map rewrites SQLAlchemy-constructed
    # statements, not raw text(), so an unqualified name here would truncate
    # the application's tables in ``public``.
    table_list = ", ".join(
        f'"{TEST_SCHEMA}"."{t.name}"' for t in Base.metadata.sorted_tables
    )
    async with engine.begin() as conn:
        # CASCADE handles the FK graph, so declaration order does not matter.
        await conn.execute(
            text(f"TRUNCATE {table_list} RESTART IDENTITY CASCADE")
        )
    yield


@pytest_asyncio.fixture
async def db() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        yield session


async def _override_get_db():
    async with TestSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


def _build_client(headers: dict[str, str] | None = None) -> AsyncClient:
    return AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test/api/v1",
        headers=headers or {},
    )


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """An **anonymous** client bound to the ASGI app.

    This must stay genuinely unauthenticated: ``auth_client`` deliberately
    builds its own instance rather than adding a header to this one, so that
    a test taking both fixtures really is comparing signed-in against
    signed-out. (An earlier version mutated this client's headers, which made
    every "no authentication required" assertion pass vacuously.)
    """
    app.dependency_overrides[get_db] = _override_get_db
    async with _build_client() as ac:
        yield ac
    app.dependency_overrides.clear()


# --------------------------------------------------------------------------
# Data helpers
# --------------------------------------------------------------------------

VALID_REGISTRATION = {
    "first_name": "Rahul",
    "last_name": "Mehta",
    "email": "rahul@example.com",
    "phone": "+919876543210",
    "city": "Mumbai",
    "country": "India",
    "password": "Str0ng!Pass",
    "confirm_password": "Str0ng!Pass",
}


@pytest.fixture
def registration() -> dict:
    return dict(VALID_REGISTRATION)


@pytest_asyncio.fixture
async def user_token(client: AsyncClient) -> tuple[str, dict]:
    """Register a user and return ``(access_token, user_dict)``."""
    resp = await client.post("/auth/register", json=VALID_REGISTRATION)
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    return data["access_token"], data["user"]


@pytest_asyncio.fixture
async def auth_client(
    client: AsyncClient, user_token: tuple[str, dict]
) -> AsyncGenerator[AsyncClient, None]:
    """A signed-in client, separate from the anonymous ``client``.

    Depends on ``client`` only so the database override is installed for the
    duration of the test.
    """
    token, _ = user_token
    async with _build_client({"Authorization": f"Bearer {token}"}) as ac:
        yield ac


@pytest_asyncio.fixture
async def admin_token(client: AsyncClient, db: AsyncSession) -> str:
    admin = User(
        first_name="Aditi",
        last_name="Sharma",
        email="admin@example.com",
        phone="+919876500000",
        city="Ahmedabad",
        country="India",
        hashed_password=hash_password("Adm1n!Pass"),
        role=UserRole.ADMIN,
        is_email_verified=True,
    )
    db.add(admin)
    await db.commit()

    resp = await client.post(
        "/auth/login", json={"email": "admin@example.com", "password": "Adm1n!Pass"}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


@pytest_asyncio.fixture
async def admin_client(
    client: AsyncClient, admin_token: str
) -> AsyncGenerator[AsyncClient, None]:
    async with _build_client({"Authorization": f"Bearer {admin_token}"}) as ac:
        yield ac


@pytest_asyncio.fixture
async def seeded_destination(db: AsyncSession) -> Destination:
    dest = Destination(
        name="Goa",
        country="India",
        region="Western India",
        cost_index=3,
        popularity_score=98,
    )
    db.add(dest)
    await db.commit()
    await db.refresh(dest)
    return dest
