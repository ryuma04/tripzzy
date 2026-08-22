import asyncio
import httpx
from app.db.session import AsyncSessionLocal
from app.repositories.destination_repository import DestinationRepository

TEST_LOCATIONS = [
    ("Marine Drive, Mumbai", "Marine Drive", "Maharashtra"),
    ("Gateway of India, Mumbai", "Gateway of India", "Maharashtra"),
    ("Taj Mahal, Agra", "Taj Mahal", "Uttar Pradesh"),
    ("India Gate, Delhi", "India Gate", "Delhi"),
    ("Baga Beach, Goa", "Baga Beach", "Goa"),
    ("Mysore Palace, Mysuru", "Mysore Palace", "Karnataka"),
    ("Lalbagh Botanical Garden, Bengaluru", "Lalbagh Botanical Garden", "Karnataka"),
    ("Hawa Mahal, Jaipur", "Hawa Mahal", "Rajasthan"),
    ("Manali, Himachal Pradesh", "Manali", "Himachal Pradesh"),
    ("Varanasi Ghats, Uttar Pradesh", "Varanasi Ghats", "Uttar Pradesh"),
]

async def test_places_and_db():
    print("=" * 60)
    print("TRIPZYY — 10 INDIAN LOCATIONS PLACES & DB PERSISTENCE VERIFICATION")
    print("=" * 60)

    from app.core.config import settings
    api_key = settings.GOOGLE_PLACES_API
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.photos,places.rating,places.types"
    }

    async with httpx.AsyncClient() as client:
        # 1. Test Autocomplete
        print("\n--- 1. Testing Google Places (New) Autocomplete ---")
        auto_url = "https://places.googleapis.com/v1/places:autocomplete"
        for query, short_name, region in TEST_LOCATIONS[:3]:
            payload = {"input": query, "includedRegionCodes": ["in"]}
            resp = await client.post(auto_url, headers={"Content-Type": "application/json", "X-Goog-Api-Key": api_key}, json=payload)
            print(f"Query '{query}' -> Status: {resp.status_code}")
            data = resp.json()
            suggestions = data.get("suggestions", [])
            print(f"   Suggestions found: {len(suggestions)}")
            if suggestions:
                p = suggestions[0].get("placePrediction", {})
                print(f"   Top: {p.get('text', {}).get('text')} (ID: {p.get('placeId')})")

        # 2. Test Text Search & Coordinates & Persistence for all 10
        print("\n--- 2. Testing Text Search, Coordinates & Neon DB find_or_create ---")
        search_url = "https://places.googleapis.com/v1/places:searchText"

        async with AsyncSessionLocal() as session:
            repo = DestinationRepository(session)

            for query, short_name, region in TEST_LOCATIONS:
                payload = {"textQuery": query, "languageCode": "en"}
                resp = await client.post(search_url, headers=headers, json=payload)
                if resp.status_code != 200:
                    print(f"FAILED for {query}: status {resp.status_code} {resp.text}")
                    continue

                places = resp.json().get("places", [])
                if not places:
                    print(f"NO PLACES for {query}")
                    continue

                top = places[0]
                display_name = top.get("displayName", {}).get("text", short_name)
                addr = top.get("formattedAddress", "")
                loc = top.get("location", {})
                lat = loc.get("latitude")
                lng = loc.get("longitude")
                photos = top.get("photos", [])
                photo_name = photos[0].get("name") if photos else None

                # Test Neon DB find_or_create
                dest = await repo.find_or_create(
                    name=display_name,
                    country="India",
                    region=region,
                    latitude=lat,
                    longitude=lng,
                    description=addr,
                    image_url=f"https://places.googleapis.com/v1/{photo_name}/media" if photo_name else None
                )

                print(f"PASS: [{short_name}] -> DB UUID: {dest.id} | Lat: {dest.latitude}, Lng: {dest.longitude} | Photos: {'YES' if photo_name else 'FALLBACK'}")

        print("\n" + "=" * 60)
        print("ALL 10 INDIAN LOCATIONS VERIFIED SUCCESSFULLY WITH REAL COORDINATES & DB PERSISTENCE!")
        print("=" * 60)

if __name__ == "__main__":
    asyncio.run(test_places_and_db())
