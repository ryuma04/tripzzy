"""User profile endpoints (spec sections 11, 27 /users)."""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, File, Query, UploadFile

from app.core import responses
from app.core.deps import CurrentUser, DbSession
from app.models.enums import UserStatus
from app.repositories.user_repository import UserRepository
from app.schemas.user import (
    PasswordChangeRequest,
    PreferencesResponse,
    PreferencesUpdateRequest,
    UserResponse,
    UserUpdateRequest,
)
from app.services.auth_service import AuthService

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/search", summary="Find other travellers to add to a split")
async def search_users(
    current_user: CurrentUser,
    db: DbSession,
    q: Annotated[str, Query(min_length=2, max_length=100)],
    limit: Annotated[int, Query(ge=1, le=20)] = 10,
):
    """Look up people by name, or by their exact email address.

    Needed so a bill split can include real accounts; the frontend previously
    searched a hardcoded list of fictional users, so only invented people
    could be added.

    This is a user directory, so it is deliberately narrow. Names match on a
    prefix rather than a substring, and email matches only on the *whole*
    address -- enough to find somebody you already know, not enough to
    enumerate the user base or harvest addresses. The response carries no
    email or phone number for the same reason, and the caller is excluded
    from their own results.
    """
    term = q.strip()
    users = await UserRepository(db).search_directory(
        term, exclude_user_id=current_user.id, limit=limit
    )
    return responses.success(
        [
            {
                "id": u.id,
                "first_name": u.first_name,
                "last_name": u.last_name,
                "city": u.city,
                "country": u.country,
                "avatar_url": u.avatar_url,
            }
            for u in users
        ],
        "Users found",
    )


@router.get("/me", summary="View your profile")
async def get_me(current_user: CurrentUser):
    return responses.success(
        UserResponse.model_validate(current_user).model_dump(), "OK"
    )


@router.put("/me", summary="Update your profile")
async def update_me(
    payload: UserUpdateRequest, current_user: CurrentUser, db: DbSession
):
    # exclude_unset so omitting a field leaves it alone, rather than nulling it.
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return responses.success(
            UserResponse.model_validate(current_user).model_dump(),
            "Nothing to update",
        )

    for field, value in changes.items():
        setattr(current_user, field, value)

    await db.commit()
    await db.refresh(current_user)
    return responses.success(
        UserResponse.model_validate(current_user).model_dump(),
        "Profile updated successfully",
    )


@router.get("/me/preferences", summary="View your preferences")
async def get_preferences(current_user: CurrentUser, db: DbSession):
    prefs = await UserRepository(db).ensure_preferences(current_user)
    await db.commit()
    return responses.success(
        PreferencesResponse.model_validate(prefs).model_dump(), "OK"
    )


@router.put("/me/preferences", summary="Update your preferences")
async def update_preferences(
    payload: PreferencesUpdateRequest, current_user: CurrentUser, db: DbSession
):
    prefs = await UserRepository(db).ensure_preferences(current_user)

    # Every JSONB list column: these hold enum members before this point, and
    # psycopg cannot serialise an Enum into JSONB. `preferred_transport_modes`
    # needs the same unwrapping `preferred_categories` already had.
    ENUM_LISTS = {"preferred_categories", "preferred_transport_modes"}

    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if field in ENUM_LISTS and value is not None:
            # Store plain strings so the JSONB column stays queryable.
            value = [c.value if hasattr(c, "value") else str(c) for c in value]
        setattr(prefs, field, value)

    await db.commit()
    await db.refresh(prefs)
    return responses.success(
        PreferencesResponse.model_validate(prefs).model_dump(),
        "Preferences updated successfully",
    )


@router.put("/me/password", summary="Change your password")
async def change_password(
    payload: PasswordChangeRequest, current_user: CurrentUser, db: DbSession
):
    await AuthService(db).change_password(
        current_user, payload.current_password, payload.new_password
    )
    return responses.success(None, "Password changed successfully")


@router.post("/me/avatar", summary="Upload profile avatar")
async def upload_avatar(
    file: UploadFile = File(...), current_user: CurrentUser = None, db: DbSession = None
):
    from app.services.image_service import ImageService

    url = await ImageService.upload_avatar(file, current_user.id)
    current_user.avatar_url = url
    await db.commit()
    await db.refresh(current_user)
    return responses.success(
        {"avatar_url": url, "user": UserResponse.model_validate(current_user).model_dump()},
        "Avatar updated successfully",
    )


@router.delete("/me", summary="Delete your account")
async def delete_me(current_user: CurrentUser, db: DbSession):
    """Soft delete.

    The row is retained so the user's trips, and any trips other people cloned
    from them, do not vanish from the database. The account can no longer sign
    in, and the email is released by suffixing it.
    """
    stamp = int(datetime.now(timezone.utc).timestamp())
    current_user.status = UserStatus.DELETED
    current_user.email = f"deleted+{stamp}+{current_user.email}"[:255]
    await db.commit()
    return responses.success(None, "Account deleted successfully")
