"""FastAPI application factory."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError as PydanticValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core import responses
from app.core.config import settings
from app.core.exceptions import AppError, ErrorCode

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
# These are extremely chatty at DEBUG and drown out anything useful.
for noisy in ("passlib", "asyncio", "aiosmtplib", "multipart"):
    logging.getLogger(noisy).setLevel(logging.WARNING)

logger = logging.getLogger("tripzyy")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        description="Travel planning and itinerary management API",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_origin_regex=settings.CORS_ORIGIN_REGEX,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    _register_exception_handlers(app)
    _register_routers(app)

    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        return {"status": "ok", "environment": settings.ENVIRONMENT}

    return app


def _register_exception_handlers(app: FastAPI) -> None:
    """Force every error onto the spec section 25 envelope.

    Without these, FastAPI's default ``{"detail": ...}`` shape would leak out
    and the frontend would need two parsers.
    """

    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        return responses.error(
            exc.message,
            code=exc.code,
            status_code=exc.status_code,
            details=exc.details,
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError):
        # Flatten Pydantic's errors into {"field.path": "message"} so the
        # frontend can drop each message next to the right input.
        fields: dict[str, str] = {}
        for err in exc.errors():
            loc = [str(p) for p in err["loc"] if p not in ("body", "query", "path")]
            fields[".".join(loc) or "body"] = err["msg"]
        return responses.error(
            "Validation failed",
            code=ErrorCode.VALIDATION_ERROR,
            status_code=422,
            details={"fields": fields},
        )

    @app.exception_handler(PydanticValidationError)
    async def _pydantic_error(_: Request, exc: PydanticValidationError):
        """Catch validation raised inside a ``Depends()`` model.

        FastAPI only wraps body/query parsing into RequestValidationError.
        A model used as a dependency -- the search-filter models, for
        instance -- raises the raw pydantic error instead, which would
        otherwise surface as a 500 rather than a 422.
        """
        fields: dict[str, str] = {}
        for err in exc.errors():
            loc = [str(p) for p in err["loc"] if p not in ("body", "query", "path")]
            fields[".".join(loc) or "body"] = err["msg"]
        return responses.error(
            "Validation failed",
            code=ErrorCode.VALIDATION_ERROR,
            status_code=422,
            details={"fields": fields},
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException):
        code = {
            401: ErrorCode.UNAUTHORIZED,
            403: ErrorCode.FORBIDDEN,
            404: ErrorCode.NOT_FOUND,
            409: ErrorCode.CONFLICT,
            429: ErrorCode.RATE_LIMITED,
        }.get(exc.status_code, ErrorCode.INTERNAL_ERROR)
        return responses.error(
            str(exc.detail), code=code, status_code=exc.status_code
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        # Log the real cause, but never expose internals to the client.
        logger.exception("Unhandled error: %s", exc)
        return responses.error(
            "An unexpected error occurred",
            code=ErrorCode.INTERNAL_ERROR,
            status_code=500,
            details={"error": str(exc)} if settings.DEBUG else {},
        )


def _register_routers(app: FastAPI) -> None:
    """Mount routers as each phase lands."""
    from app.routers import (  # noqa: PLC0415
        activities,
        adaptation,
        admin,
        auth,
        billing,
        bookings,
        calendar,
        community,
        destinations,
        engagement,
        inventory,
        itinerary,
        logistics,
        notifications,
        operator,
        places,
        stops,
        trips,
        users,
    )

    prefix = settings.API_V1_PREFIX
    for module in (
        auth, users, trips, stops, itinerary, destinations, activities,
        calendar, admin, places, notifications, inventory, operator
    ):
        app.include_router(module.router, prefix=prefix)

    for extra in (community.community_router, community.public_router):
        app.include_router(extra, prefix=prefix)

    for split_router in (billing.trip_splits_router, billing.splits_router):
        app.include_router(split_router, prefix=prefix)

    for booking_router in (
        bookings.trip_bookings_router,
        bookings.bookings_router,
    ):
        app.include_router(booking_router, prefix=prefix)

    for change_router in (
        adaptation.trip_changes_router,
        adaptation.changes_router,
    ):
        app.include_router(change_router, prefix=prefix)

    for engagement_router in (
        engagement.trip_assist_router,
        engagement.assist_router,
        engagement.reviews_router,
    ):
        app.include_router(engagement_router, prefix=prefix)

    for item_router in (
        logistics.transport_router,
        logistics.accommodation_router,
        logistics.expense_router,
    ):
        app.include_router(item_router, prefix=prefix)


app = create_app()
