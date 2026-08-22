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
os.environ["ENVIRONMENT"] = "test"
os.environ["DEBUG"] = "false"
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


@pytest_asyncio.fixture(scope="session", autouse=True)
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


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """An HTTP client bound to the ASGI app, sharing the test database."""

    async def _get_db():
        async with TestSessionLocal() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = _get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="http://test/api/v1"
    ) as ac:
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
) -> AsyncClient:
    token, _ = user_token
    client.headers["Authorization"] = f"Bearer {token}"
    return client


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
