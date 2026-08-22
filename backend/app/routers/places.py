"""Google Places API proxy router."""

import logging
from typing import Annotated

import httpx
from fastapi import APIRouter, Query, HTTPException

from app.core import responses
from app.core.config import settings
from app.core.deps import CurrentUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/places", tags=["places"])


@router.get("/autocomplete", summary="Google Places Autocomplete")
async def autocomplete(
    query: Annotated[str, Query(min_length=2)],
    current_user: CurrentUser,
):
    """Proxy for Google Places Autocomplete to find cities/regions."""
    if not settings.GOOGLE_PLACES_API:
        raise HTTPException(status_code=501, detail="Google Places API key is not configured.")

    url = "https://maps.googleapis.com/maps/api/place/autocomplete/json"
    params = {
        "input": query,
        "types": "(regions)",
        "key": settings.GOOGLE_PLACES_API
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            return responses.success(data, "Autocomplete results")
    except Exception as e:
        logger.error(f"Places autocomplete failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch places data.")


@router.get("/search", summary="Google Places Text Search")
async def search_places(
    query: Annotated[str, Query(min_length=2)],
    type: Annotated[str | None, Query()] = None,
    current_user: CurrentUser = None,
):
    """Proxy for Google Places API (New) Text Search."""
    if not settings.GOOGLE_PLACES_API:
        raise HTTPException(status_code=501, detail="Google Places API key is not configured.")

    url = "https://places.googleapis.com/v1/places:searchText"
    headers = {
        "X-Goog-Api-Key": settings.GOOGLE_PLACES_API,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.photos,places.rating,places.userRatingCount,places.types",
        "Content-Type": "application/json"
    }
    
    payload = {
        "textQuery": query
    }
    if type:
        payload["includedType"] = type

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return responses.success(data, "Places search results")
    except Exception as e:
        logger.error(f"Places search failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to search places.")


@router.get("/{place_id}", summary="Google Place Details")
async def get_place_details(
    place_id: str,
    current_user: CurrentUser,
):
    """Proxy for Google Place Details."""
    if not settings.GOOGLE_PLACES_API:
        raise HTTPException(status_code=501, detail="Google Places API key is not configured.")

    url = f"https://places.googleapis.com/v1/places/{place_id}"
    headers = {
        "X-Goog-Api-Key": settings.GOOGLE_PLACES_API,
        "X-Goog-FieldMask": "id,displayName,formattedAddress,photos,rating,userRatingCount,types,regularOpeningHours,internationalPhoneNumber,websiteUri",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            return responses.success(data, "Place details")
    except Exception as e:
        logger.error(f"Place details failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch place details.")
