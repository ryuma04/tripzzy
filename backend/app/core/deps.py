"""Shared FastAPI dependencies: current user, admin guard, pagination."""

import uuid
from typing import TYPE_CHECKING, Annotated

from fastapi import Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.security import decode_token
from app.db.session import get_db
from app.models import RevokedToken, User
from app.models.enums import UserStatus

if TYPE_CHECKING:  # avoids a circular import at runtime
    from app.models import OperatorMember

# auto_error=False so a missing header raises our enveloped 401 rather than
# FastAPI's default {"detail": ...} shape.
bearer_scheme = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: DbSession,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(bearer_scheme)
    ] = None,
) -> User:
    """Resolve the caller from their JWT (spec section 23).

    Rejects missing/invalid tokens, tokens revoked by logout, users that no
    longer exist, and suspended or deleted accounts.
    """
    if credentials is None or not credentials.credentials:
        raise UnauthorizedError("Authentication required")

    payload = decode_token(credentials.credentials, expected_type="access")

    jti = payload.get("jti")
    if jti:
        revoked = await db.scalar(
            select(RevokedToken.id).where(RevokedToken.jti == jti)
        )
        if revoked is not None:
            raise UnauthorizedError("This session has been logged out")

    try:
        user_id = uuid.UUID(str(payload["sub"]))
    except (ValueError, KeyError) as exc:
        raise UnauthorizedError("Malformed token") from exc

    user = await db.get(User, user_id)
    if user is None:
        raise UnauthorizedError("User no longer exists")

    if user.status == UserStatus.SUSPENDED:
        raise ForbiddenError("This account has been suspended")
    if user.status == UserStatus.DELETED:
        raise UnauthorizedError("This account has been deleted")

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def require_admin(current_user: CurrentUser) -> User:
    """Spec section 18: admin endpoints need authentication *and* role=admin."""
    if not current_user.is_admin:
        raise ForbiddenError("This action requires administrator privileges")
    return current_user


AdminUser = Annotated[User, Depends(require_admin)]


async def require_operator_member(
    current_user: CurrentUser, db: DbSession
) -> "OperatorMember":
    """Resolve the caller's standing at a tour operator, or refuse.

    Operator access is granted by *membership*, not by the platform-level
    ``UserRole``. The same account is routinely a traveller on its own trips
    and a coordinator at work, and collapsing those into one role would force
    a choice between the two. It also means operator access is revoked by
    deactivating a membership row, with no enum migration involved.

    A user belonging to more than one operator resolves to their first active
    membership; multi-operator switching is not a case the console handles yet.
    """
    from app.models import OperatorMember  # noqa: PLC0415

    membership = await db.scalar(
        select(OperatorMember)
        .where(
            OperatorMember.user_id == current_user.id,
            OperatorMember.is_active.is_(True),
        )
        .order_by(OperatorMember.created_at)
        .limit(1)
    )
    if membership is None:
        raise ForbiddenError(
            "This area is for tour operator staff. Your account is not "
            "linked to an operator."
        )
    return membership


OperatorContext = Annotated["OperatorMember", Depends(require_operator_member)]


async def require_operator_manager(
    membership: OperatorContext,
) -> "OperatorMember":
    """Narrower guard for actions a coordinator should not take alone.

    Coordinators run departures; changing the roster or the vendor book is a
    manager's job.
    """
    from app.models.enums import OperatorRole  # noqa: PLC0415

    if membership.role not in (OperatorRole.OWNER, OperatorRole.MANAGER):
        raise ForbiddenError("This action requires an operator manager or owner")
    return membership


OperatorManager = Annotated["OperatorMember", Depends(require_operator_manager)]


async def get_optional_user(
    db: DbSession,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(bearer_scheme)
    ] = None,
) -> User | None:
    """For endpoints that work anonymously but personalise when signed in.

    Used by the public share route so a logged-in visitor can be shown a
    "clone this trip" action while anonymous visitors still see the itinerary.
    """
    if credentials is None or not credentials.credentials:
        return None
    try:
        return await get_current_user(db, credentials)
    except (UnauthorizedError, ForbiddenError):
        return None


OptionalUser = Annotated[User | None, Depends(get_optional_user)]


class PaginationParams:
    """Spec section 26: ?page=1&limit=20."""

    def __init__(
        self,
        page: Annotated[int, Query(ge=1, description="1-indexed page number")] = 1,
        limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
    ) -> None:
        self.page = page
        self.limit = limit

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit


Pagination = Annotated[PaginationParams, Depends(PaginationParams)]
