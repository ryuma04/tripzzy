"""Trip endpoints (spec section 27, /trips)."""

import logging
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Query

logger = logging.getLogger(__name__)

from app.core import responses
from app.core.deps import CurrentUser, DbSession, Pagination
from app.core.exceptions import ValidationError
from app.models.enums import ExpenseCategory, TripStatus
from app.schemas.common import ReorderRequest
from app.schemas.logistics import (
    ExpenseCreateRequest,
    ExpenseResponse,
    TransportCreateRequest,
    TransportResponse,
)
from app.schemas.stop import (
    ItineraryDay,
    ItineraryActivityCreateRequest,
    StopCreateRequest,
    StopDetail,
    StopResponse,
)
from app.schemas.trip import (
    ShareResponse,
    TripCreateRequest,
    TripGenerateRequest,
    SelectAIPlanRequest,
    TripDetail,
    TripSummary,
    TripUpdateRequest,
)
from app.services.budget_service import BudgetService
from app.services.itinerary_service import ItineraryService
from app.services.logistics_service import LogisticsService
from app.services.trip_service import TripService
from app.services.ai_service import AIService
from app.repositories.destination_repository import DestinationRepository

router = APIRouter(prefix="/trips", tags=["trips"])

SortBy = Literal["created_at", "updated_at", "start_date", "end_date", "title", "budget"]


@router.get("", summary="List your trips")
async def list_trips(
    current_user: CurrentUser,
    db: DbSession,
    pagination: Pagination,
    status: Annotated[TripStatus | None, Query()] = None,
    sort_by: Annotated[SortBy, Query()] = "created_at",
    sort_order: Annotated[Literal["asc", "desc"], Query()] = "desc",
):
    items, total = await TripService(db).list_for_user(
        current_user,
        offset=pagination.offset,
        limit=pagination.limit,
        status=status,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return responses.paginated(
        [TripSummary(**t).model_dump() for t in items],
        page=pagination.page,
        limit=pagination.limit,
        total=total,
    )


@router.post("/generate-options", summary="Generate two AI travel plan options (Budget & Premium)")
async def generate_trip_options(
    payload: TripGenerateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Generate EXACTLY TWO distinct travel plans: Budget Smart and Premium Experience."""
    dest_repo = DestinationRepository(db)
    destinations = []
    for d_id in payload.destination_ids:
        d = await dest_repo.get(d_id)
        if d:
            destinations.append(d)
    
    dest_names = [d.name for d in destinations] if destinations else ["Goa"]
    ai_service = AIService()

    options = await ai_service.generate_two_itinerary_options(
        destinations=dest_names,
        start_date=str(payload.start_date),
        end_date=str(payload.end_date),
        budget_tier=payload.budget_tier,
        travel_style=payload.travel_style,
        traveller_count=payload.traveller_count,
    )
    return responses.success(options, "Generated two AI trip options successfully")


@router.post("/select-plan", summary="Select and persist an AI generated plan", status_code=201)
async def select_ai_plan(
    payload: SelectAIPlanRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Persist chosen AI plan into real Trip, Stops, and Itinerary Activities with plan_type recorded."""
    plan = payload.selected_plan
    plan_type = plan.get("plan_type", "BUDGET")
    badge_label = "Best Value" if plan_type == "BUDGET" else "Premium Experience"
    
    dest_repo = DestinationRepository(db)
    destinations = []
    for d_id in payload.destination_ids:
        d = await dest_repo.get(d_id)
        if d:
            destinations.append(d)

    # Determine dates
    try:
        start_date = payload.start_date or date.fromisoformat(str(plan.get("stops", [{}])[0].get("arrival_date")))
    except Exception:
        start_date = date.today()

    try:
        end_date = payload.end_date or date.fromisoformat(str(plan.get("stops", [{}])[-1].get("departure_date")))
    except Exception:
        end_date = start_date

    if start_date > end_date:
        end_date = start_date

    total_cost = plan.get("total_cost", 25000)
    cost_val = str(total_cost)

    # 1. Create Trip with AI Preference in description
    trip_title = plan.get("title", f"Trip to {destinations[0].name if destinations else 'India'}")[:120]
    description = f"AI Preference: {badge_label} | {plan.get('description', '')}"[:2000]

    trip_create = TripCreateRequest(
        title=trip_title,
        description=description,
        start_date=start_date,
        end_date=end_date,
        budget=cost_val,
        traveller_count=payload.traveller_count or 1,
    )

    trip_svc = TripService(db)
    created_trip = await trip_svc.create(trip_create, current_user)
    trip_id = created_trip["id"]

    # 2. Create Stops and Activities
    itin_svc = ItineraryService(db)
    stops_plan = plan.get("stops", [])
    if not stops_plan and destinations:
        stops_plan = [{"destination_name": d.name, "arrival_date": str(start_date), "departure_date": str(end_date), "activities": []} for d in destinations]

    for i, stop_plan in enumerate(stops_plan):
        dest_name = stop_plan.get("destination_name", "")
        matched_dest = next((d for d in destinations if d.name.lower() in dest_name.lower()), destinations[i % len(destinations)] if destinations else None)
        
        try:
            arr = date.fromisoformat(str(stop_plan.get("arrival_date", start_date)))
        except Exception:
            arr = start_date
        try:
            dep = date.fromisoformat(str(stop_plan.get("departure_date", end_date)))
        except Exception:
            dep = end_date

        if arr < start_date: arr = start_date
        if dep > end_date: dep = end_date
        if arr > dep: dep = arr

        stop_create = StopCreateRequest(
            city_name=matched_dest.name if matched_dest else dest_name or "Destination",
            country=matched_dest.country if matched_dest else "India",
            destination_id=matched_dest.id if matched_dest else None,
            arrival_date=arr,
            departure_date=dep,
            order_index=i,
        )
        try:
            created_stop, _ = await itin_svc.add_stop(trip_id, stop_create, current_user)
            stop_id = created_stop["id"]

            for j, act_plan in enumerate(stop_plan.get("activities", [])):
                act_date_str = act_plan.get("date", arr.isoformat())
                try:
                    act_date = date.fromisoformat(str(act_date_str))
                except Exception:
                    act_date = arr
                if act_date < arr: act_date = arr
                if act_date > dep: act_date = dep

                act_cost = act_plan.get("estimated_cost", 0)
                try:
                    act_cost_val = Decimal(str(act_cost))
                except Exception:
                    act_cost_val = Decimal("0")

                act_create = ItineraryActivityCreateRequest(
                    title=str(act_plan.get("title", "Curated Experience"))[:160],
                    activity_date=act_date,
                    estimated_cost=act_cost_val,
                    notes=str(act_plan.get("notes", ""))[:2000] if act_plan.get("notes") else None,
                    order_index=j,
                )
                await itin_svc.add_activity(stop_id, act_create, current_user)
        except Exception as err:
            logger.warning(f"Failed to add stop/activity during select_ai_plan: {err}")

    final_trip = await trip_svc.detail(trip_id, current_user)
    return responses.success(TripDetail(**final_trip).model_dump(), "Selected AI plan saved to trip successfully", status_code=201)


@router.post("/generate", summary="Generate a trip using AI", status_code=201)
async def generate_trip(
    payload: TripGenerateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    # 1. Fetch destinations to get their names
    dest_repo = DestinationRepository(db)
    destinations = []
    for d_id in payload.destination_ids:
        d = await dest_repo.get(d_id)
        if d:
            destinations.append(d)
    
    if not destinations:
        raise ValidationError("At least one valid destination is required.")

    # 2. Call AI Service
    ai_service = AIService()
    dest_names = [d.name for d in destinations]
    
    try:
        ai_plan = await ai_service.generate_itinerary(
            destinations=dest_names,
            start_date=str(payload.start_date),
            end_date=str(payload.end_date),
            budget_tier=payload.budget_tier,
            travel_style=payload.travel_style,
            traveller_count=payload.traveller_count,
        )
    except Exception as e:
        raise ValidationError(f"AI Generation failed: {str(e)}")

    # 3. Create the Base Trip
    trip_create = TripCreateRequest(
        title=ai_plan.get("title", f"Trip to {dest_names[0]}"),
        description=ai_plan.get("description", ""),
        start_date=payload.start_date,
        end_date=payload.end_date,
        budget=str(ai_plan.get("estimated_budget", 0)),
        traveller_count=payload.traveller_count,
    )
    
    trip_svc = TripService(db)
    created_trip = await trip_svc.create(trip_create, current_user)
    trip_id = created_trip["id"]
    
    # 4. Create Stops and Activities
    itin_svc = ItineraryService(db)
    stops_plan = ai_plan.get("stops", [])
    if not stops_plan:
        stops_plan = [{"destination_name": d.name, "arrival_date": str(payload.start_date), "departure_date": str(payload.end_date), "activities": []} for d in destinations]
    
    for i, stop_plan in enumerate(stops_plan):
        # Try to match destination name
        dest_name = stop_plan.get("destination_name", "")
        matched_dest = next((d for d in destinations if d.name.lower() in dest_name.lower()), destinations[i % len(destinations)])
        
        # Clamp dates
        try:
            arr = date.fromisoformat(str(stop_plan.get("arrival_date", payload.start_date)))
        except Exception:
            arr = payload.start_date
        try:
            dep = date.fromisoformat(str(stop_plan.get("departure_date", payload.end_date)))
        except Exception:
            dep = payload.end_date

        if arr < payload.start_date:
            arr = payload.start_date
        if dep > payload.end_date:
            dep = payload.end_date
        if arr > dep:
            dep = arr

        stop_create = StopCreateRequest(
            city_name=matched_dest.name,
            country=matched_dest.country or "India",
            destination_id=matched_dest.id,
            arrival_date=arr,
            departure_date=dep,
            order_index=i
        )
        try:
            created_stop, _ = await itin_svc.add_stop(trip_id, stop_create, current_user)
            stop_id = created_stop["id"]
            
            # Create activities for this stop
            for j, act_plan in enumerate(stop_plan.get("activities", [])):
                act_date_str = act_plan.get("date", arr.isoformat())
                try:
                    act_date = date.fromisoformat(str(act_date_str))
                except Exception:
                    act_date = arr
                if act_date < arr:
                    act_date = arr
                if act_date > dep:
                    act_date = dep

                cost = act_plan.get("estimated_cost", 0)
                try:
                    cost_val = Decimal(str(cost))
                except Exception:
                    cost_val = Decimal("0")

                act_create = ItineraryActivityCreateRequest(
                    title=str(act_plan.get("title", "Curated Activity"))[:160],
                    activity_date=act_date,
                    estimated_cost=cost_val,
                    notes=str(act_plan.get("notes", ""))[:2000] if act_plan.get("notes") else None,
                    order_index=j
                )
                await itin_svc.add_activity(stop_id, act_create, current_user)
        except Exception as e:
            logger.warning(f"Failed to add stop/activity during generation: {e}")

    # Fetch final complete trip
    final_trip = await trip_svc.detail(trip_id, current_user)
    return responses.success(TripDetail(**final_trip).model_dump(), "AI Itinerary generated successfully", status_code=201)

@router.post("", summary="Create a trip", status_code=201)
async def create_trip(
    payload: TripCreateRequest,
    current_user: CurrentUser, db: DbSession
):
    trip = await TripService(db).create(payload, current_user)
    return responses.success(
        TripDetail(**trip).model_dump(), "Trip created successfully", status_code=201
    )


@router.get("/{trip_id}", summary="Trip detail")
async def get_trip(trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    trip = await TripService(db).detail(trip_id, current_user)
    return responses.success(TripDetail(**trip).model_dump(), "OK")


@router.put("/{trip_id}", summary="Update a trip")
async def update_trip(
    trip_id: uuid.UUID,
    payload: TripUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
    cascade: Annotated[
        bool,
        Query(
            description="Clamp stops and activities that the new dates would "
            "leave outside the trip, instead of rejecting the change"
        ),
    ] = False,
):
    trip = await TripService(db).update(
        trip_id, payload, current_user, cascade=cascade
    )
    return responses.success(
        TripDetail(**trip).model_dump(), "Trip updated successfully"
    )


@router.delete("/{trip_id}", summary="Delete a trip")
async def delete_trip(trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    await TripService(db).delete(trip_id, current_user)
    return responses.success(None, "Trip deleted successfully")


@router.get("/{trip_id}/stops", summary="List the trip's stops")
async def list_stops(trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    stops = await ItineraryService(db).list_stops(trip_id, current_user)
    return responses.success(
        {"items": [StopDetail(**s).model_dump() for s in stops]}, "OK"
    )


@router.post("/{trip_id}/stops", summary="Add a stop", status_code=201)
async def add_stop(
    trip_id: uuid.UUID,
    payload: StopCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    stop, warnings = await ItineraryService(db).add_stop(
        trip_id, payload, current_user
    )
    return responses.success(
        StopDetail(**stop).model_dump(),
        "Stop added successfully",
        status_code=201,
        warnings=warnings,
    )


@router.put("/{trip_id}/stops/reorder", summary="Reorder the trip's stops")
async def reorder_stops(
    trip_id: uuid.UUID,
    payload: ReorderRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Takes the complete ordering and applies it in one transaction."""
    stops = await ItineraryService(db).reorder_stops(
        trip_id, payload.ordered_ids, current_user
    )
    return responses.success(
        {"items": [StopDetail(**s).model_dump() for s in stops]},
        "Stops reordered successfully",
    )


@router.get("/{trip_id}/itinerary", summary="Day-by-day itinerary")
async def get_itinerary(
    trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession
):
    """Spec section 13: activities grouped by day across every stop."""
    data = await ItineraryService(db).itinerary(trip_id, current_user)
    data["days"] = [ItineraryDay(**d).model_dump() for d in data["days"]]
    data["stops"] = [StopResponse(**s).model_dump() for s in data["stops"]]
    return responses.success(data, "OK")


@router.get("/{trip_id}/budget", summary="Budget summary")
async def get_budget(trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    """Spec section 14: planned estimate vs actual spend, by category."""
    return responses.success(
        await BudgetService(db).budget(trip_id, current_user), "OK"
    )


@router.get("/{trip_id}/calendar", summary="Calendar events for the trip")
async def get_calendar(
    trip_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
    month: Annotated[int | None, Query(ge=1, le=12)] = None,
    year: Annotated[int | None, Query(ge=1970, le=2200)] = None,
):
    """Spec section 17. ``month`` and ``year`` must be supplied together."""
    if (month is None) != (year is None):
        raise ValidationError(
            "month and year must be provided together",
            details={"fields": {"month": "Provide both month and year, or neither"}},
        )
    return responses.success(
        await BudgetService(db).calendar(
            trip_id, current_user, month=month, year=year
        ),
        "OK",
    )


@router.get("/{trip_id}/expenses", summary="List expenses")
async def list_expenses(
    trip_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
    page: Pagination,
    category: ExpenseCategory | None = None,
):
    rows, total, total_amount = await LogisticsService(db).list_expenses(
        trip_id,
        current_user,
        offset=page.offset,
        limit=page.limit,
        category=category,
    )
    return responses.success(
        {
            "items": [
                ExpenseResponse.model_validate(e).model_dump() for e in rows
            ],
            "pagination": {
                "page": page.page,
                "limit": page.limit,
                "total": total,
                "total_pages": (total + page.limit - 1) // page.limit,
            },
            "total_amount": total_amount,
        },
        "OK",
    )


@router.post("/{trip_id}/expenses", summary="Record an expense", status_code=201)
async def add_expense(
    trip_id: uuid.UUID,
    payload: ExpenseCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    expense = await LogisticsService(db).add_expense(
        trip_id, payload, current_user
    )
    return responses.success(
        ExpenseResponse.model_validate(expense).model_dump(),
        "Expense recorded successfully",
        status_code=201,
    )


@router.get("/{trip_id}/transport", summary="List transport legs")
async def list_transport(
    trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession
):
    rows = await LogisticsService(db).list_transport(trip_id, current_user)
    return responses.success(
        {"items": [TransportResponse(**t).model_dump() for t in rows]}, "OK"
    )


@router.post("/{trip_id}/transport", summary="Add a transport leg", status_code=201)
async def add_transport(
    trip_id: uuid.UUID,
    payload: TransportCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    row = await LogisticsService(db).add_transport(trip_id, payload, current_user)
    return responses.success(
        TransportResponse(**row).model_dump(),
        "Transport added successfully",
        status_code=201,
    )


@router.post("/{trip_id}/share", summary="Publish a trip to the community")
async def share_trip(trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    trip = await TripService(db).enable_share(trip_id, current_user)
    return responses.success(
        ShareResponse(
            share_slug=trip.share_slug,
            share_url=f"/t/{trip.share_slug}",
            is_public=True,
        ).model_dump(),
        "Trip shared successfully",
    )


@router.delete("/{trip_id}/share", summary="Unpublish a trip")
async def unshare_trip(trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    await TripService(db).disable_share(trip_id, current_user)
    return responses.success(None, "Trip is no longer shared")
