"""Async engine and session factory."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.core.config import settings

# The database is Neon, reached through its PgBouncer ``-pooler`` endpoint.
# Two things follow from that, and both are load-bearing:
#
# 1. asyncpg caches prepared statements per connection. PgBouncer in
#    transaction mode hands the same client connection to different backends
#    between statements, so those cached handles go stale and the driver
#    raises ``prepared statement "__asyncpg_stmt_N__" already exists`` the
#    moment there is any concurrency. ``statement_cache_size=0`` turns the
#    cache off.
# 2. Pooling on top of a pooler is wasted bookkeeping, and SQLAlchemy's pool
#    holds connections that PgBouncer wants to recycle. NullPool defers all
#    of it to PgBouncer, which is what it is there for.
#
# The two caches sit at different layers. asyncpg's own is a connect
# argument and is set here; SQLAlchemy's is settable only through the URL
# query string, so ``settings.database_url_str`` appends it.
engine = create_async_engine(
    settings.database_url_str,
    echo=settings.DB_ECHO,
    poolclass=NullPool,
    connect_args={"statement_cache_size": 0},
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding a session with transactional semantics.

    A request that raises rolls the whole unit of work back, which is what
    spec section 32 asks for: no half-created trips left in PostgreSQL.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
