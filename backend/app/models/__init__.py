"""Model package.

Importing every model here guarantees they are all registered on ``Base``
before Alembic autogenerate inspects the metadata.
"""

from app.models.destination import ActivityCatalog, Destination, SavedDestination
from app.models.enums import (
    ActivityCategory,
    ExpenseCategory,
    TransportType,
    TripStatus,
    UserRole,
    UserStatus,
)
from app.models.itinerary import ItineraryActivity
from app.models.logistics import Accommodation, Expense, Transport
from app.models.trip import Trip, TripStop
from app.models.user import (
    EmailVerificationCode,
    RevokedToken,
    User,
    UserPreference,
)

__all__ = [
    "Accommodation",
    "ActivityCatalog",
    "ActivityCategory",
    "Destination",
    "EmailVerificationCode",
    "Expense",
    "ExpenseCategory",
    "ItineraryActivity",
    "RevokedToken",
    "SavedDestination",
    "Transport",
    "TransportType",
    "Trip",
    "TripStatus",
    "TripStop",
    "User",
    "UserPreference",
    "UserRole",
    "UserStatus",
]
