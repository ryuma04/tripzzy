"""Enumerations shared by models and schemas.

Each is persisted as a native PostgreSQL ENUM so the database itself rejects
invalid values -- the last line of the three-layer validation described in the
implementation plan (Pydantic, service, database).
"""

from enum import Enum


class UserRole(str, Enum):
    USER = "user"
    ADMIN = "admin"


class UserStatus(str, Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    DELETED = "deleted"


class TripStatus(str, Enum):
    """Spec section 10.

    ``DRAFT`` is an explicit flag (refinement R3) because it cannot be derived
    from dates; the other three are always recomputed server-side on read and
    never trusted from the client.
    """

    DRAFT = "draft"
    UPCOMING = "upcoming"
    ONGOING = "ongoing"
    COMPLETED = "completed"


class ActivityCategory(str, Enum):
    ADVENTURE = "adventure"
    SIGHTSEEING = "sightseeing"
    FOOD = "food"
    CULTURE = "culture"
    NATURE = "nature"
    NIGHTLIFE = "nightlife"
    SHOPPING = "shopping"
    RELAXATION = "relaxation"
    OTHER = "other"


class ExpenseCategory(str, Enum):
    """The five buckets the budget breakdown in spec section 14 reports."""

    TRANSPORT = "transport"
    ACCOMMODATION = "accommodation"
    ACTIVITIES = "activities"
    MEALS = "meals"
    MISCELLANEOUS = "miscellaneous"


class TransportType(str, Enum):
    FLIGHT = "flight"
    TRAIN = "train"
    BUS = "bus"
    CAR = "car"
    FERRY = "ferry"
    OTHER = "other"
