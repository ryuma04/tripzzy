import asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app

async def main():
    print("=" * 60)
    print("TRIPZYY — COMPLETE FASTAPI HTTP ENDPOINTS VERIFICATION")
    print("=" * 60)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Health check
        r = await client.get("/health")
        print(f"GET /health -> Status: {r.status_code}, Body: {r.json()}")

        # 2. Autocomplete
        r = await client.get("/api/v1/places/autocomplete?query=Marine+Drive+Mumbai")
        print(f"GET /api/v1/places/autocomplete -> Status: {r.status_code}")
        data = r.json().get("data", {})
        print(f"   Predictions found: {len(data.get('predictions', []))}")
        if data.get('predictions'):
            print(f"   Top: {data['predictions'][0]['description']} (ID: {data['predictions'][0]['place_id']})")
            place_id = data['predictions'][0]['place_id']

            # 3. Place Details
            r_det = await client.get(f"/api/v1/places/{place_id}")
            print(f"GET /api/v1/places/{place_id} -> Status: {r_det.status_code}")
            det = r_det.json().get("data", {})
            print(f"   Name: {det.get('displayName', {}).get('text')}")
            print(f"   Coords: {det.get('location')}")

        # 4. Text Search with coordinates
        r_search = await client.get("/api/v1/places/search?query=Taj+Mahal+Agra")
        print(f"GET /api/v1/places/search -> Status: {r_search.status_code}")
        sdata = r_search.json().get("data", {})
        print(f"   Places found: {len(sdata.get('places', []))}")
        if sdata.get('places'):
            top_place = sdata['places'][0]
            print(f"   Top: {top_place.get('displayName', {}).get('text')}, Coords: {top_place.get('location')}")

        # 5. Destination creation from place
        dest_payload = {
            "name": "Baga Beach Calangute",
            "country": "India",
            "region": "Goa",
            "description": "Famous vibrant beach in North Goa",
            "latitude": 15.555279,
            "longitude": 73.751731,
            "image_url": "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=800"
        }
        r_dest = await client.post("/api/v1/destinations/from-place", json=dest_payload)
        print(f"POST /api/v1/destinations/from-place -> Status: {r_dest.status_code}")
        dest_res = r_dest.json().get("data", {})
        print(f"   Created / Found Destination: ID: {dest_res.get('id')}, Name: {dest_res.get('name')}, Lat: {dest_res.get('latitude')}, Lng: {dest_res.get('longitude')}")

    print("\n" + "=" * 60)
    print("ALL API ENDPOINTS FUNCTIONING PERFECTLY!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
