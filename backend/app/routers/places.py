"""Google Places API (New) proxy router.

Provides India-wide real-world place autocomplete, text search, place details,
and photo streaming proxies using the Places API (New) v1.
"""

import logging
from typing import Annotated

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.core import responses
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/places", tags=["places"])


@router.get("/autocomplete", summary="Google Places Autocomplete (New)")
async def autocomplete(
    query: Annotated[str, Query(min_length=2)],
    country: Annotated[str, Query()] = "in",
):
    """Proxy for Google Places API (New) Autocomplete across India and globally."""
    if not settings.GOOGLE_PLACES_API:
        raise HTTPException(status_code=501, detail="Google Places API key is not configured.")

    url = "https://places.googleapis.com/v1/places:autocomplete"
    headers = {
        "X-Goog-Api-Key": settings.GOOGLE_PLACES_API,
        "Content-Type": "application/json",
    }
    payload: dict = {
        "input": query,
    }
    if country and country.lower() != "all":
        payload["includedRegionCodes"] = [c.strip().lower() for c in country.split(",") if c.strip()]

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

            # Transform Places API (New) suggestions to standard normalized format
            predictions = []
            for item in data.get("suggestions", []):
                pred = item.get("placePrediction")
                if not pred:
                    continue

                place_id = pred.get("placeId", "")
                full_text = pred.get("text", {}).get("text", "")
                structured = pred.get("structuredFormat", {})
                main_text = structured.get("mainText", {}).get("text", full_text)
                secondary_text = structured.get("secondaryText", {}).get("text", "")

                predictions.append({
                    "place_id": place_id,
                    "description": full_text,
                    "structured_formatting": {
                        "main_text": main_text,
                        "secondary_text": secondary_text,
                    },
                    "types": pred.get("types", []),
                })

            return responses.success({"predictions": predictions}, "Autocomplete results")
    except httpx.HTTPStatusError as e:
        logger.error(f"Places autocomplete HTTP error: {e.response.status_code} - {e.response.text}")
        raise HTTPException(status_code=e.response.status_code, detail="Google Places autocomplete failed.")
    except Exception as e:
        logger.error(f"Places autocomplete failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch places data.")


@router.get("/search", summary="Google Places Text Search (New)")
async def search_places(
    query: Annotated[str, Query(min_length=2)],
    type: Annotated[str | None, Query()] = None,
):
    """Proxy for Google Places API (New) Text Search with location coordinates."""
    if not settings.GOOGLE_PLACES_API:
        raise HTTPException(status_code=501, detail="Google Places API key is not configured.")

    url = "https://places.googleapis.com/v1/places:searchText"
    headers = {
        "X-Goog-Api-Key": settings.GOOGLE_PLACES_API,
        "X-Goog-FieldMask": (
            "places.id,places.displayName,places.formattedAddress,places.location,"
            "places.photos,places.rating,places.userRatingCount,places.types,places.googleMapsUri"
        ),
        "Content-Type": "application/json",
    }

    payload: dict = {
        "textQuery": query,
    }
    if type and type.lower() not in {"all", "any"}:
        payload["includedType"] = type

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return responses.success(data, "Places search results")
    except httpx.HTTPStatusError as e:
        logger.error(f"Places search HTTP error: {e.response.status_code} - {e.response.text}")
        raise HTTPException(status_code=e.response.status_code, detail="Google Places search failed.")
    except Exception as e:
        logger.error(f"Places search failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to search places.")


@router.get("/photo", summary="Proxy Google Place Photo")
async def get_place_photo(
    name: Annotated[str, Query(description="Photo resource name e.g. places/.../photos/...")],
    max_height: Annotated[int, Query(ge=50, le=1600)] = 500,
    max_width: Annotated[int, Query(ge=50, le=1600)] = 800,
):
    """Secure backend proxy to stream Google Place photos."""
    if not settings.GOOGLE_PLACES_API:
        raise HTTPException(status_code=501, detail="Google Places API key is not configured.")

    url = f"https://places.googleapis.com/v1/{name}/media"
    params = {
        "maxHeightPx": max_height,
        "maxWidthPx": max_width,
        "key": settings.GOOGLE_PLACES_API,
    }

    try:
        client = httpx.AsyncClient(timeout=15.0, follow_redirects=True)
        req = client.build_request("GET", url, params=params)
        res = await client.send(req, stream=True)
        if res.status_code != 200:
            await res.aclose()
            await client.aclose()
            raise HTTPException(status_code=res.status_code, detail="Failed to retrieve photo from Google.")

        async def stream_content():
            try:
                async for chunk in res.aiter_bytes():
                    yield chunk
            finally:
                await res.aclose()
                await client.aclose()

        content_type = res.headers.get("Content-Type", "image/jpeg")
        return StreamingResponse(stream_content(), media_type=content_type)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Place photo proxy failed: {e}")
        raise HTTPException(status_code=500, detail="Could not proxy place photo.")


@router.get("/{place_id}", summary="Google Place Details (New)")
async def get_place_details(
    place_id: str,
):
    """Proxy for Google Place Details with coordinates and rich metadata."""
    if not settings.GOOGLE_PLACES_API:
        raise HTTPException(status_code=501, detail="Google Places API key is not configured.")

    url = f"https://places.googleapis.com/v1/places/{place_id}"
    headers = {
        "X-Goog-Api-Key": settings.GOOGLE_PLACES_API,
        "X-Goog-FieldMask": (
            "id,displayName,formattedAddress,location,photos,rating,userRatingCount,"
            "types,regularOpeningHours,internationalPhoneNumber,websiteUri,googleMapsUri"
        ),
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            return responses.success(data, "Place details")
    except httpx.HTTPStatusError as e:
        logger.error(f"Place details HTTP error: {e.response.status_code} - {e.response.text}")
        raise HTTPException(status_code=e.response.status_code, detail="Google Place details failed.")
    except Exception as e:
        logger.error(f"Place details failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch place details.")
