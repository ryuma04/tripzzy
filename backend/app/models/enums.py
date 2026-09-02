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


class TravelStyle(str, Enum):
    """How a traveller wants the trip to feel.

    Part of the personalisation intake: the platform composes a tour around
    stated preferences rather than selling a fixed package.
    """

    SOLO = "solo"
    COUPLE = "couple"
    FAMILY = "family"
    FRIENDS = "friends"
    BUSINESS = "business"
    BACKPACKING = "backpacking"
    LUXURY = "luxury"


class TravelPace(str, Enum):
    """How much gets packed into a day.

    Feeds conflict detection: a ``RELAXED`` traveller with six activities
    booked in one day is a schedule worth warning about.
    """

    RELAXED = "relaxed"
    BALANCED = "balanced"
    PACKED = "packed"


class ComfortTier(str, Enum):
    """Shared scale for accommodation and transport class.

    One ladder for both keeps preference-matching comparable across component
    types when ranking alternatives.
    """

    BUDGET = "budget"
    STANDARD = "standard"
    PREMIUM = "premium"
    LUXURY = "luxury"


class TourGroupStatus(str, Enum):
    """Where a departure is in its own lifecycle.

    Distinct from any one booking's status: a group can be ``FULL`` while an
    individual traveller on it is still ``pending_payment``.
    """

    FORMING = "forming"
    CONFIRMED = "confirmed"
    FULL = "full"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class OperatorRole(str, Enum):
    """A staff member's standing within one tour operator.

    Separate from ``UserRole``: the same account can be an ordinary traveller
    on their own trips and a coordinator on their employer's.
    """

    OWNER = "owner"
    MANAGER = "manager"
    COORDINATOR = "coordinator"


class ServiceType(str, Enum):
    """What a vendor sells, and therefore what slot it can fill."""

    ACCOMMODATION = "accommodation"
    TRANSPORT = "transport"
    ACTIVITY = "activity"
    GUIDE = "guide"
    MEAL = "meal"
    OTHER = "other"


class BookingStatus(str, Enum):
    """A booking's position in the lifecycle.

    ``DRAFT`` is a quote nobody has committed to; it becomes
    ``PENDING_PAYMENT`` when the traveller places it, ``CONFIRMED`` once money
    is captured, and ``IN_PROGRESS`` while the tour is actually running.
    """

    DRAFT = "draft"
    PENDING_PAYMENT = "pending_payment"
    CONFIRMED = "confirmed"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class BookingItemStatus(str, Enum):
    """One component's own state, which can diverge from its booking's.

    A single hotel can fall through while the rest of the tour stands, so
    items carry their own status rather than inheriting the booking's.
    ``REPLACED`` records that an item was swapped out during adaptation --
    the row survives so the change has an auditable before and after.
    """

    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    REPLACED = "replaced"


class PaymentKind(str, Enum):
    DEPOSIT = "deposit"
    INSTALMENT = "instalment"
    FULL = "full"
    REFUND = "refund"


class PaymentStatus(str, Enum):
    """The gateway state machine, simulated but not simplified.

    Authorisation and capture are kept distinct because refund arithmetic
    depends on the difference: an authorised-but-uncaptured payment is voided,
    a captured one is refunded.
    """

    INITIATED = "initiated"
    AUTHORIZED = "authorized"
    CAPTURED = "captured"
    FAILED = "failed"
    REFUNDED = "refunded"


class AIPlanType(str, Enum):
    """Which of the two generated options a trip was built from.

    ``/trips/generate-options`` always returns a budget and a premium plan;
    recording the choice lets the trip explain its own provenance instead of
    hiding it in a prose ``description`` prefix.
    """

    BUDGET = "budget"
    PREMIUM = "premium"


class BillSplitStatus(str, Enum):
    PENDING = "pending"
    SETTLED = "settled"


class SplitMemberStatus(str, Enum):
    """One member's position within a split.

    ``OWES`` is distinct from ``PENDING``: pending means nothing has been
    recorded yet, owes means a partial payment landed and a balance remains.
    """

    PENDING = "pending"
    OWES = "owes"
    PAID = "paid"


class NotificationType(str, Enum):
    BILL_SPLIT = "bill_split"
    BILL_SPLIT_SETTLED = "bill_split_settled"
    TRIP_REMINDER = "trip_reminder"
    SYSTEM = "system"
