"""Shared schema pieces: money, sorting, reordering, warnings."""

from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

# Money is Numeric(12,2) in the database, so 10 digits before the decimal
# point is the hard ceiling.
MAX_MONEY = Decimal("9999999999.99")

Money = Annotated[Decimal, Field(ge=0, le=MAX_MONEY, decimal_places=2)]
PositiveMoney = Annotated[
    Decimal, Field(gt=0, le=MAX_MONEY, decimal_places=2)
]

SortOrder = Literal["asc", "desc"]


def validate_money(value: Decimal | None, field: str = "Amount") -> Decimal | None:
    """Guard against more than two decimal places silently rounding.

    Pydantic's ``decimal_places`` rejects extra precision, but this is used by
    the service layer too, where a raw Decimal may arrive from elsewhere.
    """
    if value is None:
        return None
    if value.as_tuple().exponent < -2:
        raise ValueError(f"{field} cannot have more than 2 decimal places")
    return value


class ReorderRequest(BaseModel):
    """Payload for the reorder endpoints.

    The full ordered list is sent, not a pair of indices, so the server can
    verify it is an exact permutation of what exists and reject a stale or
    partial client view outright.
    """

    ordered_ids: Annotated[list[str], Field(min_length=1)]

    @field_validator("ordered_ids")
    @classmethod
    def _no_duplicates(cls, v: list[str]) -> list[str]:
        if len(set(v)) != len(v):
            raise ValueError("The same id appears more than once")
        return v


class WarningItem(BaseModel):
    """A non-fatal advisory (refinement R6).

    Overlapping stop dates and overlapping activity times are real user
    mistakes but not invalid data, so they are reported rather than rejected.
    """

    code: str
    message: str
