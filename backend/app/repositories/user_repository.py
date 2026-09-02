"""Query layer for users."""

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import User, UserPreference
from app.models.enums import UserRole, UserStatus


class UserRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        return await self.db.get(User, user_id)

    async def get_by_email(self, email: str) -> User | None:
        """Case-insensitive lookup, matching the functional unique index."""
        return await self.db.scalar(
            select(User).where(func.lower(User.email) == email.strip().lower())
        )

    async def email_exists(self, email: str) -> bool:
        found = await self.db.scalar(
            select(User.id).where(func.lower(User.email) == email.strip().lower())
        )
        return found is not None

    async def get_with_preferences(self, user_id: uuid.UUID) -> User | None:
        return await self.db.scalar(
            select(User)
            .where(User.id == user_id)
            .options(selectinload(User.preferences))
        )

    async def create(self, **fields) -> User:
        user = User(**fields)
        self.db.add(user)
        await self.db.flush()
        return user

    async def ensure_preferences(self, user: User) -> UserPreference:
        """Lazily create the preferences row so GET never 404s."""
        existing = await self.db.scalar(
            select(UserPreference).where(UserPreference.user_id == user.id)
        )
        if existing is not None:
            return existing
        prefs = UserPreference(user_id=user.id)
        self.db.add(prefs)
        await self.db.flush()
        return prefs

    async def search_directory(
        self,
        term: str,
        *,
        exclude_user_id: uuid.UUID | None = None,
        limit: int = 10,
    ) -> list[User]:
        """Find active users by name prefix, or by exact email.

        Distinct from ``list_paginated``, which is the admin listing and
        matches names *and* emails on a substring. This one is reachable by
        any signed-in user, so the matching is tightened: a name matches from
        the start of the first or last name, and an email has to be given in
        full. That is enough to find a travel companion without letting
        anyone page through the user base or confirm addresses by fragment.
        """
        cleaned = term.strip().lower().lstrip("@")
        if not cleaned:
            return []

        prefix = f"{cleaned}%"
        conditions = [
            func.lower(User.first_name).like(prefix),
            func.lower(User.last_name).like(prefix),
            func.lower(User.email) == cleaned,
        ]

        stmt = (
            select(User)
            .where(or_(*conditions))
            .where(User.status == UserStatus.ACTIVE)
            .order_by(User.first_name, User.last_name)
            .limit(limit)
        )
        if exclude_user_id is not None:
            stmt = stmt.where(User.id != exclude_user_id)

        return list((await self.db.execute(stmt)).scalars().all())

    async def list_paginated(
        self,
        *,
        offset: int,
        limit: int,
        q: str | None = None,
        role: UserRole | None = None,
        status: UserStatus | None = None,
        sort_by: str = "created_at",
        sort_order: str = "desc",
    ) -> tuple[list[User], int]:
        """Admin user listing (spec section 18)."""
        stmt = select(User)
        count_stmt = select(func.count()).select_from(User)

        filters = []
        if q:
            pattern = f"%{q.strip().lower()}%"
            filters.append(
                func.lower(
                    User.first_name + " " + User.last_name + " " + User.email
                ).like(pattern)
            )
        if role is not None:
            filters.append(User.role == role)
        if status is not None:
            filters.append(User.status == status)

        for f in filters:
            stmt = stmt.where(f)
            count_stmt = count_stmt.where(f)

        # Allowlist: never interpolate a client string into ORDER BY.
        sortable = {
            "created_at": User.created_at,
            "email": User.email,
            "first_name": User.first_name,
            "last_name": User.last_name,
            "role": User.role,
            "status": User.status,
        }
        column = sortable.get(sort_by, User.created_at)
        stmt = stmt.order_by(
            column.desc() if sort_order == "desc" else column.asc()
        )

        total = (await self.db.execute(count_stmt)).scalar_one()
        rows = (
            (await self.db.execute(stmt.offset(offset).limit(limit)))
            .scalars()
            .all()
        )
        return list(rows), total
