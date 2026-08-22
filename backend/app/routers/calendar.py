"""The standalone calendar screen (spec section 17, screen 11).

Distinct from ``/trips/{id}/calendar``: that one is scoped to a single trip,
this one spans every trip the user owns.
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.core import responses
from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.services.budget_service import BudgetService

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("", summary="Scheduled activities across all your trips")
async def user_calendar(
    current_user: CurrentUser,
    db: DbSession,
    start: Annotated[date | None, Query(description="Window start, inclusive")] = None,
    end: Annotated[date | None, Query(description="Window end, inclusive")] = None,
):
    if start is not None and end is not None and start > end:
        raise ValidationError(
            "The end date cannot be earlier than the start date",
            details={"fields": {"end": "Must be on or after the start date"}},
        )
    if start is not None and end is not None and (end - start).days > 731:
        raise ValidationError(
            "The calendar window cannot exceed two years",
            details={"fields": {"end": "Narrow the range"}},
        )

    return responses.success(
        await BudgetService(db).user_calendar(current_user, start=start, end=end),
        "OK",
    )
