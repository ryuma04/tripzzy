"""Admin panel (spec sections 18, 36).

Every route depends on ``AdminUser``, which requires an authenticated user
*and* ``role == admin`` -- spec section 18's stated requirement.
"""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.core import responses
from app.core.deps import AdminUser, DbSession, Pagination
from app.models.enums import TripStatus, UserRole, UserStatus
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserResponse
from app.services.admin_service import AdminService

router = APIRouter(prefix="/admin", tags=["admin"])


class UserStatusUpdate(BaseModel):
    status: UserStatus


@router.get("/dashboard", summary="Platform statistics")
async def dashboard(_: AdminUser, db: DbSession):
    return responses.success(await AdminService(db).dashboard(), "OK")


@router.get("/users", summary="List users")
async def list_users(
    _: AdminUser,
    db: DbSession,
    page: Pagination,
    q: Annotated[str | None, Query(max_length=100)] = None,
    role: UserRole | None = None,
    status: UserStatus | None = None,
    sort_by: Literal[
        "created_at", "email", "first_name", "last_name", "role", "status"
    ] = "created_at",
    sort_order: Literal["asc", "desc"] = "desc",
):
    users, total = await UserRepository(db).list_paginated(
        offset=page.offset,
        limit=page.limit,
        q=q,
        role=role,
        status=status,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return responses.paginated(
        [UserResponse.model_validate(u).model_dump() for u in users],
        page=page.page,
        limit=page.limit,
        total=total,
    )


@router.get("/users/{user_id}", summary="User detail")
async def get_user(user_id: uuid.UUID, _: AdminUser, db: DbSession):
    return responses.success(await AdminService(db).get_user(user_id), "OK")


@router.put("/users/{user_id}/status", summary="Activate or suspend a user")
async def set_user_status(
    user_id: uuid.UUID,
    payload: UserStatusUpdate,
    admin: AdminUser,
    db: DbSession,
):
    user = await AdminService(db).set_user_status(user_id, payload.status, admin)
    return responses.success(
        UserResponse.model_validate(user).model_dump(),
        f"User status set to {user.status.value}",
    )


@router.get("/trips", summary="List every trip")
async def list_trips(
    _: AdminUser,
    db: DbSession,
    page: Pagination,
    q: Annotated[str | None, Query(max_length=100)] = None,
    status: TripStatus | None = None,
):
    items, total = await AdminService(db).list_trips(
        offset=page.offset, limit=page.limit, q=q, status=status
    )
    return responses.paginated(
        items, page=page.page, limit=page.limit, total=total
    )


@router.get("/analytics/trips", summary="Trip analytics")
async def trip_analytics(
    _: AdminUser,
    db: DbSession,
    months: Annotated[int, Query(ge=1, le=60)] = 12,
):
    return responses.success(
        await AdminService(db).trip_analytics(months=months), "OK"
    )


@router.get("/analytics/destinations", summary="Destination analytics")
async def destination_analytics(
    _: AdminUser,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    return responses.success(
        await AdminService(db).destination_analytics(limit=limit), "OK"
    )


@router.get("/analytics/activities", summary="Activity analytics")
async def activity_analytics(
    _: AdminUser,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    return responses.success(
        await AdminService(db).activity_analytics(limit=limit), "OK"
    )
