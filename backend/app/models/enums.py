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
    # Adaptation. Kept as three distinct values rather than one "change"
    # bucket because the three land on different people: the request reaches
    # the operator, the decision reaches the traveller, and a disruption
    # reaches everyone whose tour it touches.
    CHANGE_REQUEST = "change_request"
    CHANGE_DECISION = "change_decision"
    DISRUPTION = "disruption"
    # Assist and review.
    ASSIST_REPLY = "assist_reply"
    REVIEW_REQUEST = "review_request"


class ChangeRequestType(str, Enum):
    """What kind of alteration a traveller (or a disruption) is proposing.

    The type decides which arithmetic runs: shifting a date reprices against
    the new date's availability, replacing a component costs a cancellation
    plus a new rate, cancelling costs only the cancellation. They are kept
    apart rather than folded into a generic "edit" because the impact of each
    is computed differently and explained differently.
    """

    DATE_SHIFT = "date_shift"
    REPLACE_COMPONENT = "replace_component"
    CANCEL_COMPONENT = "cancel_component"
    ADD_COMPONENT = "add_component"
    PARTY_SIZE = "party_size"


class ChangeRequestStatus(str, Enum):
    """Where a change stands between being asked for and taking effect.

    ``APPROVED`` and ``APPLIED`` are deliberately separate. Approval is the
    operator's decision; application is the transaction that moves money and
    rewrites the itinerary. Collapsing them would leave no way to represent an
    approved change whose application failed, which is exactly the state
    somebody has to go and fix.

    ``COUNTERED`` is the operator proposing something else -- the request goes
    back to the traveller with a different payload rather than being refused
    outright, which is what actually happens when a hotel is full but its
    sister property is not.
    """

    PENDING = "pending"
    APPROVED = "approved"
    COUNTERED = "countered"
    REJECTED = "rejected"
    APPLIED = "applied"
    WITHDRAWN = "withdrawn"


class DisruptionType(str, Enum):
    """What went wrong. Drives which components are considered at risk."""

    WEATHER = "weather"
    VENDOR_CANCELLATION = "vendor_cancellation"
    TRANSPORT_DELAY = "transport_delay"
    CLOSURE = "closure"
    SAFETY = "safety"
    MEDICAL = "medical"
    OTHER = "other"


class DisruptionSeverity(str, Enum):
    """How hard the disruption bites.

    ``CRITICAL`` is the threshold at which the engine stops suggesting and
    starts insisting: affected components are treated as unusable rather than
    merely risky.
    """

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class DisruptionStatus(str, Enum):
    """An incident's own lifecycle, separate from any change it causes.

    ``MITIGATING`` is the state that earns its keep: it says somebody has
    raised change requests against this incident but they have not all landed
    yet, which is the difference between "we know" and "we have handled it".
    """

    OPEN = "open"
    MITIGATING = "mitigating"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class ConflictSeverity(str, Enum):
    """How badly a detected conflict matters.

    Unlike every other enum in this module this one is **not** a database
    type. Conflicts are computed on read and reported inside an impact report
    or a warnings list; none is ever stored in a column of its own, so giving
    it a PostgreSQL type would create something nothing could ever be checked
    against.
    """

    INFO = "info"
    WARNING = "warning"
    BLOCKER = "blocker"


class AssistThreadStatus(str, Enum):
    """Where a support conversation stands.

    ``WAITING`` means the ball is with the traveller -- staff have answered and
    are waiting on a reply. Keeping it distinct from ``OPEN`` is what lets a
    coordinator's queue show only the threads that actually need them, rather
    than every conversation that has not been closed.
    """

    OPEN = "open"
    WAITING = "waiting"
    RESOLVED = "resolved"
    CLOSED = "closed"


class AssistSender(str, Enum):
    """Who wrote a message.

    ``AI`` is a first-class sender rather than a flag on a coordinator message.
    A traveller is entitled to know whether a person answered them, and an
    answer that only *looks* human is the one thing this feature must not do.
    """

    TRAVELLER = "traveller"
    COORDINATOR = "coordinator"
    AI = "ai"


class ReviewSubject(str, Enum):
    """What is being reviewed.

    Stored explicitly rather than inferred from whichever foreign key is set,
    so a query for "all vendor reviews" is an index lookup instead of a scan
    over four nullable columns.
    """

    TRIP = "trip"
    VENDOR = "vendor"
    SERVICE = "service"
    OPERATOR = "operator"
