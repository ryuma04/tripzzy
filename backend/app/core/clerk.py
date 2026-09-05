"""Clerk JWT verification for securing the clerk-sync endpoint.

Verifies that incoming requests to /auth/clerk-sync carry a valid Clerk
session token.  The token is verified against Clerk's JWKS (public keys),
not the CLERK_SECRET_KEY, because Clerk session JWTs are signed with RSA
and the public keys are published at the JWKS endpoint.

Flow:
1. Frontend calls `getToken()` from Clerk's `useAuth()` hook.
2. Frontend sends it as `Authorization: Bearer <session_token>`.
3. This module fetches Clerk's JWKS once (then caches it), decodes the
   JWT, and returns the verified payload containing the user's Clerk ID
   and session claims.
"""

from __future__ import annotations

import base64
import logging
from functools import lru_cache

import httpx
from jose import JWTError, jwt

from app.core.config import settings
from app.core.exceptions import UnauthorizedError

logger = logging.getLogger("tripzyy.clerk")

_DEFAULT_FRONTEND_API = "meet-monkfish-1812.clerk.accounts.dev"


def get_clerk_frontend_api() -> str:
    """Derive Clerk's frontend API domain from the publishable key.

    Clerk publishable keys have the format ``pk_test_<base64>`` or ``pk_live_<base64>``.
    The base64 portion decodes to ``<frontend-api-domain>$``.
    """
    pk = settings.CLERK_PUBLISHABLE_KEY
    if pk:
        try:
            parts = pk.split("_", 2)
            if len(parts) == 3:
                encoded = parts[2]
                padded = encoded + "=" * (-len(encoded) % 4)
                decoded = base64.b64decode(padded).decode("utf-8")
                domain = decoded.rstrip("$")
                if domain:
                    return domain
        except Exception as exc:
            logger.debug("Could not decode CLERK_PUBLISHABLE_KEY: %s", exc)
    return _DEFAULT_FRONTEND_API


def get_jwks_url() -> str:
    """Get the JWKS URL for the configured Clerk frontend API."""
    return f"https://{get_clerk_frontend_api()}/.well-known/jwks.json"


@lru_cache(maxsize=1)
def _fetch_jwks() -> dict:
    """Fetch and cache Clerk's JSON Web Key Set.

    The keys rarely rotate, so caching with lru_cache is safe.
    If a verification fails due to a key miss, call
    ``_fetch_jwks.cache_clear()`` and retry once.
    """
    url = get_jwks_url()
    try:
        resp = httpx.get(url, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError as exc:
        logger.error("Failed to fetch Clerk JWKS from %s: %s", url, exc)
        raise UnauthorizedError("Unable to verify authentication provider") from exc


def verify_clerk_token(token: str) -> dict:
    """Verify a Clerk session JWT and return the decoded payload.

    Returns a dict with at least:
        - ``sub``: The Clerk user ID (e.g. ``user_2x...``)
        - ``iss``: The issuer URL
        - ``exp``, ``iat``, ``nbf``: Timing claims

    Raises ``UnauthorizedError`` if verification fails.
    """
    frontend_api = get_clerk_frontend_api()
    issuer = f"https://{frontend_api}"
    jwks = _fetch_jwks()

    try:
        payload = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            options={
                "verify_aud": False,  # Clerk session tokens don't set aud
                "verify_iss": True,
            },
            issuer=issuer,
        )
        return payload
    except JWTError:
        # Key may have rotated — clear cache and retry once
        _fetch_jwks.cache_clear()
        jwks = _fetch_jwks()
        try:
            payload = jwt.decode(
                token,
                jwks,
                algorithms=["RS256"],
                options={
                    "verify_aud": False,
                    "verify_iss": True,
                },
                issuer=issuer,
            )
            return payload
        except JWTError as exc:
            logger.warning("Clerk JWT verification failed: %s", exc)
            raise UnauthorizedError(
                "Invalid or expired Clerk session token"
            ) from exc


async def get_clerk_user_info(token: str) -> dict:
    """Verify the token and also fetch full user details from Clerk API.

    Uses the CLERK_SECRET_KEY to call Clerk's Backend API for the user's
    email, name, and metadata.  This is more authoritative than relying
    on the POST body — an attacker cannot spoof these fields.
    """
    payload = verify_clerk_token(token)
    clerk_user_id = payload.get("sub")
    if not clerk_user_id:
        raise UnauthorizedError("Clerk token missing user ID")

    secret = settings.CLERK_SECRET_KEY
    if not secret:
        logger.warning(
            "CLERK_SECRET_KEY not set — falling back to token claims only"
        )
        return {
            "clerk_id": clerk_user_id,
            "email": None,
            "first_name": None,
            "last_name": None,
            "role": None,
        }

    # Fetch authoritative user data from Clerk Backend API
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://api.clerk.com/v1/users/{clerk_user_id}",
                headers={"Authorization": f"Bearer {secret}"},
                timeout=10,
            )
            resp.raise_for_status()
            user_data = resp.json()

        # Extract primary email
        email = None
        primary_email_id = user_data.get("primary_email_address_id")
        for addr in user_data.get("email_addresses", []):
            if addr.get("id") == primary_email_id:
                email = addr.get("email_address")
                break
        if not email and user_data.get("email_addresses"):
            email = user_data["email_addresses"][0].get("email_address")

        # Extract role from public/unsafe metadata
        public_meta = user_data.get("public_metadata") or {}
        unsafe_meta = user_data.get("unsafe_metadata") or {}
        role = public_meta.get("role") or unsafe_meta.get("role")

        return {
            "clerk_id": clerk_user_id,
            "email": email,
            "first_name": user_data.get("first_name"),
            "last_name": user_data.get("last_name"),
            "role": role,
        }
    except Exception as exc:
        logger.error("Failed to fetch Clerk user %s: %s", clerk_user_id, exc)
        # Fall back to token-only verification rather than blocking login
        return {
            "clerk_id": clerk_user_id,
            "email": None,
            "first_name": None,
            "last_name": None,
            "role": None,
        }
