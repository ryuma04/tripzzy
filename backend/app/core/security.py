"""Password hashing and JWT issuing/decoding (spec section 23)."""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings
from app.core.exceptions import UnauthorizedError

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

TokenType = Literal["access", "refresh"]


def hash_password(password: str) -> str:
    # bcrypt silently truncates at 72 bytes; reject rather than hash a prefix
    # so two different long passwords can never collide into one hash.
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password must not exceed 72 bytes")
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except ValueError:
        # Malformed hash in the database -- never let this read as success.
        return False


def _create_token(
    subject: str,
    token_type: TokenType,
    expires_delta: timedelta,
    extra: dict[str, Any] | None = None,
) -> tuple[str, str]:
    """Return ``(encoded_jwt, jti)``.

    The ``jti`` is what makes logout possible (refinement R2).
    """
    now = datetime.now(timezone.utc)
    jti = uuid.uuid4().hex
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "jti": jti,
        "iat": now,
        "exp": now + expires_delta,
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM), jti


def create_access_token(
    user_id: str | uuid.UUID, role: str = "user"
) -> tuple[str, str, datetime]:
    delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token, jti = _create_token(str(user_id), "access", delta, {"role": role})
    return token, jti, datetime.now(timezone.utc) + delta


def create_refresh_token(user_id: str | uuid.UUID) -> tuple[str, str, datetime]:
    delta = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    token, jti = _create_token(str(user_id), "refresh", delta)
    return token, jti, datetime.now(timezone.utc) + delta


def decode_token(token: str, expected_type: TokenType = "access") -> dict[str, Any]:
    """Decode and validate a JWT, or raise ``UnauthorizedError``.

    Signature, expiry and token *type* are all checked -- without the type
    check a refresh token would be accepted as an access token.
    """
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
    except JWTError as exc:
        raise UnauthorizedError("Invalid or expired token") from exc

    if payload.get("type") != expected_type:
        raise UnauthorizedError(f"Expected a {expected_type} token")
    if not payload.get("sub"):
        raise UnauthorizedError("Malformed token")
    return payload
