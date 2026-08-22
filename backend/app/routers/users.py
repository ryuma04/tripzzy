"""User profile endpoints (spec sections 11, 27 /users)."""

from datetime import datetime, timezone

from fastapi import APIRouter, File, UploadFile

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

    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if field == "preferred_categories" and value is not None:
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
