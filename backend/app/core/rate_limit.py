"""In-process sliding-window rate limiter (refinement R5).

Deliberately dependency-free: no Redis, so the core app keeps working with
only PostgreSQL running (spec section 2.1). The trade-off is that limits are
per-process, which is fine for this deployment; a multi-worker production
setup would swap the backing store for Redis behind the same interface.
"""

import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import Request

from app.core.config import settings
from app.core.exceptions import RateLimitedError


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str, *, limit: int, window_seconds: int) -> None:
        """Record a hit for ``key``, raising if it exceeds ``limit``."""
        now = time.monotonic()
        cutoff = now - window_seconds

        with self._lock:
            bucket = self._hits[key]
            while bucket and bucket[0] < cutoff:
                bucket.popleft()

            if len(bucket) >= limit:
                retry_after = max(1, int(bucket[0] + window_seconds - now) + 1)
                raise RateLimitedError(
                    "Too many attempts. Please wait before trying again.",
                    details={"retry_after_seconds": retry_after},
                )

            bucket.append(now)

            # Opportunistic cleanup so idle keys do not accumulate forever.
            if len(self._hits) > 10_000:
                for stale in [k for k, v in self._hits.items() if not v]:
                    del self._hits[stale]

    def reset(self, key: str | None = None) -> None:
        """Clear one key, or everything. Used by the test suite."""
        with self._lock:
            if key is None:
                self._hits.clear()
            else:
                self._hits.pop(key, None)


limiter = SlidingWindowLimiter()


def _client_ip(request: Request) -> str:
    # Only trust X-Forwarded-For if explicitly configured to run behind a trusted reverse proxy
    # AND the immediate socket connection is from an address in TRUSTED_PROXIES.
    # Otherwise, fallback strictly to the socket connection address to prevent spoofing.
    client_host = request.client.host if request.client else "unknown"
    if settings.BEHIND_TRUSTED_PROXY:
        trusted = settings.trusted_proxy_list
        if not trusted or client_host in trusted:
            forwarded = request.headers.get("x-forwarded-for")
            if forwarded:
                return forwarded.split(",")[0].strip()
    return client_host


def rate_limit_auth(request: Request) -> None:
    """Dependency guarding /auth/login and /auth/register."""
    if not settings.RATE_LIMIT_ENABLED:
        return
    key = f"auth:{_client_ip(request)}:{request.url.path}"
    limiter.check(
        key, limit=settings.AUTH_RATE_LIMIT_PER_MINUTE, window_seconds=60
    )
