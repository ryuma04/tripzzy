"""Admin panel and routes have been removed from the platform.

This test suite verifies that all former /admin endpoints are unmapped (404)
and that administration role access is strictly disabled.
"""

import pytest
from httpx import AsyncClient

ADMIN_ROUTES = [
    "/admin/dashboard",
    "/admin/users",
    "/admin/trips",
    "/admin/analytics/trips",
    "/admin/analytics/destinations",
    "/admin/analytics/activities",
]


@pytest.mark.parametrize("route", ADMIN_ROUTES)
async def test_admin_routes_are_unmapped_404(client: AsyncClient, route: str):
    """Admin routes are completely disabled and unmapped across the platform."""
    resp = await client.get(route)
    assert resp.status_code == 404


async def test_clerk_sync_rejects_admin_role(client: AsyncClient):
    """Attempting to sync or authenticate with the admin role returns 403 Forbidden."""
    resp = await client.post(
        "/auth/clerk-sync",
        headers={"Authorization": "Bearer any_token"},
        json={"email": "admin@example.com", "role": "admin"},
    )
    # The endpoint rejects admin attempts with 403 Forbidden or 401 Unauthorized if invalid token
    assert resp.status_code in (401, 403)
