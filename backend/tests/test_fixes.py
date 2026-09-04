import uuid
import pytest
from httpx import AsyncClient
from unittest.mock import patch, MagicMock
from fastapi import Request

from app.core.config import settings
from app.core.rate_limit import _client_ip
from app.services.payment_gateway import get_payment_gateway, SimulatedGateway, BasePaymentGateway
from app.models import Destination


def test_payment_gateway_factory():
    gateway = get_payment_gateway()
    assert isinstance(gateway, BasePaymentGateway)
    assert isinstance(gateway, SimulatedGateway)


def test_rate_limit_client_ip_spoofing_defense():
    """Verify that X-Forwarded-For is ignored unless BEHIND_TRUSTED_PROXY is explicitly enabled and proxy is trusted."""
    mock_request = MagicMock(spec=Request)
    mock_request.client = MagicMock()
    mock_request.client.host = "192.168.1.50"
    mock_request.headers = {"x-forwarded-for": "10.0.0.1, 10.0.0.2"}

    # Default: BEHIND_TRUSTED_PROXY is False -> must use socket client.host
    with patch.object(settings, "BEHIND_TRUSTED_PROXY", False):
        ip = _client_ip(mock_request)
        assert ip == "192.168.1.50"

    # BEHIND_TRUSTED_PROXY is True, but socket IP is not in TRUSTED_PROXIES -> must ignore header
    with patch.object(settings, "BEHIND_TRUSTED_PROXY", True):
        with patch.object(settings, "TRUSTED_PROXIES", "127.0.0.1,::1"):
            ip = _client_ip(mock_request)
            assert ip == "192.168.1.50"

    # BEHIND_TRUSTED_PROXY is True AND socket IP is trusted -> parses first X-Forwarded-For IP
    mock_request.client.host = "127.0.0.1"
    with patch.object(settings, "BEHIND_TRUSTED_PROXY", True):
        with patch.object(settings, "TRUSTED_PROXIES", "127.0.0.1,::1"):
            ip = _client_ip(mock_request)
            assert ip == "10.0.0.1"


@pytest.mark.asyncio
async def test_saved_destinations_lifecycle(
    auth_client: AsyncClient,
    seeded_destination,
):
    dest = seeded_destination

    # 1. Check saved list initially does not contain this one
    res = await auth_client.get("/destinations/saved")
    assert res.status_code == 200
    body = res.json()
    saved_items = body.get("items", body.get("data", {}).get("items", []))
    assert all(item["id"] != str(dest.id) for item in saved_items)

    # 2. Save destination
    res = await auth_client.post(f"/destinations/{dest.id}/save")
    assert res.status_code == 200

    # 3. Verify in saved list
    res = await auth_client.get("/destinations/saved")
    assert res.status_code == 200
    body = res.json()
    saved_items = body.get("items", body.get("data", {}).get("items", []))
    assert any(item["id"] == str(dest.id) for item in saved_items)

    # 4. Unsave destination
    res = await auth_client.delete(f"/destinations/{dest.id}/save")
    assert res.status_code == 200

    # 5. Verify removed from saved list
    res = await auth_client.get("/destinations/saved")
    assert res.status_code == 200
    body = res.json()
    saved_items = body.get("items", body.get("data", {}).get("items", []))
    assert all(item["id"] != str(dest.id) for item in saved_items)
