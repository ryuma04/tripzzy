"""Auth and validation tests.

Covers the registration rules in spec section 5 and the relevant examples from
section 2.3 (invalid email, duplicate email, weak password).
"""

import pytest
from httpx import AsyncClient


# --------------------------------------------------------------------------
# Envelope
# --------------------------------------------------------------------------

async def test_every_response_uses_the_envelope(client: AsyncClient, registration):
    ok = await client.post("/auth/register", json=registration)
    body = ok.json()
    assert set(body) == {"success", "message", "data", "error"}
    assert body["success"] is True
    assert body["error"] is None

    bad = await client.post("/auth/register", json={"email": "x"})
    body = bad.json()
    assert set(body) == {"success", "message", "data", "error"}
    assert body["success"] is False
    assert body["data"] is None
    assert body["error"]["code"] == "VALIDATION_ERROR"


# --------------------------------------------------------------------------
# Registration
# --------------------------------------------------------------------------

async def test_register_succeeds_and_returns_a_token(
    client: AsyncClient, registration
):
    resp = await client.post("/auth/register", json=registration)
    assert resp.status_code == 201, resp.text

    data = resp.json()["data"]
    assert data["access_token"]
    assert data["user"]["email"] == "rahul@example.com"
    # Spec section 11: the profile must never expose sensitive fields.
    assert "hashed_password" not in data["user"]
    assert "password" not in data["user"]


async def test_register_assigns_the_user_role_not_admin(
    client: AsyncClient, registration
):
    """A client must not be able to escalate itself by sending role=admin."""
    resp = await client.post(
        "/auth/register", json={**registration, "role": "admin"}
    )
    assert resp.status_code == 201
    assert resp.json()["data"]["user"]["role"] == "user"


async def test_duplicate_email_is_rejected(client: AsyncClient, registration):
    first = await client.post("/auth/register", json=registration)
    assert first.status_code == 201

    second = await client.post("/auth/register", json=registration)
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "CONFLICT"


async def test_duplicate_email_is_case_insensitive(
    client: AsyncClient, registration
):
    await client.post("/auth/register", json=registration)
    resp = await client.post(
        "/auth/register", json={**registration, "email": "RAHUL@Example.COM"}
    )
    assert resp.status_code == 409


async def test_email_is_stored_lowercased(client: AsyncClient, registration):
    resp = await client.post(
        "/auth/register", json={**registration, "email": "Rahul@Example.COM"}
    )
    assert resp.json()["data"]["user"]["email"] == "rahul@example.com"


@pytest.mark.parametrize(
    "email",
    ["not-an-email", "missing@domain", "@nodomain.com", "spaces in@mail.com", ""],
)
async def test_invalid_email_is_rejected(
    client: AsyncClient, registration, email
):
    resp = await client.post("/auth/register", json={**registration, "email": email})
    assert resp.status_code == 422
    assert "email" in resp.json()["error"]["details"]["fields"]


@pytest.mark.parametrize(
    "password,reason",
    [
        ("Sh0rt!", "too short"),
        ("alllowercase1!", "no uppercase"),
        ("ALLUPPERCASE1!", "no lowercase"),
        ("NoDigitsHere!", "no digit"),
        ("NoSymbols123", "no symbol"),
        ("password", "common and weak"),
    ],
)
async def test_weak_password_is_rejected(
    client: AsyncClient, registration, password, reason
):
    resp = await client.post(
        "/auth/register",
        json={**registration, "password": password, "confirm_password": password},
    )
    assert resp.status_code == 422, f"{reason!r} should have been rejected"


async def test_password_confirmation_must_match(client: AsyncClient, registration):
    resp = await client.post(
        "/auth/register",
        json={**registration, "confirm_password": "Different!1"},
    )
    assert resp.status_code == 422


async def test_password_cannot_contain_the_email(client: AsyncClient, registration):
    resp = await client.post(
        "/auth/register",
        json={
            **registration,
            "email": "rahulmehta@example.com",
            "password": "Rahulmehta1!",
            "confirm_password": "Rahulmehta1!",
        },
    )
    assert resp.status_code == 422


@pytest.mark.parametrize(
    "phone", ["12", "abcdefghij", "+91 98765 4321 0000000", "++919876543210"]
)
async def test_invalid_phone_is_rejected(client: AsyncClient, registration, phone):
    resp = await client.post("/auth/register", json={**registration, "phone": phone})
    assert resp.status_code == 422


@pytest.mark.parametrize(
    "phone,stored",
    [
        ("+91 98765-43210", "+919876543210"),
        ("(987) 654-3210", "9876543210"),
    ],
)
async def test_phone_formatting_is_normalised(
    client: AsyncClient, registration, phone, stored
):
    resp = await client.post("/auth/register", json={**registration, "phone": phone})
    assert resp.status_code == 201
    assert resp.json()["data"]["user"]["phone"] == stored


@pytest.mark.parametrize(
    "field", ["first_name", "last_name", "email", "phone", "city", "country"]
)
async def test_required_fields_cannot_be_empty(
    client: AsyncClient, registration, field
):
    resp = await client.post("/auth/register", json={**registration, field: "   "})
    assert resp.status_code == 422


async def test_names_reject_digits_and_symbols(client: AsyncClient, registration):
    resp = await client.post(
        "/auth/register", json={**registration, "first_name": "R4hul<script>"}
    )
    assert resp.status_code == 422


async def test_whitespace_is_trimmed(client: AsyncClient, registration):
    resp = await client.post(
        "/auth/register", json={**registration, "first_name": "  Rahul  "}
    )
    assert resp.json()["data"]["user"]["first_name"] == "Rahul"


# --------------------------------------------------------------------------
# Login
# --------------------------------------------------------------------------

async def test_login_succeeds_with_correct_credentials(
    client: AsyncClient, registration
):
    await client.post("/auth/register", json=registration)
    resp = await client.post(
        "/auth/login",
        json={"email": registration["email"], "password": registration["password"]},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["access_token"]


async def test_login_rejects_a_wrong_password(client: AsyncClient, registration):
    await client.post("/auth/register", json=registration)
    resp = await client.post(
        "/auth/login",
        json={"email": registration["email"], "password": "Wr0ng!Pass"},
    )
    assert resp.status_code == 401


async def test_login_does_not_reveal_whether_an_email_exists(
    client: AsyncClient, registration
):
    """Unknown address and wrong password must be indistinguishable."""
    await client.post("/auth/register", json=registration)

    unknown = await client.post(
        "/auth/login", json={"email": "nobody@example.com", "password": "Wr0ng!Pass"}
    )
    wrong_pw = await client.post(
        "/auth/login",
        json={"email": registration["email"], "password": "Wr0ng!Pass"},
    )
    assert unknown.status_code == wrong_pw.status_code == 401
    assert unknown.json()["message"] == wrong_pw.json()["message"]


async def test_login_is_case_insensitive_on_email(
    client: AsyncClient, registration
):
    await client.post("/auth/register", json=registration)
    resp = await client.post(
        "/auth/login",
        json={"email": "RAHUL@EXAMPLE.COM", "password": registration["password"]},
    )
    assert resp.status_code == 200


# --------------------------------------------------------------------------
# Tokens / session
# --------------------------------------------------------------------------

async def test_me_requires_a_token(client: AsyncClient):
    resp = await client.get("/auth/me")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHORIZED"


async def test_me_returns_the_current_user(auth_client: AsyncClient):
    resp = await auth_client.get("/auth/me")
    assert resp.status_code == 200
    assert resp.json()["data"]["email"] == "rahul@example.com"


async def test_a_garbage_token_is_rejected(client: AsyncClient):
    client.headers["Authorization"] = "Bearer not.a.real.token"
    resp = await client.get("/auth/me")
    assert resp.status_code == 401


async def test_a_refresh_token_is_not_accepted_as_an_access_token(
    client: AsyncClient, registration
):
    reg = await client.post("/auth/register", json=registration)
    refresh = reg.json()["data"]["refresh_token"]

    client.headers["Authorization"] = f"Bearer {refresh}"
    resp = await client.get("/auth/me")
    assert resp.status_code == 401


async def test_logout_actually_invalidates_the_token(auth_client: AsyncClient):
    """Refinement R2: logout is real, not merely client-side."""
    assert (await auth_client.get("/auth/me")).status_code == 200

    logout = await auth_client.post("/auth/logout")
    assert logout.status_code == 200

    assert (await auth_client.get("/auth/me")).status_code == 401


async def test_refresh_issues_a_new_access_token(
    client: AsyncClient, registration
):
    reg = await client.post("/auth/register", json=registration)
    refresh = reg.json()["data"]["refresh_token"]

    resp = await client.post("/auth/refresh", json={"refresh_token": refresh})
    assert resp.status_code == 200
    assert resp.json()["data"]["access_token"]


# --------------------------------------------------------------------------
# Clerk Sync
# --------------------------------------------------------------------------

async def test_clerk_sync_requires_bearer_token(client: AsyncClient):
    resp = await client.post(
        "/auth/clerk-sync",
        json={"email": "test@example.com", "first_name": "Test", "last_name": "User"},
    )
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHORIZED"


async def test_clerk_sync_rejects_invalid_token(client: AsyncClient, monkeypatch):
    from app.core.exceptions import UnauthorizedError

    def mock_verify(token: str):
        raise UnauthorizedError("Invalid or expired Clerk session token")

    monkeypatch.setattr("app.core.clerk.verify_clerk_token", mock_verify)

    resp = await client.post(
        "/auth/clerk-sync",
        headers={"Authorization": "Bearer bad_token"},
        json={"email": "test@example.com"},
    )
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHORIZED"


async def test_clerk_sync_creates_and_authenticates_user(
    client: AsyncClient, monkeypatch
):
    clerk_id = "user_test_clerk_sync_123"
    email = "clerk.traveler@example.com"

    monkeypatch.setattr(
        "app.core.clerk.verify_clerk_token",
        lambda token: {"sub": clerk_id, "iss": "https://clerk.example.com"},
    )

    async def mock_get_info(token: str):
        return {
            "clerk_id": clerk_id,
            "email": email,
            "first_name": "Clerk",
            "last_name": "Explorer",
            "role": "user",
        }

    monkeypatch.setattr("app.core.clerk.get_clerk_user_info", mock_get_info)

    resp = await client.post(
        "/auth/clerk-sync",
        headers={"Authorization": "Bearer valid_clerk_session"},
        json={"email": email, "first_name": "Clerk", "last_name": "Explorer"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    data = body["data"]
    assert data["access_token"]
    assert data["refresh_token"]
    assert data["user"]["email"] == email
    assert data["user"]["first_name"] == "Clerk"

    # Verify session works with issued Tripzyy JWT
    me_resp = await client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {data['access_token']}"},
    )
    assert me_resp.status_code == 200
    assert me_resp.json()["data"]["email"] == email


async def test_clerk_sync_links_existing_user(
    client: AsyncClient, registration, monkeypatch
):
    # Register existing user
    reg = await client.post("/auth/register", json=registration)
    assert reg.status_code == 201

    clerk_id = "user_clerk_linked_456"
    monkeypatch.setattr(
        "app.core.clerk.verify_clerk_token",
        lambda token: {"sub": clerk_id},
    )

    async def mock_get_info(token: str):
        return {
            "clerk_id": clerk_id,
            "email": registration["email"],
            "first_name": registration["first_name"],
            "last_name": registration["last_name"],
            "role": "user",
        }

    monkeypatch.setattr("app.core.clerk.get_clerk_user_info", mock_get_info)

    resp = await client.post(
        "/auth/clerk-sync",
        headers={"Authorization": "Bearer valid_clerk_session"},
        json={"email": registration["email"]},
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["user"]["email"] == registration["email"].lower()

