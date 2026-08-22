"""Application error hierarchy.

Every error raised by the app carries a stable machine-readable ``code`` so the
frontend can branch on it without string-matching human messages. Handlers in
``app.main`` render these into the spec section 25 envelope.
"""

from typing import Any


class ErrorCode:
    VALIDATION_ERROR = "VALIDATION_ERROR"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    NOT_FOUND = "NOT_FOUND"
    CONFLICT = "CONFLICT"
    RATE_LIMITED = "RATE_LIMITED"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class AppError(Exception):
    """Base class for every deliberate application error."""

    status_code: int = 400
    code: str = ErrorCode.VALIDATION_ERROR
    message: str = "Request failed"

    def __init__(
        self,
        message: str | None = None,
        *,
        details: dict[str, Any] | None = None,
        code: str | None = None,
        status_code: int | None = None,
    ) -> None:
        self.message = message or self.message
        self.details = details or {}
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code
        super().__init__(self.message)


class ValidationError(AppError):
    status_code = 422
    code = ErrorCode.VALIDATION_ERROR
    message = "Validation failed"


class UnauthorizedError(AppError):
    status_code = 401
    code = ErrorCode.UNAUTHORIZED
    message = "Authentication required"


class ForbiddenError(AppError):
    """Raised when an authenticated user may not touch someone else's resource.

    Spec section 24: ownership is checked on the server, never trusted from the
    client.
    """

    status_code = 403
    code = ErrorCode.FORBIDDEN
    message = "You do not have permission to perform this action"


class NotFoundError(AppError):
    status_code = 404
    code = ErrorCode.NOT_FOUND
    message = "Resource not found"

    def __init__(self, resource: str = "Resource", **kwargs: Any) -> None:
        super().__init__(f"{resource} not found", **kwargs)


class ConflictError(AppError):
    """Duplicate email, already-shared trip, date changes that orphan stops."""

    status_code = 409
    code = ErrorCode.CONFLICT
    message = "Request conflicts with the current state"


class RateLimitedError(AppError):
    status_code = 429
    code = ErrorCode.RATE_LIMITED
    message = "Too many requests. Please try again shortly."


class ServiceUnavailableError(AppError):
    """An optional external service (SMTP, ImageKit, Groq) is unreachable.

    Spec section 2.1 / 38: these must never block core trip functionality.
    """

    status_code = 503
    code = ErrorCode.SERVICE_UNAVAILABLE
    message = "This service is currently unavailable"
