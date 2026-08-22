"""The single response envelope every endpoint returns (spec section 25).

Success::

    {"success": true, "message": "...", "data": {...}, "error": null}

Error::

    {"success": false, "message": "...", "data": null,
     "error": {"code": "VALIDATION_ERROR", "details": {...}}}

Paginated payloads nest ``{"items": [...], "pagination": {...}}`` *inside*
``data``. Spec section 25 mandates the envelope on every endpoint and section
26 mandates the pagination shape; nesting is what satisfies both at once.
"""

import math
from decimal import Decimal
from typing import Any, Generic, Sequence, TypeVar

from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field

T = TypeVar("T")

# Money is Numeric(12,2) in PostgreSQL. FastAPI's default encoder turns a
# Decimal into a JSON float, which is the wrong representation for currency --
# it invites accumulated rounding error on the client. Encoding every Decimal
# as a string keeps the exact value intact end to end.
DECIMAL_AS_STRING: dict[Any, Any] = {Decimal: str}


def encode(value: Any) -> Any:
    return jsonable_encoder(value, custom_encoder=DECIMAL_AS_STRING)


class ErrorDetail(BaseModel):
    code: str
    details: dict[str, Any] = Field(default_factory=dict)


class Envelope(BaseModel, Generic[T]):
    success: bool = True
    message: str = "OK"
    data: T | None = None
    error: ErrorDetail | None = None


class PaginationMeta(BaseModel):
    page: int
    limit: int
    total: int
    total_pages: int

    @classmethod
    def build(cls, *, page: int, limit: int, total: int) -> "PaginationMeta":
        return cls(
            page=page,
            limit=limit,
            total=total,
            total_pages=math.ceil(total / limit) if limit else 0,
        )


class Page(BaseModel, Generic[T]):
    items: list[T]
    pagination: PaginationMeta


def success(
    data: Any = None,
    message: str = "OK",
    *,
    status_code: int = 200,
    warnings: Sequence[str] | None = None,
) -> JSONResponse:
    """Build a success envelope.

    ``warnings`` (refinement R6) carries non-fatal advisories such as
    overlapping stop dates: the request succeeded, but the UI should flag it.
    """
    payload = encode(data)
    if warnings:
        if payload is None:
            payload = {}
        if isinstance(payload, dict):
            payload["warnings"] = list(warnings)
    return JSONResponse(
        status_code=status_code,
        content={
            "success": True,
            "message": message,
            "data": payload,
            "error": None,
        },
    )


def paginated(
    items: Sequence[Any],
    *,
    page: int,
    limit: int,
    total: int,
    message: str = "OK",
) -> JSONResponse:
    return success(
        {
            "items": encode(items),
            "pagination": PaginationMeta.build(
                page=page, limit=limit, total=total
            ).model_dump(),
        },
        message=message,
    )


def error(
    message: str,
    *,
    code: str,
    status_code: int,
    details: dict[str, Any] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "message": message,
            "data": None,
            "error": {"code": code, "details": encode(details or {})},
        },
    )
