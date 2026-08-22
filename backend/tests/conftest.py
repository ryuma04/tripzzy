"""Test fixtures.

Runs against a dedicated ``tripzyy_test`` database that is dropped and rebuilt
for each session, so tests never touch development data. Email verification and
rate limiting are disabled by default; the tests that cover them turn them back
on explicitly.
"""


import os
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio

# Must be set before app.core.config is imported anywhere.
os.environ["DATABASE_URL"] = (
    "postgresql+asyncpg://postgres:ryuma@localhost:5432/tripzyy_test"
)
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
engine = create_async_engine(settings.database_url_str, poolclass=NullPool)

TestSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
)


@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def _schema():
    """Build the schema once per session, tear it down at the end."""
    assert "tripzyy_test" in settings.database_url_str, (
        "Refusing to run tests against a database that is not tripzyy_test"
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def _clean_tables():
    """Truncate between tests so each one starts from a known state."""
    limiter.reset()
    table_list = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
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
