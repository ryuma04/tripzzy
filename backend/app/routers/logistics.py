"""Transport, accommodation and expense endpoints (spec sections 15, 19, 20).

Collection routes live under their parent (``/trips/{id}/transport``,
``/stops/{id}/accommodations``); item routes are flat, matching spec section 27.
"""

import uuid

from fastapi import APIRouter

from app.core import responses
from app.core.deps import CurrentUser, DbSession
from app.schemas.logistics import (
    AccommodationResponse,
    AccommodationUpdateRequest,
    ExpenseResponse,
    ExpenseUpdateRequest,
    TransportResponse,
    TransportUpdateRequest,
)
from app.services.logistics_service import LogisticsService

transport_router = APIRouter(prefix="/transport", tags=["transport"])
accommodation_router = APIRouter(prefix="/accommodations", tags=["accommodations"])
expense_router = APIRouter(prefix="/expenses", tags=["expenses"])


# -- transport -------------------------------------------------------------

@transport_router.get("/{transport_id}", summary="Transport detail")
async def get_transport(
    transport_id: uuid.UUID, current_user: CurrentUser, db: DbSession
):
    service = LogisticsService(db)
    row = await service.get_owned_transport(transport_id, current_user)
    return responses.success(
        TransportResponse(**service.transport_out(row)).model_dump(), "OK"
    )


@transport_router.put("/{transport_id}", summary="Update transport")
async def update_transport(
    transport_id: uuid.UUID,
    payload: TransportUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    row = await LogisticsService(db).update_transport(
        transport_id, payload, current_user
    )
    return responses.success(
        TransportResponse(**row).model_dump(), "Transport updated successfully"
    )


@transport_router.delete("/{transport_id}", summary="Delete transport")
async def delete_transport(
    transport_id: uuid.UUID, current_user: CurrentUser, db: DbSession
):
    await LogisticsService(db).delete_transport(transport_id, current_user)
    return responses.success(None, "Transport deleted successfully")


# -- accommodation ---------------------------------------------------------

@accommodation_router.get("/{accommodation_id}", summary="Accommodation detail")
async def get_accommodation(
    accommodation_id: uuid.UUID, current_user: CurrentUser, db: DbSession
):
    service = LogisticsService(db)
    row = await service.get_owned_accommodation(accommodation_id, current_user)
    return responses.success(
        AccommodationResponse(**service.accommodation_out(row)).model_dump(), "OK"
    )


@accommodation_router.put("/{accommodation_id}", summary="Update accommodation")
async def update_accommodation(
    accommodation_id: uuid.UUID,
    payload: AccommodationUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    row = await LogisticsService(db).update_accommodation(
        accommodation_id, payload, current_user
    )
    return responses.success(
        AccommodationResponse(**row).model_dump(),
        "Accommodation updated successfully",
    )


@accommodation_router.delete("/{accommodation_id}", summary="Delete accommodation")
async def delete_accommodation(
    accommodation_id: uuid.UUID, current_user: CurrentUser, db: DbSession
):
    await LogisticsService(db).delete_accommodation(accommodation_id, current_user)
    return responses.success(None, "Accommodation deleted successfully")


# -- expenses --------------------------------------------------------------

@expense_router.get("/{expense_id}", summary="Expense detail")
async def get_expense(
    expense_id: uuid.UUID, current_user: CurrentUser, db: DbSession
):
    expense = await LogisticsService(db).get_owned_expense(expense_id, current_user)
    return responses.success(
        ExpenseResponse.model_validate(expense).model_dump(), "OK"
    )


@expense_router.put("/{expense_id}", summary="Update an expense")
async def update_expense(
    expense_id: uuid.UUID,
    payload: ExpenseUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    expense = await LogisticsService(db).update_expense(
        expense_id, payload, current_user
    )
    return responses.success(
        ExpenseResponse.model_validate(expense).model_dump(),
        "Expense updated successfully",
    )


@expense_router.delete("/{expense_id}", summary="Delete an expense")
async def delete_expense(
    expense_id: uuid.UUID, current_user: CurrentUser, db: DbSession
):
    await LogisticsService(db).delete_expense(expense_id, current_user)
    return responses.success(None, "Expense deleted successfully")
