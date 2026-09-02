"""Bookable inventory: browsing and comparing the options for a trip slot."""

import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Query

from app.core import responses
from app.core.deps import CurrentUser, DbSession
from app.models.enums import ServiceType
from app.services.inventory_service import InventoryService

router = APIRouter(prefix="/components", tags=["inventory"])


@router.get("/alternatives", summary="Ranked alternatives for one trip component")
async def list_alternatives(
    current_user: CurrentUser,
    db: DbSession,
    service_type: Annotated[ServiceType, Query()],
    city: Annotated[str | None, Query(max_length=100)] = None,
    on_date: Annotated[date | None, Query()] = None,
    quantity: Annotated[int, Query(ge=1, le=50)] = 1,
    nights: Annotated[int, Query(ge=1, le=365)] = 1,
    max_unit_price: Annotated[Decimal | None, Query(ge=0)] = None,
    exclude_service_id: Annotated[uuid.UUID | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
):
    """What else could fill this slot, best match first.

    Ranked against the caller's stored preferences, and filtered by real
    per-date capacity, so an option that is sold out or blocked on the
    requested date never appears. Each result carries the component scores
    behind its ``match_score`` so the UI can show why it ranks where it does.

    ``exclude_service_id`` removes the option currently in the itinerary --
    used both when comparing before booking and when replacing something that
    has fallen through.
    """
    options = await InventoryService(db).find_alternatives(
        service_type=service_type,
        city=city,
        on_date=on_date,
        quantity=quantity,
        nights=nights,
        max_unit_price=max_unit_price,
        exclude_service_id=exclude_service_id,
        user_id=current_user.id,
        limit=limit,
    )
    return responses.success(
        {"items": options, "count": len(options)},
        "Alternatives ranked" if options else "No alternatives available",
    )
