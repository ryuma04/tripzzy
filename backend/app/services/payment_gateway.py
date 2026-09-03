"""A simulated payment gateway.

Deliberately simulated, not simplified. It walks the same states a real
processor does -- initiated → authorized → captured, with void and refund
paths -- because the surrounding code (refund arithmetic on cancellation,
partial refunds, the operator's ledger) has to be written against those
states regardless of who is moving the money. Swapping in Razorpay or Stripe
later means replacing this class, not the callers.

What it does *not* do is pretend to be a real processor: no card details are
accepted, stored, or validated. Callers pass a method label and nothing else.
"""

import random
import uuid
from dataclasses import dataclass
from decimal import Decimal

# Methods the demo offers. Purely labels -- no instrument data is handled.
SUPPORTED_METHODS = ("card", "upi", "netbanking", "wallet")


@dataclass(frozen=True)
class GatewayResult:
    approved: bool
    reference: str
    failure_reason: str | None = None


class SimulatedGateway:
    """Approves payments, unless asked to do otherwise.

    ``failure_rate`` exists so the unhappy path can be exercised on demand --
    a declined card is a state the booking flow has to handle, and a gateway
    that always says yes would let that code rot untested. It defaults to
    zero so a live demo never fails by surprise; the failure case is triggered
    explicitly rather than by luck.
    """

    def __init__(self, *, failure_rate: float = 0.0, seed: int | None = None) -> None:
        self.failure_rate = max(0.0, min(1.0, failure_rate))
        self._rng = random.Random(seed)

    def _reference(self, prefix: str) -> str:
        return f"{prefix}_{uuid.uuid4().hex[:16]}"

    def authorize(self, amount: Decimal, method: str) -> GatewayResult:
        """Reserve funds. Does not move them -- capture does that."""
        if amount <= 0:
            return GatewayResult(
                approved=False,
                reference=self._reference("auth"),
                failure_reason="Amount must be greater than zero",
            )
        if method not in SUPPORTED_METHODS:
            return GatewayResult(
                approved=False,
                reference=self._reference("auth"),
                failure_reason=f"Unsupported payment method: {method}",
            )
        if self.failure_rate and self._rng.random() < self.failure_rate:
            return GatewayResult(
                approved=False,
                reference=self._reference("auth"),
                failure_reason="Declined by issuing bank",
            )
        return GatewayResult(approved=True, reference=self._reference("auth"))

    def capture(self, authorization_reference: str) -> GatewayResult:
        """Settle previously authorised funds."""
        return GatewayResult(
            approved=True,
            reference=self._reference("cap"),
        )

    def refund(self, capture_reference: str, amount: Decimal) -> GatewayResult:
        """Return captured funds, in whole or in part."""
        if amount <= 0:
            return GatewayResult(
                approved=False,
                reference=self._reference("ref"),
                failure_reason="Refund amount must be greater than zero",
            )
        return GatewayResult(approved=True, reference=self._reference("ref"))
