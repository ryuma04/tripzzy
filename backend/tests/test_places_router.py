import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_places_autocomplete():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/api/v1/places/autocomplete?query=Mumbai")
        assert response.status_code == 200
        data = response.json()
        assert "predictions" in data
        assert isinstance(data["predictions"], list)

@pytest.mark.asyncio
async def test_places_search():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/api/v1/places/search?query=Gateway+of+India+Mumbai")
        assert response.status_code == 200
        data = response.json()
        assert "places" in data
        assert isinstance(data["places"], list)
        if len(data["places"]) > 0:
            top = data["places"][0]
            assert "displayName" in top
            assert "location" in top

@pytest.mark.asyncio
async def test_destination_from_place():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload = {
            "name": "Marine Drive Promenade",
            "country": "India",
            "region": "Maharashtra",
            "description": "Iconic seaside promenade in Mumbai",
            "latitude": 18.943994,
            "longitude": 72.822581,
            "image_url": "https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=800"
        }
        response = await ac.post("/api/v1/destinations/from-place", json=payload)
        assert response.status_code in [200, 201]
        data = response.json()
        assert "id" in data
        assert data["name"] == "Marine Drive Promenade"
        assert float(data["latitude"]) == pytest.approx(18.943994, abs=1e-4)
        assert float(data["longitude"]) == pytest.approx(72.822581, abs=1e-4)
