"""Change request, impact report and disruption schemas.

The interesting validation here is on the **proposal**. A change request's
payload has a different shape for each ``type`` -- a date shift needs a number
of days, a replacement needs a service id -- and the alternative to validating
that per type is a wide model of mostly-optional fields where any combination
parses and the service layer discovers the mistake with a ``KeyError``.

So the proposal is validated against its own type before it reaches the
engine, and a request that cannot possibly be assessed is refused at the door
with a message naming the field that is missing.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import (
    ChangeRequestStatus,
    ChangeRequestType,
    DisruptionSeverity,
    DisruptionStatus,
    DisruptionType,
)

# What each change type requires in its proposal. Kept as data rather than a
# chain of ``if`` statements so the error message can name the missing field
# without a branch per type.
REQUIRED_PROPOSAL_FIELDS: dict[ChangeRequestType, tuple[str, ...]] = {
    ChangeRequestType.DATE_SHIFT: ("shift_days",),
    ChangeRequestType.REPLACE_COMPONENT: ("booking_item_id",),
    ChangeRequestType.CANCEL_COMPONENT: ("booking_item_id",),
    ChangeRequestType.ADD_COMPONENT: ("service_id", "service_date"),
    ChangeRequestType.PARTY_SIZE: ("traveller_count",),
}


class ChangeProposal(BaseModel):
    """The union of every proposal shape, checked against its own type.

    ``REPLACE_COMPONENT`` deliberately allows ``new_service_id`` to be absent:
    that is the "find me something else" case, and the engine answers it with a
    ranked shortlist rather than a quote.
    """

    # date_shift
    shift_days: Annotated[int | None, Field(ge=-365, le=365)] = None
    # replace / cancel
    booking_item_id: uuid.UUID | None = None
    new_service_id: uuid.UUID | None = None
    new_date: date | None = None
    # add
    service_id: uuid.UUID | None = None
    service_date: date | None = None
    stop_id: uuid.UUID | None = None
    quantity: Annotated[int | None, Field(ge=1, le=50)] = None
    units: Annotated[int | None, Field(ge=1, le=365)] = None
    # party size
    traveller_count: Annotated[int | None, Field(ge=1, le=50)] = None

    def validated_for(self, change_type: ChangeRequestType) -> dict[str, Any]:
        missing = [
            field
            for field in REQUIRED_PROPOSAL_FIELDS[change_type]
            if getattr(self, field, None) is None
        ]
        if missing:
            raise ValueError(
                f"A {change_type.value} proposal needs: {', '.join(missing)}"
            )
        return self.model_dump(exclude_none=True)


class AssessRequest(BaseModel):
    """Preview a change. Writes nothing."""

    type: ChangeRequestType
    proposal: ChangeProposal

    @model_validator(mode="after")
    def _shape_matches_type(self) -> "AssessRequest":
        self.proposal.validated_for(self.type)
        return self


class ChangeRequestCreate(AssessRequest):
    reason: Annotated[str | None, Field(max_length=2000)] = None


class DecisionRequest(BaseModel):
    """An operator's verdict on one request."""

    action: Literal["approve", "counter", "reject"]
    note: Annotated[str | None, Field(max_length=2000)] = None
    # Only meaningful with ``counter``: the operator's alternative, re-costed
    # against the traveller before it goes back to them.
    counter_proposal: ChangeProposal | None = None

    @model_validator(mode="after")
    def _counter_needs_a_proposal(self) -> "DecisionRequest":
        if self.action == "counter" and self.counter_proposal is None:
            raise ValueError("Countering needs an alternative proposal to offer")
        return self


# --------------------------------------------------------------------------
# Responses
# --------------------------------------------------------------------------


class ConflictOut(BaseModel):
    code: str
    severity: str
    message: str
    entity: str | None = None
    entity_id: str | None = None
    on_date: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class CostImpact(BaseModel):
    original_total: str
    refund_total: str
    penalty_total: str
    replacement_total: str
    net_delta: str
    direction: Literal["increase", "decrease", "none"]


class AffectedItemOut(BaseModel):
    item_id: str
    title: str
    component_type: str
    service_date: str
    action: str
    original_cost: str
    refund: str
    penalty: str
    replacement_cost: str
    new_date: str | None = None
    new_service_id: str | None = None
    new_title: str | None = None
    note: str | None = None


class ImpactReportOut(BaseModel):
    """The engine's answer, as stored and as previewed.

    ``alternatives`` carries the ranked options straight from the inventory
    ranker, including each one's score breakdown, so the UI can explain *why*
    an option is recommended instead of asking anyone to trust the order.
    """

    change_type: str
    currency: str
    feasible: bool
    summary: str
    cost: CostImpact
    affected_items: list[AffectedItemOut] = []
    conflicts: list[ConflictOut] = []
    availability: list[dict[str, Any]] = []
    alternatives: list[dict[str, Any]] = []
    preference_fit: dict[str, Any] | None = None
    blockers: list[str] = []
    generated_at: str | None = None


class AssessResponse(BaseModel):
    trip_id: uuid.UUID
    impact: ImpactReportOut
    # Present only when narration was requested and succeeded; the report
    # stands on its own without it.
    ai_summary: str | None = None


class ChangeRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    trip_id: uuid.UUID
    trip_title: str | None = None
    booking_id: uuid.UUID | None = None
    booking_item_id: uuid.UUID | None = None
    booking_item_title: str | None = None
    operator_id: uuid.UUID | None = None
    disruption_id: uuid.UUID | None = None
    disruption_title: str | None = None
    requested_by_id: uuid.UUID
    requested_by_name: str | None = None
    type: ChangeRequestType
    status: ChangeRequestStatus
    reason: str | None = None
    proposal: dict[str, Any]
    impact: ImpactReportOut | None = None
    ai_summary: str | None = None
    net_cost_delta: Decimal
    currency: str
    review_note: str | None = None
    decided_at: datetime | None = None
    applied_at: datetime | None = None
    applied_result: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class DisruptionCreate(BaseModel):
    """Raise an incident.

    Every scope field is optional and each one *narrows*: a disruption with
    only a city and a date range catches everything in that city on those days,
    which is what a weather alert actually means. One with none of them would
    catch the operator's entire book, so at least one is required.
    """

    type: DisruptionType = DisruptionType.OTHER
    severity: DisruptionSeverity = DisruptionSeverity.MEDIUM
    title: Annotated[str, Field(min_length=3, max_length=160)]
    description: Annotated[str | None, Field(max_length=4000)] = None
    city: Annotated[str | None, Field(max_length=100)] = None
    trip_id: uuid.UUID | None = None
    booking_id: uuid.UUID | None = None
    service_id: uuid.UUID | None = None
    from_date: date | None = None
    to_date: date | None = None
    notify: bool = True

    @model_validator(mode="after")
    def _must_be_scoped(self) -> "DisruptionCreate":
        if not any(
            (self.city, self.trip_id, self.booking_id, self.service_id)
        ):
            raise ValueError(
                "A disruption needs a scope: a city, a trip, a booking or a "
                "service"
            )
        if self.from_date and self.to_date and self.from_date > self.to_date:
            raise ValueError("from_date cannot be after to_date")
        return self


class DisruptionStatusRequest(BaseModel):
    status: DisruptionStatus


class DisruptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    operator_id: uuid.UUID | None
    trip_id: uuid.UUID | None
    booking_id: uuid.UUID | None
    service_id: uuid.UUID | None
    city: str | None
    from_date: date | None
    to_date: date | None
    type: DisruptionType
    severity: DisruptionSeverity
    status: DisruptionStatus
    title: str
    description: str | None
    assessment: dict[str, Any] | None
    change_request_count: int = 0
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ConflictCheckResponse(BaseModel):
    """A standing health check on one trip.

    Reported, never enforced -- the database already rejects data that is
    invalid; these are arrangements that are merely unwise.
    """

    trip_id: uuid.UUID
    conflicts: list[ConflictOut]
    blockers: int
    warnings: int
    notes: int
