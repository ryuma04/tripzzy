"""Model package.

Importing every model here guarantees they are all registered on ``Base``
before Alembic autogenerate inspects the metadata.
"""

from app.models.billing import BillSplit, BillSplitMember
from app.models.booking import Booking, BookingItem, Payment
from app.models.destination import ActivityCatalog, Destination, SavedDestination
from app.models.enums import (
    ActivityCategory,
    AIPlanType,
    BillSplitStatus,
    BookingItemStatus,
    BookingStatus,
    ComfortTier,
    ExpenseCategory,
    NotificationType,
    OperatorRole,
    PaymentKind,
    PaymentStatus,
    ServiceType,
    SplitMemberStatus,
    TourGroupStatus,
    TransportType,
    TravelPace,
    TravelStyle,
    TripStatus,
    UserRole,
    UserStatus,
)
from app.models.itinerary import ItineraryActivity
from app.models.logistics import Accommodation, Expense, Transport
from app.models.notification import Notification
from app.models.operations import (
    Operator,
    OperatorMember,
    ServiceAvailability,
    TourGroup,
    TourGroupMember,
    Vendor,
    VendorService,
)
from app.models.trip import Trip, TripStop
from app.models.user import (
    EmailVerificationCode,
    RevokedToken,
    User,
    UserPreference,
)

__all__ = [
    "AIPlanType",
    "Accommodation",
    "ActivityCatalog",
    "ActivityCategory",
    "BillSplit",
    "BillSplitMember",
    "BillSplitStatus",
    "Booking",
    "BookingItem",
    "BookingItemStatus",
    "BookingStatus",
    "ComfortTier",
    "Destination",
    "EmailVerificationCode",
    "Expense",
    "ExpenseCategory",
    "ItineraryActivity",
    "Notification",
    "NotificationType",
    "Operator",
    "OperatorMember",
    "OperatorRole",
    "Payment",
    "PaymentKind",
    "PaymentStatus",
    "RevokedToken",
    "SavedDestination",
    "ServiceAvailability",
    "ServiceType",
    "SplitMemberStatus",
    "Transport",
    "TourGroup",
    "TourGroupMember",
    "TourGroupStatus",
    "TransportType",
    "TravelPace",
    "TravelStyle",
    "Trip",
    "TripStatus",
    "TripStop",
    "User",
    "UserPreference",
    "UserRole",
    "UserStatus",
    "Vendor",
    "VendorService",
]
